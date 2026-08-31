#!/usr/bin/env python3
"""Publish the reference distribution the monitoring job compares against.

Run once after the first deployment, and again after any approved retraining.
Until this has run there is nothing to detect drift *from*, and the monitoring
Lambda will fail on a missing baseline object rather than silently report that
everything is fine.

The choice this script encodes, and the reason it is a deliberate step rather
than something the monitoring job does for itself:

**The reference is the block the model was validated on, and it is frozen.** The
tempting alternative is a rolling window, comparing this month against last. That
is much easier to operate and it detects almost nothing, because the reference
drifts along with the data. A model validated on 2019 that meets a shelter which
changed shape in March 2020 has drifted from its own assumptions, and only a fixed
reference will say so. The measured cost of getting this wrong is in the paper: on
a quarter-over-quarter reference, three of the four quarters in 2021 read CRITICAL
for reasons that were mostly seasonal.

**A sample is stored, not just summary statistics.** PSI needs the reference
quantiles and categorical drift needs the reference level frequencies, and both
are cheaper to recompute from a stored sample than to version a dozen separate
summaries. Ten thousand rows is a few megabytes and makes the baseline
reproducible by inspection.

Usage:
    python3 scripts/publish_baseline.py --env dev --block validation
    python3 scripts/publish_baseline.py --env dev --block validation --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from secondchance.features import DEPLOYMENT_FEATURES  # noqa: E402
from secondchance.modeling import DEFAULT_SPLIT  # noqa: E402
from secondchance.monitor.handlers import (  # noqa: E402
    CATEGORICAL_MONITORED,
    NUMERIC_MONITORED,
    SHELTER_LEVEL_FEATURES,
)

log = logging.getLogger("publish_baseline")

# How many rows to store. Large enough that the quantile edges are stable, small
# enough that the object stays a few megabytes and a human can open it.
SAMPLE_ROWS = 10_000
RANDOM_SEED = 20260820


def build_baseline(
    features: pd.DataFrame,
    block: str,
    model_version: str,
    validation_roc_auc: float,
    validation_ece: float,
) -> dict:
    """Assemble the baseline document from a feature matrix.

    Args:
        features: the full feature matrix, with an ``intake_datetime`` column.
        block: which split block to use as the reference, normally "validation".
        model_version: the version string of the model this baseline belongs to.
            A baseline outlives no model: retrain and this has to be republished.
        validation_roc_auc: the AUC the monitoring job measures relative drops
            against. Absolute floors do not survive a population shift.
        validation_ece: recorded for the calibration alarm's reference point.

    Returns:
        The baseline document, ready to serialise.

    Raises:
        ValueError: if the chosen block has too few rows to characterise.
    """
    assigned = DEFAULT_SPLIT.assign(features["intake_datetime"])
    wanted = {"validation": "valid", "train": "train", "test": "test"}[block]
    reference = features.loc[assigned == wanted].copy()

    if len(reference) < 1000:
        raise ValueError(
            f"The {block} block has only {len(reference)} rows. A reference that small "
            "produces quantile edges that move on resampling, and every drift number "
            "computed against it would be noise."
        )

    monitored = [
        column
        for column in dict.fromkeys(NUMERIC_MONITORED + CATEGORICAL_MONITORED)
        if column in reference.columns
    ]
    sample = reference.sample(
        n=min(SAMPLE_ROWS, len(reference)), random_state=RANDOM_SEED
    )[monitored]

    # Shelter-level covariates get their mean stored rather than a distribution,
    # because the monitoring job compares them by relative level change. Every
    # animal arriving in one week shares almost the same value, so PSI on these
    # saturates on a change a shelter director would call an ordinary month.
    shelter_level_means = {
        column: float(pd.to_numeric(reference[column], errors="coerce").mean())
        for column in SHELTER_LEVEL_FEATURES
        if column in reference.columns
    }

    numeric_summary = {}
    for column in NUMERIC_MONITORED:
        if column not in reference.columns:
            continue
        values = pd.to_numeric(reference[column], errors="coerce").dropna()
        if values.empty:
            continue
        numeric_summary[column] = {
            "n": len(values),
            "mean": float(values.mean()),
            "std": float(values.std()),
            "quantiles": {
                str(q): float(values.quantile(q))
                for q in [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99]
            },
        }

    categorical_summary = {
        column: {
            str(level): float(share)
            for level, share in reference[column].value_counts(normalize=True).items()
        }
        for column in CATEGORICAL_MONITORED
        if column in reference.columns
    }

    return {
        "schema_version": 1,
        "published_at": datetime.now(UTC).isoformat(),
        "model_version": model_version,
        "block": block,
        "n_reference_rows": len(reference),
        "n_sample_rows": len(sample),
        "reference_window": {
            "start": str(reference["intake_datetime"].min()),
            "end": str(reference["intake_datetime"].max()),
        },
        "validation_roc_auc": float(validation_roc_auc),
        "validation_ece": float(validation_ece),
        "monitored_numeric": [c for c in NUMERIC_MONITORED if c in reference.columns],
        "monitored_categorical": [c for c in CATEGORICAL_MONITORED if c in reference.columns],
        "shelter_level_features": list(shelter_level_means),
        "shelter_level_means": shelter_level_means,
        "numeric_summary": numeric_summary,
        "categorical_summary": categorical_summary,
        "reference_sample": json.loads(sample.to_json(orient="records", date_format="iso")),
        "deployment_feature_count": len(DEPLOYMENT_FEATURES),
        "notes": [
            "This reference is frozen. It is the block the model was validated on, not a "
            "rolling window, because a rolling reference drifts with the data and detects "
            "nothing.",
            "Republish after every approved retraining. A baseline belongs to one model.",
            "Features monotone in calendar time are deliberately absent: their PSI against "
            "any earlier reference is unbounded, so they fire in every period regardless.",
            "Shelter-level covariates are compared by relative change in level rather than "
            "by PSI, because they are near constant within a period and PSI saturates.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    """Build the baseline and either upload it or write it beside the features."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--env", default="dev", help="deployment environment name")
    parser.add_argument(
        "--block",
        default="validation",
        choices=["validation", "train", "test"],
        help="which split block becomes the reference; validation unless you have a reason",
    )
    parser.add_argument(
        "--features",
        default=str(ROOT / "data" / "interim" / "features.parquet"),
        help="feature matrix built by analysis/02_build_features.py",
    )
    parser.add_argument(
        "--results",
        default=str(ROOT / "results" / "MEASURED_RESULTS.json"),
        help="results file, read for the validation metrics this baseline records",
    )
    parser.add_argument("--model-version", default=None, help="defaults to the results file's value")
    parser.add_argument("--bucket", default=None, help="curated bucket; defaults to the convention")
    parser.add_argument("--key", default="monitoring/baseline_statistics.json")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="write the document locally and print a summary instead of uploading",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s"
    )

    features = pd.read_parquet(args.features)
    results = json.loads(Path(args.results).read_text(encoding="utf-8"))

    # Read the validated metrics from the results file rather than asking the
    # operator to type them. A baseline whose reference AUC was entered by hand is
    # a baseline that will eventually disagree with the model it describes.
    champion = results["targets"]["adopted_within_30d"]["models"]["lightgbm"]
    validation_roc_auc = float(champion["valid_calibrated"]["roc_auc"])
    validation_ece = float(champion["valid_calibrated"]["ece"])
    model_version = args.model_version or results["metadata"]["model_version"]

    baseline = build_baseline(
        features=features,
        block=args.block,
        model_version=model_version,
        validation_roc_auc=validation_roc_auc,
        validation_ece=validation_ece,
    )
    payload = json.dumps(baseline, indent=2, allow_nan=False).encode("utf-8")

    log.info(
        "Baseline: %d reference rows (%s to %s), %d sampled, validation AUC %.4f, ECE %.4f",
        baseline["n_reference_rows"],
        baseline["reference_window"]["start"][:10],
        baseline["reference_window"]["end"][:10],
        baseline["n_sample_rows"],
        validation_roc_auc,
        validation_ece,
    )

    if args.dry_run:
        local = ROOT / "results" / "baseline_statistics.json"
        local.write_text(payload.decode("utf-8"), encoding="utf-8")
        print(f"Dry run. Wrote {local} ({len(payload) / 1024:.0f} KB). Nothing was uploaded.")
        return 0

    import boto3

    account = boto3.client("sts").get_caller_identity()["Account"]
    bucket = args.bucket or f"secondchance-curated-{args.env}-{account}"
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=args.key,
        Body=payload,
        ContentType="application/json",
        Metadata={
            "model-version": model_version,
            "block": args.block,
            "published-at": baseline["published_at"],
        },
    )
    print(f"Published baseline for {model_version} to s3://{bucket}/{args.key}")
    print(
        "The monitoring Lambda will now compare against this window. Republish after "
        "any approved retraining."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
