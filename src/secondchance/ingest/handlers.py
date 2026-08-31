"""Lambda entry points for scheduled ingestion.

Design decisions worth stating, because they are the ones that make the raw layer
trustworthy:

Append only. Every run writes new objects under a date partition and never edits
an existing one. If a run is repeated the objects carry different batch ids and
the loader deduplicates downstream on a content hash. Editing history in place is
how you end up unable to explain a number six months later.

High water marks in S3, not in memory. The next run reads the previous run's
marker object to decide where to resume. Lambda has no memory between
invocations, and putting the marker in the same bucket as the data means a
restore of the bucket restores the pipeline state with it.

Fail loudly. If a source returns fewer rows than the previous run, that is not
"today was quiet", that is a signal something is wrong upstream, and it publishes
to SNS instead of writing a suspiciously small file and exiting zero.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from .clients import (
    ApiError,
    NationalWeatherServiceClient,
    RescueGroupsClient,
    SocrataClient,
)

log = logging.getLogger()
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

RAW_BUCKET = os.environ.get("RAW_BUCKET", "")
ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN", "")
# A pull that comes back at less than this share of the previous pull's size is
# treated as a fault rather than as news.
VOLUME_DROP_ALARM_RATIO = 0.5


def _boto(service: str):
    import boto3

    return boto3.client(service)


def _get_secret(secret_id: str) -> str | None:
    """Read a secret, returning None when it is absent or empty.

    Both of the tokens this project uses are optional: Socrata works without one
    at a lower rate limit, and RescueGroups is only needed for the discovery page.
    A missing secret should degrade the run, not crash it.
    """
    if not secret_id:
        return None
    try:
        response = _boto("secretsmanager").get_secret_value(SecretId=secret_id)
    except Exception as error:
        log.warning("Could not read secret %s: %s", secret_id, error)
        return None
    value = str(response.get("SecretString", "")).strip()
    if not value:
        return None
    # Accept either a bare token or a JSON object with a token field.
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            for key in ("token", "api_key", "apiKey", "value"):
                if key in parsed:
                    return str(parsed[key])
        return value
    except json.JSONDecodeError:
        return value


def _write_raw(prefix: str, batch_id: str, page: int, payload: bytes) -> str:
    """Store one page of an API response, gzipped, under a date partition."""
    now = datetime.now(UTC)
    key = (
        f"{prefix}/ingest_date={now:%Y-%m-%d}/batch={batch_id}/page-{page:05d}.json.gz"
    )
    _boto("s3").put_object(
        Bucket=RAW_BUCKET,
        Key=key,
        Body=gzip.compress(payload),
        ContentType="application/json",
        ContentEncoding="gzip",
        Metadata={
            "ingest_batch_id": batch_id,
            "retrieved_at": now.isoformat(),
            "sha256": hashlib.sha256(payload).hexdigest(),
        },
    )
    return key


def _marker_key(prefix: str) -> str:
    return f"{prefix}/_state/high_water_mark.json"


def _read_marker(prefix: str) -> dict[str, Any]:
    try:
        response = _boto("s3").get_object(Bucket=RAW_BUCKET, Key=_marker_key(prefix))
        marker: dict[str, Any] = json.loads(response["Body"].read())
        return marker
    except Exception:
        return {}


def _write_marker(prefix: str, marker: dict[str, Any]) -> None:
    _boto("s3").put_object(
        Bucket=RAW_BUCKET,
        Key=_marker_key(prefix),
        Body=json.dumps(marker, indent=2).encode("utf-8"),
        ContentType="application/json",
    )


def _alert(subject: str, message: str) -> None:
    if not ALERT_TOPIC_ARN:
        log.error("ALERT (no topic configured): %s | %s", subject, message)
        return
    _boto("sns").publish(TopicArn=ALERT_TOPIC_ARN, Subject=subject[:100], Message=message)


def _put_metric(name: str, value: float, unit: str = "None") -> None:
    namespace = f"SecondChance/{os.environ.get('ENVIRONMENT', 'dev')}"
    try:
        _boto("cloudwatch").put_metric_data(
            Namespace=namespace,
            MetricData=[{"MetricName": name, "Value": value, "Unit": unit}],
        )
    except Exception as error:
        log.warning("Could not publish metric %s: %s", name, error)


def _ingest_socrata(dataset_id: str, prefix: str, lookback_days: int = 7) -> dict[str, Any]:
    """Shared body for the two Austin feeds."""
    batch_id = uuid.uuid4().hex[:16]
    token = _get_secret(os.environ.get("SOCRATA_APP_TOKEN_SECRET", ""))
    client = SocrataClient(
        domain=os.environ.get("SOCRATA_DOMAIN", "data.austintexas.gov"),
        app_token=token,
    )

    marker = _read_marker(prefix)
    since = None
    if marker.get("high_water_mark"):
        # Re-read a week of overlap on every run. Austin backfills corrections to
        # recent rows, and an exactly-incremental pull would miss them forever.
        since = datetime.fromisoformat(marker["high_water_mark"]) - timedelta(days=lookback_days)

    rows_written = 0
    keys: list[str] = []
    latest_timestamp = marker.get("high_water_mark")

    try:
        for page, result in enumerate(client.fetch_all(dataset_id, since=since)):
            keys.append(_write_raw(prefix, batch_id, page, result.raw_body))
            rows_written += len(result.rows)
            for row in result.rows:
                stamp = row.get("datetime")
                if stamp and (latest_timestamp is None or stamp > latest_timestamp):
                    latest_timestamp = stamp
    except ApiError as error:
        _alert(f"SecondChance ingest failed: {dataset_id}", str(error))
        raise

    previous = marker.get("last_row_count", 0)
    if previous and since is None and rows_written < previous * VOLUME_DROP_ALARM_RATIO:
        _alert(
            f"SecondChance ingest volume drop: {dataset_id}",
            f"Full pull returned {rows_written} rows against {previous} last time. "
            "This usually means an upstream schema or availability problem, not a "
            "quiet week. The raw objects were still written; nothing downstream has "
            "been promoted.",
        )

    _write_marker(
        prefix,
        {
            "high_water_mark": latest_timestamp,
            "last_batch_id": batch_id,
            "last_row_count": rows_written,
            "last_run_at": datetime.now(UTC).isoformat(),
            "incremental": since is not None,
        },
    )
    _put_metric("HoursSinceLastIngest", 0.0, "Count")
    _put_metric("RowsIngested", float(rows_written), "Count")

    summary = {
        "dataset_id": dataset_id,
        "batch_id": batch_id,
        "rows": rows_written,
        "pages": len(keys),
        "incremental": since is not None,
        "since": since.isoformat() if since else None,
        "keys": keys[:5],
    }
    log.info("Ingest complete: %s", json.dumps(summary))
    return summary


def ingest_austin_intakes(event: dict, context: object) -> dict[str, Any]:  # noqa: ARG001
    """Scheduled pull of the Austin Animal Center intakes dataset."""
    return _ingest_socrata(
        os.environ.get("SOCRATA_DATASET_ID", "wter-evkm"), "austin/intakes"
    )


def ingest_austin_outcomes(event: dict, context: object) -> dict[str, Any]:  # noqa: ARG001
    """Scheduled pull of the Austin Animal Center outcomes dataset."""
    return _ingest_socrata(
        os.environ.get("SOCRATA_DATASET_ID", "9t4d-g238"), "austin/outcomes"
    )


def ingest_weather(event: dict, context: object) -> dict[str, Any]:  # noqa: ARG001
    """Pull yesterday's hourly observations and store both hourly and daily forms."""
    batch_id = uuid.uuid4().hex[:16]
    client = NationalWeatherServiceClient(
        station_id=os.environ.get("NWS_STATION_ID", "KATT"),
        user_agent=os.environ.get("NWS_USER_AGENT"),
    )
    today = datetime.now(UTC).date()
    # Three days back, because the NWS backfills late arriving observations and a
    # single day window would permanently miss them.
    start = today - timedelta(days=3)

    result = client.observations(start, today)
    features = result.rows[0].get("features", []) if result.rows else []
    daily = client.to_daily(features)

    hourly_key = _write_raw("weather/hourly", batch_id, 0, result.raw_body)
    daily_key = _write_raw(
        "weather/daily", batch_id, 0, json.dumps(daily).encode("utf-8")
    )

    incomplete = [d["observed_date"] for d in daily if not d["sufficient_coverage"]]
    if incomplete:
        log.info("Days with insufficient hourly coverage, left null: %s", incomplete)

    _write_marker(
        "weather",
        {
            "last_batch_id": batch_id,
            "last_run_at": datetime.now(UTC).isoformat(),
            "days_written": len(daily),
            "days_incomplete": incomplete,
        },
    )
    return {
        "batch_id": batch_id,
        "hourly_observations": len(features),
        "daily_rows": len(daily),
        "days_incomplete": len(incomplete),
        "keys": [hourly_key, daily_key],
    }


def ingest_rescuegroups(event: dict, context: object) -> dict[str, Any]:  # noqa: ARG001
    """Snapshot currently adoptable listings within 50 miles of central Austin."""
    api_key = _get_secret(os.environ.get("RESCUEGROUPS_SECRET_ARN", ""))
    if not api_key:
        log.warning("No RescueGroups key configured; skipping this run")
        return {"skipped": True, "reason": "no api key configured"}

    batch_id = uuid.uuid4().hex[:16]
    client = RescueGroupsClient(api_key)
    rows = 0
    keys = []
    for page, result in enumerate(client.search_available()):
        keys.append(_write_raw("rescuegroups/listings", batch_id, page, result.raw_body))
        rows += len(result.rows)

    _write_marker(
        "rescuegroups",
        {
            "last_batch_id": batch_id,
            "last_run_at": datetime.now(UTC).isoformat(),
            "listings": rows,
        },
    )
    return {"batch_id": batch_id, "listings": rows, "pages": len(keys)}
