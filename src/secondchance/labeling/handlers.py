"""Lambda entry point for structuring breed strings with a language model.

Triggered by new raw intake objects rather than on a schedule, because the only
time this function has work to do is when a breed string nobody has seen before
arrives. That happens perhaps a dozen times a month, which is why the design is
built around never labelling the same token twice.

Three rules run through this file, and they are the reason a language model in a
production pipeline is defensible here rather than just fashionable:

**Label the token, not the row.** Austin publishes breed as free text, and there
are 2,736 distinct strings in nine years of data. But the strings are
compositional: "Labrador Retriever/Pit Bull Mix" is two atomic breeds plus a mix
marker. Splitting on Austin's own convention collapses those 2,736 strings to 254
atomic tokens. Labelling tokens instead of rows turns an unbounded per-row cost
into a bounded one-off, and it means the same breed is described identically
everywhere it appears.

**The reference is an artefact, not a call.** The output is a versioned file in
S3 with the model id and a hash of the prompt beside every row. Nothing at
serving time calls Bedrock. A model that is invoked once, offline, into a file a
human can read and a reviewer can diff is a fundamentally different risk than one
invoked inside a request.

**A new label is quarantined until a human sees it.** Newly labelled tokens are
written to a pending file and are not merged into the live reference until
someone approves them. The approval step is a human writing a row into
``analytics.labeling_audit``, and the agreement rate that produces is reported in
the model card. An automated label that feeds a decision about an animal should
not reach production because a cron job succeeded.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

from .breed_llm import (
    LABELING_PROMPT,
    BreedAttributes,
    build_prompt,
    split_breed_string,
)

log = logging.getLogger()
log.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

RAW_BUCKET = os.environ.get("RAW_BUCKET", "")
CURATED_BUCKET = os.environ.get("CURATED_BUCKET", "")
ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN", "")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")
REFERENCE_KEY = os.environ.get("BREED_REFERENCE_KEY", "reference/breed_attributes_llm.psv")
PENDING_KEY = os.environ.get("BREED_PENDING_KEY", "reference/breed_attributes_pending.psv")

# One request covers this many tokens. Small enough that a single malformed reply
# costs little to retry, large enough that the per-request overhead is not the
# dominant cost.
BATCH_SIZE = 25

# A single invocation will not label more than this. A malformed upstream feed
# that suddenly produces thousands of junk breed strings should stop and alert,
# not spend the month's Bedrock budget describing them.
MAX_NEW_TOKENS_PER_RUN = 200


def _boto(service: str):
    import boto3

    return boto3.client(service)


def _prompt_version_hash() -> str:
    """Hash the prompt so a label can be traced to the exact text that produced it.

    If the prompt changes, every label produced under the old one is still
    correct in the sense that it is what that prompt returned, and this hash is
    what lets a reviewer tell the two vintages apart.
    """
    return hashlib.sha256(LABELING_PROMPT.encode("utf-8")).hexdigest()[:16]


def _read_reference(bucket: str, key: str) -> dict[str, BreedAttributes]:
    """Load the live reference from S3, returning an empty table if absent."""
    from .breed_llm import _parse_row

    try:
        body = _boto("s3").get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
    except Exception as error:
        log.warning("No reference at s3://%s/%s (%s); starting empty", bucket, key, error)
        return {}
    table: dict[str, BreedAttributes] = {}
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        record = _parse_row(line)
        table[record.name] = record
    return table


def _collect_breed_strings(event: dict[str, Any]) -> list[str]:
    """Pull the breed column out of whichever raw objects triggered this run.

    Accepts either an S3 notification event or a manual payload carrying an
    explicit list, so the same function can be run by hand from the runbook.
    """
    if "breeds" in event:
        return [b for b in event["breeds"] if isinstance(b, str)]

    strings: list[str] = []
    s3 = _boto("s3")
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        if key.endswith(".gz"):
            import gzip

            body = gzip.decompress(body)
        for line in body.decode("utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            breed = row.get("breed")
            if isinstance(breed, str):
                strings.append(breed)
    return strings


def _invoke_bedrock(tokens: list[str]) -> list[dict[str, Any]]:
    """Ask Bedrock to describe one batch of breed tokens.

    Temperature zero, because this is a lookup table rather than a piece of
    writing. Two attempts, because the only failure mode seen in practice is a
    reply wrapped in a code fence, and a second ask fixes it more cheaply than
    parsing around it would.
    """
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "temperature": 0,
        "messages": [{"role": "user", "content": build_prompt(tokens)}],
    }
    client = _boto("bedrock-runtime")
    for attempt in (1, 2):
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body).encode("utf-8"),
        )
        text = json.loads(response["body"].read())["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            text = text[4:] if text.startswith("json") else text
            text = text.strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            if attempt == 2:
                raise
            log.warning("Unparseable reply for batch of %d, retrying once", len(tokens))
            continue
        return parsed if isinstance(parsed, list) else [parsed]
    return []


def _serialise(record: dict[str, Any]) -> str:
    """Render one labelled token as a pipe separated reference row."""
    from .breed_llm import (
        _REVERSE_COAT,
        _REVERSE_GROUP,
        _REVERSE_LEVEL,
        _REVERSE_SIZE,
        FLAG_ORDER,
    )

    flags = "".join("1" if record.get(name) else "0" for name in FLAG_ORDER)
    return "|".join(
        [
            record["name"],
            _REVERSE_GROUP.get(record.get("group", ""), "NR"),
            _REVERSE_SIZE.get(record.get("size", ""), "M"),
            str(round(float(record.get("weight_lb", 40)))),
            _REVERSE_COAT.get(record.get("coat", ""), "S"),
            _REVERSE_LEVEL.get(record.get("grooming", ""), "M"),
            _REVERSE_LEVEL.get(record.get("energy", ""), "M"),
            flags,
        ]
    )


def _alert(subject: str, message: str) -> None:
    if not ALERT_TOPIC_ARN:
        log.warning("%s: %s", subject, message)
        return
    _boto("sns").publish(TopicArn=ALERT_TOPIC_ARN, Subject=subject[:100], Message=message)


def label_new_breeds(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Label any breed token the reference has not seen, and quarantine the result.

    Args:
        event: an S3 notification, or ``{"breeds": [...]}`` for a manual run.
        context: the Lambda context, unused.

    Returns:
        A summary of what was seen, what was new, and where the pending file was
        written. Returned rather than logged so a step function or a human running
        it by hand gets the counts directly.
    """
    reference = _read_reference(CURATED_BUCKET, REFERENCE_KEY)
    pending = _read_reference(CURATED_BUCKET, PENDING_KEY)
    known = set(reference) | set(pending)

    seen: set[str] = set()
    for raw in _collect_breed_strings(event):
        tokens, _ = split_breed_string(raw)
        seen.update(tokens)

    unknown = sorted(seen - known)
    if not unknown:
        log.info("%d breed strings seen, nothing new", len(seen))
        return {"tokens_seen": len(seen), "tokens_new": 0, "labelled": 0}

    if len(unknown) > MAX_NEW_TOKENS_PER_RUN:
        # This many new tokens at once is not a busy month, it is a broken feed.
        _alert(
            "SecondChance: implausible number of new breed tokens",
            f"{len(unknown)} unseen breed tokens in one batch, which is far above the "
            f"handful expected. Refusing to label them. First twenty: {unknown[:20]}",
        )
        return {"tokens_seen": len(seen), "tokens_new": len(unknown), "labelled": 0,
                "status": "refused_implausible_volume"}

    labelled: list[dict[str, Any]] = []
    for start in range(0, len(unknown), BATCH_SIZE):
        batch = unknown[start : start + BATCH_SIZE]
        try:
            labelled.extend(_invoke_bedrock(batch))
        except Exception as error:
            log.exception("Batch starting at %d failed", start)
            _alert("SecondChance: breed labelling batch failed", f"{batch}\n\n{error}")

    if not labelled:
        return {"tokens_seen": len(seen), "tokens_new": len(unknown), "labelled": 0,
                "status": "all_batches_failed"}

    stamp = datetime.now(UTC).isoformat()
    version = _prompt_version_hash()
    header = [
        "# SecondChance breed reference, PENDING HUMAN REVIEW",
        "# Do not merge into the live reference until every row below has been",
        "# checked against a breed standard and recorded in analytics.labeling_audit.",
        f"# model={BEDROCK_MODEL_ID} prompt_version={version} labelled_at={stamp}",
        "# name|group|size|weight_lb|coat|grooming|energy|flags",
        "# flags = bully_type, brachycephalic, guardian_or_working, bsl_risk, recognized_purebred",
    ]
    existing = [
        "|".join(
            [
                r.name, r.group, r.size, str(round(r.weight_lb)), r.coat, r.grooming, r.energy,
                "".join("1" if getattr(r, f) else "0" for f in
                        ("bully_type", "brachycephalic", "guardian_or_working",
                         "bsl_risk", "recognized_purebred")),
            ]
        )
        for r in pending.values()
    ]
    rows = existing + [_serialise(record) for record in labelled if "name" in record]
    payload = "\n".join(header + sorted(set(rows))) + "\n"

    _boto("s3").put_object(
        Bucket=CURATED_BUCKET,
        Key=PENDING_KEY,
        Body=payload.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
        Metadata={
            "model-id": BEDROCK_MODEL_ID,
            "prompt-version": version,
            "labelled-at": stamp,
            "requires-human-review": "true",
        },
    )

    _alert(
        "SecondChance: new breed labels awaiting review",
        f"{len(labelled)} newly labelled breed tokens are in "
        f"s3://{CURATED_BUCKET}/{PENDING_KEY} and are NOT yet in the live reference. "
        f"Review them and run the merge step in the runbook.\n\nTokens: {unknown}",
    )

    log.info("Labelled %d new tokens into the pending file", len(labelled))
    return {
        "tokens_seen": len(seen),
        "tokens_new": len(unknown),
        "labelled": len(labelled),
        "pending_key": PENDING_KEY,
        "prompt_version": version,
        "model_id": BEDROCK_MODEL_ID,
        "status": "awaiting_human_review",
    }


