"""Lambda entry point for the weekly monitoring cycle.

This is the function the brief's "monitoring and evaluation pipeline" requirement
points at, and it is built around one finding that shaped the whole design.

**Outcome monitoring is structurally six weeks behind its own cause.** The 30 day
label does not exist for 30 days and the 60 day label does not exist for 60. When
Austin's shelter changed shape in March 2020, performance monitoring could not
have known until May at the earliest. Input drift knew in March. So this job
computes both and treats input drift as the leading indicator rather than as a
supporting chart.

**Discrimination and calibration fail separately, and here calibration failed
first and harder.** Across the 2020 shift the model's ability to rank animals
barely moved: mean monthly AUC was 0.778 before and 0.789 after. What broke was
the numbers. In July 2020 it predicted a 30 day adoption rate 7.6 points above
what happened. A dashboard watching AUC alone would have shown a healthy model for
months while the figures on the shelter's screen quietly stopped meaning anything.
Both are alarmed here, and the calibration alarm is not the secondary one.

**Three classes of feature will break a naive drift detector, and all three are
excluded rather than tuned around.** Features monotone in calendar time have an
unbounded PSI against any earlier reference. Shelter-level covariates are near
constant within a quarter, so their PSI saturates on a change a director would
call an ordinary month. Calendar-cycle features drift against the previous quarter
by construction. The first are not in the deployed model at all, the second are
measured as a relative level change instead, and the third is why the reference
window is the same quarter a year earlier rather than the quarter just gone.

The language model appears here in the role the brief describes: a second opinion
on an alert that a human still has to act on. It never decides anything.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from .drift import (
    DriftThresholds,
    classify,
    feature_drift_report,
    performance_report,
)

log = logging.getLogger()
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

PROJECT_NAME = os.environ.get("PROJECT_NAME", "secondchance")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")
CURATED_BUCKET = os.environ.get("CURATED_BUCKET", "")
ARTIFACT_BUCKET = os.environ.get("ARTIFACT_BUCKET", "")
ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN", "")
BASELINE_STATS_KEY = os.environ.get("BASELINE_STATS_KEY", "monitoring/baseline_statistics.json")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")
TRAINING_FUNCTION_NAME = os.environ.get(
    "TRAINING_FUNCTION_NAME", f"{PROJECT_NAME}-start-training-{ENVIRONMENT}"
)

REDSHIFT_WORKGROUP = os.environ.get("REDSHIFT_WORKGROUP", f"{PROJECT_NAME}-{ENVIRONMENT}-wg")
REDSHIFT_DATABASE = os.environ.get("REDSHIFT_DATABASE", PROJECT_NAME)
METRIC_NAMESPACE = f"SecondChance/{ENVIRONMENT}"

# Features that get a distributional test. Deliberately not every feature in the
# model: see the module docstring for the three classes that are excluded and why.
NUMERIC_MONITORED = [
    "age_at_intake_days",
    "breed_size_ordinal",
    "breed_weight_lb",
    "prior_intake_count",
]
CATEGORICAL_MONITORED = [
    "animal_type",
    "age_band",
    "intake_type",
    "intake_condition",
    "is_sterilized_at_intake",
    "name_is_shelter_assigned",
    "breed_is_bully_type",
]
# Measured as a relative change in level rather than by PSI. Every animal arriving
# in a given week shares almost the same value for these, so the quantile bins are
# razor thin and PSI saturates on a shift that is operationally unremarkable.
SHELTER_LEVEL_FEATURES = [
    "shelter_census_at_intake",
    "species_census_at_intake",
    "intakes_prior_7d",
    "intakes_prior_30d",
    "adoptions_prior_30d",
]
LEVEL_CHANGE_WARNING = 0.15
LEVEL_CHANGE_CRITICAL = 0.30

# Below this many labelled rows the performance half of the report is not computed
# at all. An AUC on forty animals is noise dressed up as a finding, and a
# monitoring job that publishes one teaches people to ignore it.
MIN_LABELLED_ROWS = 300


def _boto(service: str):
    import boto3

    return boto3.client(service)


def _alert(subject: str, message: str) -> None:
    if not ALERT_TOPIC_ARN:
        log.warning("%s: %s", subject, message)
        return
    _boto("sns").publish(TopicArn=ALERT_TOPIC_ARN, Subject=subject[:100], Message=message)


def _query(sql: str) -> pd.DataFrame:
    """Run a query through the Redshift Data API and return it as a frame."""
    client = _boto("redshift-data")
    statement_id = client.execute_statement(
        WorkgroupName=REDSHIFT_WORKGROUP, Database=REDSHIFT_DATABASE, Sql=sql
    )["Id"]

    deadline = time.time() + 600
    while time.time() < deadline:
        described = client.describe_statement(Id=statement_id)
        if described["Status"] == "FINISHED":
            break
        if described["Status"] in {"FAILED", "ABORTED"}:
            raise RuntimeError(f"Monitoring query failed: {described.get('Error')}")
        time.sleep(2)
    else:
        raise RuntimeError("Monitoring query did not finish within 600s")

    columns: list[str] = []
    rows: list[list[Any]] = []
    token = None
    while True:
        page = (
            client.get_statement_result(Id=statement_id, NextToken=token)
            if token
            else client.get_statement_result(Id=statement_id)
        )
        if not columns:
            columns = [c["name"] for c in page["ColumnMetadata"]]
        for record in page["Records"]:
            rows.append(
                [
                    None
                    if "isNull" in cell
                    else cell.get(
                        "stringValue",
                        cell.get("longValue", cell.get("doubleValue", cell.get("booleanValue"))),
                    )
                    for cell in record
                ]
            )
        token = page.get("NextToken")
        if not token:
            break
    return pd.DataFrame(rows, columns=columns)


def _load_baseline() -> dict[str, Any]:
    """Read the reference distribution the drift tests compare against.

    Published by scripts/publish_baseline.py from the validation block, not from
    whatever the model happened to see last week. A rolling reference drifts along
    with the data and never notices anything, which is the most common way a drift
    detector ends up decorative.
    """
    body = _boto("s3").get_object(Bucket=CURATED_BUCKET, Key=BASELINE_STATS_KEY)["Body"].read()
    baseline: dict[str, Any] = json.loads(body)
    return baseline


def _publish_metrics(metrics: dict[str, float]) -> None:
    """Send the run's headline numbers to CloudWatch, where the alarms live."""
    data = [
        {
            "MetricName": name,
            "Value": float(value),
            "Unit": "None",
            "Timestamp": datetime.now(UTC),
            "Dimensions": [{"Name": "Environment", "Value": ENVIRONMENT}],
        }
        for name, value in metrics.items()
        if value is not None and np.isfinite(value)
    ]
    for start in range(0, len(data), 20):
        _boto("cloudwatch").put_metric_data(
            Namespace=METRIC_NAMESPACE, MetricData=data[start : start + 20]
        )


