"""API Gateway handler: the only thing the website is allowed to talk to.

Five routes, documented in website_build_package/API_CONTRACT.md and mirrored
exactly by the OpenAPI file the front end generates its client from.

Two rules are enforced here rather than trusted to the caller:

Every response carries model_version and data_as_of. A dashboard that shows a
number without saying how old it is will eventually show a stale number
confidently, and a shelter will act on it. The website is required to render both.

No route returns a euthanasia recommendation, a "do not treat" flag, or anything
that could be read as one. The scores in this system exist to route attention
toward animals, never away from them. That is written into the model card, and
this file is where it is actually enforced.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

log = logging.getLogger()
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

ENDPOINT_NAME = os.environ.get("SAGEMAKER_ENDPOINT_NAME", "")
MODEL_VERSION_TABLE = os.environ.get("MODEL_VERSION_TABLE", "")
PREDICTION_LOG_STREAM = os.environ.get("PREDICTION_LOG_STREAM", "")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
}

# Fields the caller must supply for a single animal prediction. Anything else is
# derived server side, so the website cannot accidentally change the meaning of a
# feature by computing it differently from the training pipeline.
REQUIRED_FIELDS = {"animal_type", "intake_type", "intake_condition", "sex_upon_intake", "breed"}

# The banner text the website is contractually required to display alongside any
# score. Serving it from the API means it cannot drift out of sync with the model
# card, and it cannot be quietly deleted from the front end without the change
# showing up in a diff of this file.
USE_POLICY = {
    "intended_use": (
        "Prioritise photography, foster placement, behaviour support, adoption "
        "events and outreach for animals the model expects to wait longest."
    ),
    "prohibited_use": (
        "This score must never inform euthanasia, intake refusal, or any decision "
        "that reduces the care an animal receives. A low predicted adoption "
        "probability is a request for more help, not less."
    ),
}


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body, default=str)}


def _boto(service: str):
    import boto3

    return boto3.client(service)


def _current_model_metadata() -> dict[str, Any]:
    """Read the deployed model's identity and the freshness of its inputs.

    Falls back to an explicit "unknown" rather than a plausible guess. A dashboard
    that says "unknown" gets fixed; one that says "up to date" because a lookup
    quietly failed does not.
    """
    if not MODEL_VERSION_TABLE:
        return {"model_version": "unknown", "data_as_of": None, "status": "unconfigured"}
    try:
        item = (
            _boto("dynamodb")
            .get_item(TableName=MODEL_VERSION_TABLE, Key={"model_key": {"S": "current"}})
            .get("Item", {})
        )
        return {
            "model_version": item.get("model_version", {}).get("S", "unknown"),
            "data_as_of": item.get("data_as_of", {}).get("S"),
            "trained_at": item.get("trained_at", {}).get("S"),
            "validation_roc_auc": float(item.get("validation_roc_auc", {}).get("N", "nan")),
            "status": "ok",
        }
    except Exception as error:
        log.error("Could not read model metadata: %s", error)
        return {"model_version": "unknown", "data_as_of": None, "status": "lookup_failed"}


def _invoke_endpoint(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Send a batch of feature dictionaries to the SageMaker endpoint."""
    payload = json.dumps({"instances": records}).encode("utf-8")
    response = _boto("sagemaker-runtime").invoke_endpoint(
        EndpointName=ENDPOINT_NAME,
        ContentType="application/json",
        Accept="application/json",
        Body=payload,
    )
    predictions: list[dict[str, Any]] = json.loads(response["Body"].read())["predictions"]
    return predictions


def _log_predictions(records: list[dict[str, Any]], predictions: list[dict[str, Any]], model_version: str) -> None:
    """Write every served prediction to Kinesis for later drift analysis.

    Best effort on purpose: if the log stream is unavailable, the shelter still
    gets its answer. Losing a monitoring record is a much smaller problem than
    failing a request the staff are waiting on.
    """
    if not PREDICTION_LOG_STREAM:
        return
    try:
        entries = [
            {
                "Data": json.dumps(
                    {
                        "scored_at": datetime.now(UTC).isoformat(),
                        "model_version": model_version,
                        "features": record,
                        "prediction": prediction,
                    },
                    default=str,
                ).encode("utf-8"),
                "PartitionKey": str(record.get("animal_id", "unknown")),
            }
            for record, prediction in zip(records, predictions, strict=False)
        ]
        for start in range(0, len(entries), 500):
            _boto("kinesis").put_records(
                StreamName=PREDICTION_LOG_STREAM, Records=entries[start : start + 500]
            )
    except Exception as error:
        log.warning("Prediction logging failed, continuing: %s", error)


def _validate(record: dict[str, Any]) -> list[str]:
    missing = sorted(REQUIRED_FIELDS - set(record))
    problems = [f"missing required field: {name}" for name in missing]
    age = record.get("age_at_intake_days")
    if age is not None:
        try:
            value = float(age)
            if value < 0 or value > 12000:
                problems.append("age_at_intake_days outside the plausible range 0 to 12000")
        except (TypeError, ValueError):
            problems.append("age_at_intake_days must be a number")
    return problems