def promote_pending_reference(event: dict[str, Any], context: object) -> dict[str, Any]:  # noqa: ARG001
    """Merge reviewed rows from the pending file into the live reference.

    Deliberately not automatic and deliberately not idempotent-by-schedule: it
    runs when a person invokes it with the tokens they have actually checked.
    Anything not named in ``event["approved_tokens"]`` stays in the pending file.

    Args:
        event: ``{"approved_tokens": [...], "reviewer": "name"}``.
        context: the Lambda context, unused.

    Returns:
        Counts of what moved and what remains pending.

    Raises:
        ValueError: if no reviewer is named. An unattributed approval is not an
            approval.
    """
    reviewer = str(event.get("reviewer", "")).strip()
    if not reviewer:
        raise ValueError("promote_pending_reference requires a named reviewer")

    approved = set(event.get("approved_tokens", []))
    if not approved:
        return {"promoted": 0, "still_pending": 0, "status": "nothing_approved"}

    reference = _read_reference(CURATED_BUCKET, REFERENCE_KEY)
    pending = _read_reference(CURATED_BUCKET, PENDING_KEY)

    moving = {name: record for name, record in pending.items() if name in approved}
    staying = {name: record for name, record in pending.items() if name not in approved}

    def render(table: dict[str, BreedAttributes]) -> list[str]:
        return sorted(
            "|".join(
                [
                    r.name, r.group, r.size, str(round(r.weight_lb)), r.coat, r.grooming, r.energy,
                    "".join("1" if getattr(r, f) else "0" for f in
                            ("bully_type", "brachycephalic", "guardian_or_working",
                             "bsl_risk", "recognized_purebred")),
                ]
            )
            for r in table.values()
        )

    reference.update(moving)
    stamp = datetime.now(UTC).isoformat()
    s3 = _boto("s3")
    s3.put_object(
        Bucket=CURATED_BUCKET,
        Key=REFERENCE_KEY,
        Body=("\n".join(render(reference)) + "\n").encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
        Metadata={"last-reviewer": reviewer, "last-promoted-at": stamp},
    )
    s3.put_object(
        Bucket=CURATED_BUCKET,
        Key=PENDING_KEY,
        Body=("\n".join(render(staying)) + "\n").encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
    )

    log.info("%s promoted %d tokens; %d still pending", reviewer, len(moving), len(staying))
    return {
        "promoted": len(moving),
        "still_pending": len(staying),
        "reviewer": reviewer,
        "promoted_at": stamp,
        "reference_size": len(reference),
    }