def _level_change_report(baseline: dict[str, Any], current: pd.DataFrame) -> list[dict[str, Any]]:
    """Compare shelter-level covariates by relative change in their mean.

    The reason this is not PSI is measured rather than assumed. In the 2020 test
    block, ``intakes_prior_7d`` fell 36.8 percent, which is a real and important
    change, and PSI reported the same saturated CRITICAL it reported for a 10
    percent move. A percentage a shelter director can argue with beats a number
    that is always at its ceiling.
    """
    rows: list[dict[str, Any]] = []
    for column in SHELTER_LEVEL_FEATURES:
        reference_mean = baseline.get("shelter_level_means", {}).get(column)
        if reference_mean in (None, 0) or column not in current.columns:
            continue
        values = pd.to_numeric(current[column], errors="coerce").dropna()
        if len(values) < 20:
            rows.append({"feature": column, "status": "INSUFFICIENT_DATA"})
            continue
        change = (values.mean() - reference_mean) / abs(reference_mean)
        rows.append(
            {
                "feature": column,
                "reference_mean": round(float(reference_mean), 2),
                "current_mean": round(float(values.mean()), 2),
                "relative_change": round(float(change), 4),
                "status": classify(abs(change), LEVEL_CHANGE_WARNING, LEVEL_CHANGE_CRITICAL),
            }
        )
    return rows


