"""Lambda entry points for the training and warehouse pipeline.

Three functions, in the order they run:

``rebuild_warehouse`` runs the staging, episode and analytics SQL against Redshift
Serverless. It refuses to advance past a step whose audit query says something is
wrong, because a bad episode build is silent everywhere downstream.

``start_training_job`` launches a SageMaker training job for one target. It does
not wait for it: a Lambda that sits blocked for twenty minutes is a Lambda paying
for twenty minutes of nothing.

``register_trained_model`` runs when the job finishes. It compares the challenger
against the deployed champion and either registers it as pending approval or
records why it was rejected.

The decision that shaped all three: **training is transient, not persistent.** No
notebook instance, no always-on endpoint. A training job on ml.m5.xlarge costs
about six cents and the endpoint is created for a demonstration and deleted after.
That is the difference between thirty four dollars a month and two hundred, and it
is why this project can honestly claim to be deployable by a student.

The other decision worth stating: **a model is never promoted automatically.**
``MODEL_APPROVAL_MODE`` defaults to manual, and the gate below has a worked example
in the paper where the automatic rule would have made the wrong call. The code
computes the comparison and writes down what it would do; a person decides.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import UTC, datetime
from typing import Any

log = logging.getLogger()
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

PROJECT_NAME = os.environ.get("PROJECT_NAME", "secondchance")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")
CURATED_BUCKET = os.environ.get("CURATED_BUCKET", "")
ARTIFACT_BUCKET = os.environ.get("ARTIFACT_BUCKET", "")
ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN", "")
SAGEMAKER_ROLE_ARN = os.environ.get("SAGEMAKER_ROLE_ARN", "")
MODEL_PACKAGE_GROUP = os.environ.get("MODEL_PACKAGE_GROUP", "")
TRAINING_INSTANCE_TYPE = os.environ.get("TRAINING_INSTANCE_TYPE", "ml.m5.xlarge")
MODEL_APPROVAL_MODE = os.environ.get("MODEL_APPROVAL_MODE", "manual")
DATA_CUTOFF_DATE = os.environ.get("DATA_CUTOFF_DATE", "2022-03-04")

REDSHIFT_WORKGROUP = os.environ.get("REDSHIFT_WORKGROUP", f"{PROJECT_NAME}-{ENVIRONMENT}-wg")
REDSHIFT_DATABASE = os.environ.get("REDSHIFT_DATABASE", PROJECT_NAME)

# Targets the pipeline knows how to train. Adding one here is not enough on its
# own: the label has to exist in analytics.shelter_episodes too, which is why the
# list is checked rather than trusted.
KNOWN_TARGETS = (
    "adopted_within_7d",
    "adopted_within_14d",
    "adopted_within_30d",
    "long_stay_60d",
)

# How much better a challenger has to be before the gate even considers it. Set
# from the measured paired-bootstrap interval width on the test block, so a
# difference inside the noise never reads as an improvement.
MIN_AUC_IMPROVEMENT = 0.005
# And how much worse its calibration is allowed to get regardless of AUC. A model
# that ranks marginally better while its probabilities drift is the failure this
# project spends a whole section on.
MAX_ECE_REGRESSION = 0.010


def _boto(service: str):
    import boto3

    return boto3.client(service)


def _alert(subject: str, message: str) -> None:
    """Publish to SNS, falling back to a log line when the topic is unset."""
    if not ALERT_TOPIC_ARN:
        log.warning("%s: %s", subject, message)
        return
    _boto("sns").publish(TopicArn=ALERT_TOPIC_ARN, Subject=subject[:100], Message=message)


# -----------------------------------------------------------------------------
# Warehouse rebuild
# -----------------------------------------------------------------------------


def _execute_sql(sql: str, parameters: dict[str, str] | None = None) -> str:
    """Submit one statement to the Redshift Data API and return its id."""
    request: dict[str, Any] = {
        "WorkgroupName": REDSHIFT_WORKGROUP,
        "Database": REDSHIFT_DATABASE,
        "Sql": sql,
    }
    if parameters:
        request["Parameters"] = [{"name": k, "value": str(v)} for k, v in parameters.items()]
    statement_id: str = _boto("redshift-data").execute_statement(**request)["Id"]
    return statement_id


def _wait_for(statement_id: str, timeout_seconds: int = 600) -> dict[str, Any]:
    """Poll a statement to completion.

    Args:
        statement_id: the id returned by :func:`_execute_sql`.
        timeout_seconds: give up after this long rather than run to the Lambda's
            own timeout, so the failure names itself.

    Returns:
        The final describe_statement response.

    Raises:
        RuntimeError: if the statement failed, was aborted, or timed out.
    """
    client = _boto("redshift-data")
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        described: dict[str, Any] = client.describe_statement(Id=statement_id)
        status = described["Status"]
        if status == "FINISHED":
            return described
        if status in {"FAILED", "ABORTED"}:
            raise RuntimeError(f"Statement {statement_id} {status}: {described.get('Error')}")
        time.sleep(2)
    raise RuntimeError(f"Statement {statement_id} did not finish within {timeout_seconds}s")


def _scalar(sql: str) -> float | None:
    """Run a one-cell query and return the value, or None if it returned no rows."""
    statement_id = _execute_sql(sql)
    _wait_for(statement_id)
    result = _boto("redshift-data").get_statement_result(Id=statement_id)
    records = result.get("Records", [])
    if not records:
        return None
    cell = records[0][0]
    if "isNull" in cell:
        return None
    raw = cell.get("longValue", cell.get("doubleValue", cell.get("stringValue")))
    return float(raw) if raw is not None else None


def rebuild_warehouse(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Run the staging, episode and analytics transforms in order, with gates.

    Each step is followed by the audit query that decides whether the next one is
    allowed to run. The gates matter more than the transforms: a wrong episode
    build produces durations that look entirely plausible and quietly poisons
    every number downstream, so it has to be caught here rather than noticed in a
    results table three weeks later.

    Args:
        event: optionally ``{"data_cutoff": "YYYY-MM-DD", "skip_gates": false}``.
        context: the Lambda context, unused.

    Returns:
        The step results and the episode audit counts.

    Raises:
        RuntimeError: if a gate fails. Failing loudly here is the point.
    """
    cutoff = event.get("data_cutoff", DATA_CUTOFF_DATE)
    skip_gates = bool(event.get("skip_gates", False))
    pipeline_version = event.get("pipeline_version", f"warehouse-{datetime.now(UTC):%Y%m%d}")

    s3 = _boto("s3")
    steps: list[dict[str, Any]] = []

    def run_file(key: str, parameters: dict[str, str] | None = None) -> None:
        sql = s3.get_object(Bucket=CURATED_BUCKET, Key=f"sql/{key}")["Body"].read().decode("utf-8")
        started = time.time()
        _wait_for(_execute_sql(sql, parameters), timeout_seconds=900)
        steps.append({"step": key, "seconds": round(time.time() - started, 1)})
        log.info("Completed %s", key)

    run_file("02_staging.sql")

    if not skip_gates:
        # Nothing may be lost between raw and staging. The view returns rows only
        # when the counts disagree, so any row at all is a failure.
        lost = _scalar("SELECT COUNT(*) FROM staging.v_row_count_reconciliation")
        if lost:
            raise RuntimeError(
                f"Staging lost rows relative to raw ({int(lost)} feeds disagree). "
                "Refusing to build episodes on an incomplete load."
            )

    run_file("03_episodes.sql", {"data_cutoff": cutoff, "pipeline_version": pipeline_version})

    audit: dict[str, Any] = {}
    if not skip_gates:
        for name, sql in {
            "episodes_built": "SELECT episodes_built FROM analytics.v_episode_audit",
            "episodes_matched": "SELECT episodes_matched FROM analytics.v_episode_audit",
            "negative_durations": "SELECT negative_durations FROM analytics.v_episode_audit",
            "species_mismatches": "SELECT COUNT(*) FROM analytics.v_species_mismatches",
        }.items():
            audit[name] = _scalar(sql)

        if audit["negative_durations"]:
            raise RuntimeError(
                f"{int(audit['negative_durations'])} episodes have a negative duration. "
                "The pairing is wrong and nothing downstream should be trusted."
            )
        if audit["species_mismatches"]:
            # A dog on the way in and a cat on the way out means two animals got
            # joined together. This has returned zero on every export to date.
            raise RuntimeError(
                f"{int(audit['species_mismatches'])} episodes change species between "
                "intake and outcome. The join is matching the wrong rows."
            )
        matched_share = (audit["episodes_matched"] or 0) / max(audit["episodes_built"] or 1, 1)
        if matched_share < 0.90:
            raise RuntimeError(
                f"Only {matched_share:.1%} of episodes closed, against roughly 99 percent "
                "historically. Either the outcomes feed is short or the pairing broke."
            )

    run_file("04_analytics.sql")

    log.info("Warehouse rebuilt: %s", audit)
    return {
        "status": "ok",
        "data_cutoff": cutoff,
        "pipeline_version": pipeline_version,
        "steps": steps,
        "audit": audit,
        "gates_checked": not skip_gates,
    }