def _handle_predict(body: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    record = body.get("animal", body)
    problems = _validate(record)
    if problems:
        return _response(400, {"error": "validation_failed", "details": problems})

    started = time.time()
    predictions = _invoke_endpoint([record])
    _log_predictions([record], predictions, metadata["model_version"])
    prediction = predictions[0]

    return _response(
        200,
        {
            "prediction": {
                "p_adopt_7d": prediction.get("p_adopt_7d"),
                "p_adopt_14d": prediction.get("p_adopt_14d"),
                "p_adopt_30d": prediction.get("p_adopt_30d"),
                "p_long_stay_60d": prediction.get("p_long_stay_60d"),
                "expected_days_in_shelter": prediction.get("expected_days_in_shelter"),
                "survival_curve": prediction.get("survival_curve"),
                "drivers": prediction.get("drivers", []),
                # The interval is as important as the point estimate. A shelter
                # deciding where to send a volunteer deserves to know when the
                # model is guessing.
                "confidence": prediction.get("confidence", "unknown"),
            },
            "model_version": metadata["model_version"],
            "data_as_of": metadata["data_as_of"],
            "use_policy": USE_POLICY,
            "latency_ms": round((time.time() - started) * 1000, 1),
        },
    )


def _handle_batch(body: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    records = body.get("animals", [])
    if not isinstance(records, list) or not records:
        return _response(400, {"error": "validation_failed", "details": ["animals must be a non-empty list"]})
    if len(records) > 500:
        return _response(
            413,
            {
                "error": "batch_too_large",
                "details": ["send at most 500 animals per request"],
                "hint": "The needs-attention queue endpoint is the cheaper way to score a whole shelter.",
            },
        )

    problems = {i: _validate(r) for i, r in enumerate(records)}
    invalid = {i: p for i, p in problems.items() if p}
    if invalid:
        return _response(400, {"error": "validation_failed", "details": invalid})

    predictions = _invoke_endpoint(records)
    _log_predictions(records, predictions, metadata["model_version"])
    return _response(
        200,
        {
            "predictions": predictions,
            "count": len(predictions),
            "model_version": metadata["model_version"],
            "data_as_of": metadata["data_as_of"],
            "use_policy": USE_POLICY,
        },
    )


def _handle_queue(query: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    """Return the ranked needs-attention queue from the curated layer.

    Reads a precomputed table rather than scoring on the fly. The queue changes
    once a day at most, and recomputing it on every page load would spend money to
    produce the same answer.
    """
    limit = min(int(query.get("limit", 25)), 200)
    species = query.get("species")
    key = "queue/needs_attention_latest.json"
    try:
        raw = _boto("s3").get_object(Bucket=os.environ["CURATED_BUCKET"], Key=key)["Body"].read()
        queue = json.loads(raw)
    except Exception as error:
        log.error("Queue read failed: %s", error)
        return _response(503, {"error": "queue_unavailable", "details": [str(error)]})

    animals = queue.get("animals", [])
    if species:
        animals = [a for a in animals if a.get("animal_type", "").lower() == species.lower()]

    return _response(
        200,
        {
            "animals": animals[:limit],
            "total_available": len(animals),
            "generated_at": queue.get("generated_at"),
            "model_version": metadata["model_version"],
            "data_as_of": metadata["data_as_of"],
            "use_policy": USE_POLICY,
        },
    )


def _handle_animal(animal_id: str, metadata: dict[str, Any]) -> dict[str, Any]:
    try:
        raw = (
            _boto("s3")
            .get_object(Bucket=os.environ["CURATED_BUCKET"], Key=f"animals/{animal_id}.json")["Body"]
            .read()
        )
    except Exception:
        return _response(404, {"error": "not_found", "animal_id": animal_id})
    return _response(
        200,
        {
            "animal": json.loads(raw),
            "model_version": metadata["model_version"],
            "data_as_of": metadata["data_as_of"],
            "use_policy": USE_POLICY,
        },
    )


def lambda_handler(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Route an HTTP API v2 event to the right handler."""
    route = event.get("routeKey", "")
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": CORS_HEADERS, "body": ""}

    metadata = _current_model_metadata()

    if route.endswith("/v1/health"):
        healthy = metadata["status"] == "ok"
        return _response(
            200 if healthy else 503,
            {
                "status": "healthy" if healthy else "degraded",
                "model_version": metadata["model_version"],
                "data_as_of": metadata["data_as_of"],
                "checked_at": datetime.now(UTC).isoformat(),
            },
        )

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "invalid_json"})

    query = event.get("queryStringParameters") or {}
    path_parameters = event.get("pathParameters") or {}

    try:
        if route.endswith("/v1/predict"):
            return _handle_predict(body, metadata)
        if route.endswith("/v1/predict/batch"):
            return _handle_batch(body, metadata)
        if route.endswith("/v1/queue/needs-attention"):
            return _handle_queue(query, metadata)
        if "/v1/animals/" in route:
            return _handle_animal(path_parameters.get("animalId", ""), metadata)
    except Exception as error:
        log.exception("Unhandled error on %s", route)
        return _response(500, {"error": "internal_error", "message": str(error)})

    return _response(404, {"error": "unknown_route", "route": route})