def _llm_review(summary: dict[str, Any]) -> dict[str, str]:
    """Ask a language model for a second opinion on the alert.

    Its job is narrow and stated in the prompt: read the numbers, say whether they
    describe a model problem or a world problem, and name the one check a human
    should do first. It does not decide whether to retrain, it cannot change the
    status, and its answer is stored beside the numbers rather than in place of
    them.

    That distinction is the whole reason it is defensible here. A monitoring alert
    that says "PSI 0.317 on intake_type" is correct and useless at 7am; one that
    adds "the intake mix shifted, which is consistent with an operational change
    rather than a broken feed, so check the shelter's intake policy before
    retraining" is a starting point. A human still has to agree.
    """
    prompt = (
        "You are reviewing an automated monitoring alert for a model that predicts how "
        "long an animal will wait for adoption at a municipal shelter. The model is used "
        "to route staff attention toward animals expected to wait longest. It is never "
        "used to withhold care.\n\n"
        "Here are this week's monitoring numbers:\n\n"
        f"{json.dumps(summary, indent=2, default=str)}\n\n"
        "Answer in three short parts, as JSON with keys verdict, reasoning, first_check.\n"
        "  verdict: one of MODEL_PROBLEM, WORLD_PROBLEM, DATA_PIPELINE_PROBLEM, or BENIGN.\n"
        "  reasoning: two sentences at most. Say which specific numbers drove your answer.\n"
        "  first_check: the single thing a human should look at first.\n\n"
        "Two things to weigh. Discrimination and calibration fail for different reasons: a "
        "stable AUC with a growing calibration gap usually means the base rate moved rather "
        "than that the model broke. And the outcome labels lag their own cause by 30 to 60 "
        "days, so a clean performance section on a recent window may simply mean the labels "
        "have not arrived. Do not recommend retraining; that is a human decision."
    )
    try:
        response = _boto("bedrock-runtime").invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 800,
                    "temperature": 0,
                    "messages": [{"role": "user", "content": prompt}],
                }
            ).encode("utf-8"),
        )
        text = json.loads(response["body"].read())["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            text = text[4:] if text.startswith("json") else text
        parsed = json.loads(text.strip())
        return {
            "verdict": str(parsed.get("verdict", "UNKNOWN"))[:24],
            "reasoning": str(parsed.get("reasoning", ""))[:2000],
            "first_check": str(parsed.get("first_check", ""))[:1000],
        }
    except Exception as error:
        # A failed second opinion must not fail the monitoring run. The numbers are
        # the alert; this is commentary on it.
        log.warning("LLM review unavailable: %s", error)
        return {"verdict": "UNAVAILABLE", "reasoning": str(error)[:500], "first_check": ""}


def run_monitoring_cycle(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Run one weekly monitoring cycle and publish its verdict.

    Args:
        event: optionally ``{"dry_run": true}`` to compute everything and publish
            metrics without sending an alert or writing a run record, and
            ``{"window_days": 90}`` to change the comparison window.
        context: the Lambda context, unused.

    Returns:
        The full report: the drift table, the level-change table, the performance
        table when it could be computed, the overall status and the language
        model's second opinion.
    """
    dry_run = bool(event.get("dry_run", False))
    window_days = int(event.get("window_days", 90))
    run_id = uuid.uuid4().hex
    now = datetime.now(UTC)
    window_start = (now - timedelta(days=window_days)).date()

    thresholds = DriftThresholds(
        psi_warning=float(os.environ.get("PSI_WARNING", 0.10)),
        psi_critical=float(os.environ.get("PSI_CRITICAL", 0.25)),
        auc_relative_drop_warning=float(os.environ.get("AUC_RELATIVE_DROP_WARNING", 0.03)),
        auc_relative_drop_critical=float(os.environ.get("AUC_RELATIVE_DROP_CRITICAL", 0.07)),
    )

    baseline = _load_baseline()
    reference = pd.DataFrame(baseline["reference_sample"])
    current = _query(
        f"SELECT * FROM analytics.v_monitoring_input WHERE scored_at >= '{window_start}'"
    )

    report: dict[str, Any] = {
        "run_id": run_id,
        "ran_at": now.isoformat(),
        "window_start": str(window_start),
        "window_end": str(now.date()),
        "model_version": baseline.get("model_version", "unknown"),
        "baseline_block": baseline.get("block", "unknown"),
        "n_scored": len(current),
    }

    if current.empty:
        # Nothing scored at all is itself the alert. A quiet dashboard because the
        # pipeline stopped looks identical to a quiet dashboard because nothing is
        # wrong, and only one of those is fine.
        report["overall_status"] = "CRITICAL"
        report["reason"] = "no predictions were served in the monitoring window"
        if not dry_run:
            _alert("SecondChance: no predictions in the monitoring window", json.dumps(report, indent=2))
        return report

    # --- input drift, the leading indicator ---------------------------------
    drift = feature_drift_report(
        reference,
        current,
        [c for c in NUMERIC_MONITORED if c in current.columns and c in reference.columns],
        [c for c in CATEGORICAL_MONITORED if c in current.columns and c in reference.columns],
        thresholds,
    )
    report["feature_drift"] = drift.to_dict(orient="records")
    report["max_feature_psi"] = float(drift["psi"].max()) if len(drift) else float("nan")
    report["mean_feature_psi"] = float(drift["psi"].mean()) if len(drift) else float("nan")
    report["worst_drifting_feature"] = (
        str(drift.iloc[0]["feature"]) if len(drift) else None
    )
    report["n_features_critical"] = int((drift["status"] == "CRITICAL").sum()) if len(drift) else 0

    # --- shelter-level covariates, measured as a level change ---------------
    level_changes = _level_change_report(baseline, current)
    report["shelter_level_changes"] = level_changes

    # --- performance, the lagging indicator ---------------------------------
    labelled = current.loc[current["label_status"] == "labelled"].copy()
    report["n_labelled"] = len(labelled)
    report["label_coverage"] = round(len(labelled) / len(current), 4)

    if len(labelled) < MIN_LABELLED_ROWS:
        report["performance"] = None
        report["performance_status"] = "INSUFFICIENT_DATA"
        # This is expected rather than alarming for a recent window, and saying so
        # is what stops someone reading a missing number as a passing one.
        report["performance_note"] = (
            f"only {len(labelled)} of {len(current)} scored rows have resolved labels. "
            "The 30 day label does not exist for 30 days, so outcome monitoring on a "
            "recent window is structurally incomplete rather than broken."
        )
    else:
        labelled["period"] = pd.to_datetime(labelled["scored_at"]).dt.to_period("M").astype(str)
        labelled["y"] = pd.to_numeric(labelled["realised_adopted_within_30d"], errors="coerce")
        labelled["p"] = pd.to_numeric(labelled["p_adopt_30d"], errors="coerce")
        labelled = labelled.dropna(subset=["y", "p"])

        performance = performance_report(
            labelled,
            "y",
            "p",
            "period",
            baseline_auc=float(baseline["validation_roc_auc"]),
            thresholds=thresholds,
        )
        report["performance"] = performance.to_dict(orient="records")
        measurable = performance.loc[performance["status"] != "INSUFFICIENT_DATA"]
        report["rolling_roc_auc"] = (
            float(measurable["roc_auc"].mean()) if len(measurable) else float("nan")
        )
        report["rolling_brier"] = (
            float(measurable["brier"].mean()) if len(measurable) else float("nan")
        )
        report["calibration_gap"] = (
            float(measurable["calibration_gap"].abs().max()) if len(measurable) else float("nan")
        )
        report["auc_relative_drop"] = (
            float(measurable["auc_relative_drop"].max()) if len(measurable) else float("nan")
        )
        severity = {"OK": 0, "WARNING": 1, "CRITICAL": 2, "INSUFFICIENT_DATA": 0}
        report["performance_status"] = (
            max(measurable["status"], key=lambda s: severity[s]) if len(measurable) else "INSUFFICIENT_DATA"
        )

    # --- the verdict ---------------------------------------------------------
    severity = {"OK": 0, "INSUFFICIENT_DATA": 0, "WARNING": 1, "CRITICAL": 2}
    statuses = [
        classify(report["max_feature_psi"], thresholds.psi_warning, thresholds.psi_critical),
        report["performance_status"],
        *[row["status"] for row in level_changes],
    ]
    report["overall_status"] = max(statuses, key=lambda s: severity.get(s, 0))
    report["component_statuses"] = statuses

    # Which of the two failed, which is the distinction the paper spends a section
    # on and the one a person reading the alert at 7am most needs.
    gap = report.get("calibration_gap")
    drop = report.get("auc_relative_drop")
    if gap is not None and drop is not None and np.isfinite(gap) and np.isfinite(drop):
        if gap >= thresholds.calibration_gap_critical and drop < thresholds.auc_relative_drop_warning:
            report["failure_mode"] = "calibration_only"
        elif gap < thresholds.calibration_gap_warning and drop >= thresholds.auc_relative_drop_critical:
            report["failure_mode"] = "discrimination_only"
        elif gap >= thresholds.calibration_gap_warning and drop >= thresholds.auc_relative_drop_warning:
            report["failure_mode"] = "both"
        else:
            report["failure_mode"] = "neither"
    else:
        report["failure_mode"] = "not_measurable"

    _publish_metrics(
        {
            "MaxFeaturePSI": report["max_feature_psi"],
            "MeanFeaturePSI": report["mean_feature_psi"],
            "FeaturesCritical": report["n_features_critical"],
            "RollingRocAuc": report.get("rolling_roc_auc", float("nan")),
            "CalibrationGap": report.get("calibration_gap", float("nan")),
            "AucRelativeDrop": report.get("auc_relative_drop", float("nan")),
            "LabelCoverage": report["label_coverage"],
            "PredictionsScored": report["n_scored"],
            "StatusSeverity": severity.get(report["overall_status"], 0),
        }
    )

    if report["overall_status"] in {"WARNING", "CRITICAL"}:
        review = _llm_review(
            {
                key: report[key]
                for key in [
                    "window_start", "window_end", "n_scored", "n_labelled", "label_coverage",
                    "max_feature_psi", "worst_drifting_feature", "n_features_critical",
                    "shelter_level_changes", "rolling_roc_auc", "calibration_gap",
                    "auc_relative_drop", "failure_mode", "overall_status",
                ]
                if key in report
            }
        )
    else:
        review = {"verdict": "NOT_REQUESTED", "reasoning": "status was OK", "first_check": ""}
    report["llm_review"] = review

    if dry_run:
        log.info("Dry run complete: %s", report["overall_status"])
        report["dry_run"] = True
        return report

    _boto("s3").put_object(
        Bucket=CURATED_BUCKET,
        Key=f"monitoring/runs/{now:%Y/%m}/{run_id}.json",
        Body=json.dumps(report, indent=2, default=str).encode("utf-8"),
        ContentType="application/json",
    )

    if report["overall_status"] != "OK":
        _alert(
            f"SecondChance monitoring: {report['overall_status']}",
            "\n".join(
                [
                    f"Window {report['window_start']} to {report['window_end']}",
                    f"Model {report['model_version']}",
                    f"Worst drifting feature: {report['worst_drifting_feature']} "
                    f"(PSI {report['max_feature_psi']:.3f})",
                    f"Failure mode: {report['failure_mode']}",
                    f"Label coverage: {report['label_coverage']:.0%}",
                    "",
                    f"Automated second opinion ({review['verdict']}): {review['reasoning']}",
                    f"Check first: {review['first_check']}",
                    "",
                    "No model has been promoted or retired by this alert. A person decides.",
                ]
            ),
        )

    log.info(
        "Monitoring run %s: %s (PSI %.3f, coverage %.0f%%)",
        run_id,
        report["overall_status"],
        report["max_feature_psi"],
        report["label_coverage"] * 100,
    )
    return report