# -----------------------------------------------------------------------------
# Training
# -----------------------------------------------------------------------------


def start_training_job(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Launch one SageMaker training job and return immediately.

    Args:
        event: ``{"target": "adopted_within_30d", "data_cutoff": "2022-03-04"}``.
            An event with no target trains all four, which is what the weekly
            schedule sends.
        context: the Lambda context, unused.

    Returns:
        The job names that were started.

    Raises:
        ValueError: if a target is named that the pipeline does not know how to
            train. Guessing would produce a model against a column that does not
            exist, twenty minutes later.
    """
    targets = [event["target"]] if "target" in event else list(KNOWN_TARGETS)
    unknown = [t for t in targets if t not in KNOWN_TARGETS]
    if unknown:
        raise ValueError(f"Unknown training target(s) {unknown}; known targets are {KNOWN_TARGETS}")

    cutoff = event.get("data_cutoff", DATA_CUTOFF_DATE)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    client = _boto("sagemaker")
    started = []

    for target in targets:
        job_name = f"{PROJECT_NAME}-{target.replace('_', '-')}-{stamp}"[:63]
        client.create_training_job(
            TrainingJobName=job_name,
            AlgorithmSpecification={
                "TrainingImage": event.get(
                    "training_image",
                    os.environ.get("TRAINING_IMAGE", ""),
                ),
                "TrainingInputMode": "File",
                # Emitted by the training script so the console shows the numbers
                # that actually matter rather than only the loss.
                "MetricDefinitions": [
                    {"Name": "validation:roc_auc", "Regex": "validation_roc_auc=([0-9\\.]+)"},
                    {"Name": "validation:pr_auc", "Regex": "validation_pr_auc=([0-9\\.]+)"},
                    {"Name": "validation:brier", "Regex": "validation_brier=([0-9\\.]+)"},
                    {"Name": "validation:ece", "Regex": "validation_ece=([0-9\\.]+)"},
                ],
            },
            RoleArn=SAGEMAKER_ROLE_ARN,
            InputDataConfig=[
                {
                    "ChannelName": "training",
                    "DataSource": {
                        "S3DataSource": {
                            "S3DataType": "S3Prefix",
                            "S3Uri": f"s3://{CURATED_BUCKET}/features/episodes/",
                            "S3DataDistributionType": "FullyReplicated",
                        }
                    },
                    "ContentType": "application/x-parquet",
                }
            ],
            OutputDataConfig={"S3OutputPath": f"s3://{ARTIFACT_BUCKET}/models/{target}/"},
            ResourceConfig={
                "InstanceType": TRAINING_INSTANCE_TYPE,
                "InstanceCount": 1,
                "VolumeSizeInGB": 30,
            },
            # Twenty minutes is roughly four times the observed runtime. A job that
            # exceeds it has hung, and paying for a hung instance until someone
            # notices is exactly the kind of cost this design avoids.
            StoppingCondition={"MaxRuntimeInSeconds": 1200},
            HyperParameters={
                "target": target,
                "data_cutoff": cutoff,
                "model": event.get("model", "lightgbm"),
                "random_seed": "20260820",
                "calibration": "isotonic",
            },
            Tags=[
                {"Key": "Project", "Value": PROJECT_NAME},
                {"Key": "Environment", "Value": ENVIRONMENT},
                {"Key": "Target", "Value": target},
                {"Key": "DataCutoff", "Value": cutoff},
            ],
        )
        started.append({"target": target, "training_job_name": job_name})
        log.info("Started training job %s for %s", job_name, target)

    return {"status": "started", "jobs": started, "data_cutoff": cutoff}


def _champion_metrics(target: str) -> dict[str, float] | None:
    """Read the currently deployed model's validation metrics, if there is one."""
    try:
        body = (
            _boto("s3")
            .get_object(Bucket=ARTIFACT_BUCKET, Key=f"registry/champion_{target}.json")["Body"]
            .read()
        )
    except Exception:
        return None
    metrics: dict[str, float] = json.loads(body)
    return metrics


def evaluate_promotion(
    champion: dict[str, float] | None, challenger: dict[str, float]
) -> dict[str, Any]:
    """Decide whether a challenger should replace the champion, and say why.

    Two conditions, both required. The AUC has to improve by more than the width
    of the noise, and the calibration must not get materially worse. The second is
    the one that does the work: a model that ranks marginally better while its
    probabilities drift upward is worse in the only way that reaches a person,
    because the number on the shelter's screen gets read as a percentage.

    Pure and side-effect free so it can be tested directly, which matters because
    this is the one function in the file whose logic a reviewer will want to argue
    with.

    Args:
        champion: the deployed model's validation metrics, or None on first run.
        challenger: the newly trained model's validation metrics.

    Returns:
        A verdict dict with the decision, the two deltas, and the reason.
    """
    if champion is None:
        return {
            "decision": "PROMOTE",
            "reason": "no champion deployed yet",
            "auc_delta": None,
            "ece_delta": None,
        }

    auc_delta = challenger["roc_auc"] - champion["roc_auc"]
    ece_delta = challenger["ece"] - champion["ece"]

    if ece_delta > MAX_ECE_REGRESSION:
        return {
            "decision": "REJECT",
            "reason": (
                f"calibration regressed by {ece_delta:.4f}, above the {MAX_ECE_REGRESSION} "
                "ceiling. A better ranking does not buy a worse probability."
            ),
            "auc_delta": round(auc_delta, 5),
            "ece_delta": round(ece_delta, 5),
        }
    if auc_delta < MIN_AUC_IMPROVEMENT:
        return {
            "decision": "REJECT",
            "reason": (
                f"AUC improved by only {auc_delta:.4f}, inside the {MIN_AUC_IMPROVEMENT} "
                "noise floor measured by the paired bootstrap."
            ),
            "auc_delta": round(auc_delta, 5),
            "ece_delta": round(ece_delta, 5),
        }
    return {
        "decision": "PROMOTE",
        "reason": f"AUC +{auc_delta:.4f} with calibration change {ece_delta:+.4f}",
        "auc_delta": round(auc_delta, 5),
        "ece_delta": round(ece_delta, 5),
    }


def register_trained_model(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Register a finished training job and record the promotion verdict.

    Registration is not deployment. The model package is created with
    ``PendingManualApproval`` unless ``MODEL_APPROVAL_MODE`` is explicitly set to
    ``auto``, and even then the verdict is written down first.

    The paper has the worked example for why: on the 2020 retraining exercise the
    automatic rule would have promoted a challenger that scored better on a window
    the champion had never been calibrated for, which was a property of the
    evaluation window rather than of the model.

    Args:
        event: an EventBridge SageMaker training job state change, or
            ``{"training_job_name": "...", "target": "..."}`` for a manual run.
        context: the Lambda context, unused.

    Returns:
        The verdict, the model package ARN if one was created, and the metrics.
    """
    detail = event.get("detail", event)
    job_name = detail.get("TrainingJobName") or detail.get("training_job_name")
    if not job_name:
        raise ValueError("register_trained_model needs a training job name")

    sagemaker = _boto("sagemaker")
    described = sagemaker.describe_training_job(TrainingJobName=job_name)
    status = described["TrainingJobStatus"]
    target = described["HyperParameters"].get("target", detail.get("target", "unknown"))

    if status != "Completed":
        _alert(
            f"SecondChance: training job {status}",
            f"{job_name} finished with status {status}: "
            f"{described.get('FailureReason', 'no reason given')}",
        )
        return {"status": status, "training_job_name": job_name, "registered": False}

    metrics = {
        m["MetricName"].split(":")[-1]: float(m["Value"])
        for m in described.get("FinalMetricDataList", [])
    }
    if "roc_auc" not in metrics:
        raise RuntimeError(f"{job_name} completed without emitting validation:roc_auc")
    metrics.setdefault("ece", float("inf"))

    verdict = evaluate_promotion(_champion_metrics(target), metrics)
    model_version = f"{target}-{datetime.now(UTC):%Y%m%d}-{uuid.uuid4().hex[:8]}"

    approval = (
        "Approved"
        if verdict["decision"] == "PROMOTE" and MODEL_APPROVAL_MODE == "auto"
        else "PendingManualApproval"
    )

    package_arn = None
    if verdict["decision"] == "PROMOTE":
        response = sagemaker.create_model_package(
            ModelPackageGroupName=MODEL_PACKAGE_GROUP,
            ModelPackageDescription=(
                f"{target}, trained {job_name}, "
                f"validation AUC {metrics['roc_auc']:.4f}, ECE {metrics['ece']:.4f}. "
                f"{verdict['reason']}"
            ),
            ModelApprovalStatus=approval,
            InferenceSpecification={
                "Containers": [
                    {
                        "Image": described["AlgorithmSpecification"]["TrainingImage"],
                        "ModelDataUrl": described["ModelArtifacts"]["S3ModelArtifacts"],
                    }
                ],
                "SupportedContentTypes": ["application/json"],
                "SupportedResponseMIMETypes": ["application/json"],
            },
            CustomerMetadataProperties={
                "model_version": model_version,
                "target": target,
                "data_cutoff": described["HyperParameters"].get("data_cutoff", DATA_CUTOFF_DATE),
                "random_seed": described["HyperParameters"].get("random_seed", ""),
                "validation_roc_auc": f"{metrics['roc_auc']:.5f}",
                "validation_ece": f"{metrics['ece']:.5f}",
                "model_card_uri": f"s3://{ARTIFACT_BUCKET}/model_cards/{model_version}.md",
                "promotion_reason": verdict["reason"],
            },
        )
        package_arn = response["ModelPackageArn"]

    # The verdict is written down whichever way it went. A rejected challenger is
    # a result, and losing it means the next person cannot tell whether the model
    # has stopped improving or nobody has tried.
    _boto("s3").put_object(
        Bucket=ARTIFACT_BUCKET,
        Key=f"registry/decisions/{model_version}.json",
        Body=json.dumps(
            {
                "model_version": model_version,
                "target": target,
                "training_job_name": job_name,
                "decided_at": datetime.now(UTC).isoformat(),
                "challenger_metrics": metrics,
                "verdict": verdict,
                "approval_status": approval,
                "approval_mode": MODEL_APPROVAL_MODE,
            },
            indent=2,
        ).encode("utf-8"),
        ContentType="application/json",
    )

    _alert(
        f"SecondChance: {verdict['decision']} for {target}",
        f"{job_name}\nAUC {metrics['roc_auc']:.4f}, ECE {metrics['ece']:.4f}\n"
        f"{verdict['reason']}\nApproval status: {approval}",
    )

    log.info("%s for %s: %s", verdict["decision"], target, verdict["reason"])
    return {
        "status": "Completed",
        "training_job_name": job_name,
        "target": target,
        "model_version": model_version,
        "metrics": metrics,
        "verdict": verdict,
        "approval_status": approval,
        "model_package_arn": package_arn,
        "registered": package_arn is not None,
    }
