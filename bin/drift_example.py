"""Check whether the intake population has drifted, on the small sample dataset.

A deployed model is only as good as the match between the animals it was
calibrated on and the animals arriving now. This compares the 2019 validation
year (the reference the calibrator was fitted on) against the most recent year
of intakes, feature by feature, using the population stability index (PSI) and
the Kolmogorov-Smirnov statistic from ``secondchance.monitor.drift``.

PSI below 0.10 is stable, 0.10 to 0.25 a warning, above 0.25 critical.

Usage:
    python bin/drift_example.py
    python bin/drift_example.py --current-year 2020
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from secondchance.episodes import build_episodes, label_horizons, load_intakes, load_outcomes  # noqa: E402
from secondchance.features import build_cohort, build_features  # noqa: E402
from secondchance.monitor.drift import DriftThresholds, feature_drift_report  # noqa: E402

SAMPLE_DIR = ROOT / "data" / "sample"
DATA_CUTOFF = pd.Timestamp("2022-03-04 11:25:00")

# A readable subset. The deployed monitor checks every feature.
NUMERIC = ["age_at_intake_days", "breed_weight_lb", "name_length", "intake_hour", "intake_month"]
CATEGORICAL = ["animal_type", "intake_type", "intake_condition", "age_band", "sex_upon_intake"]


def main(argv: list[str] | None = None) -> int:
    """Print the drift table and return 2 / 1 / 0 for critical / warning / stable."""
    parser = argparse.ArgumentParser(description="Feature drift between a reference and a current year.")
    parser.add_argument("--intakes", type=Path, default=SAMPLE_DIR / "aac_intakes_sample.csv")
    parser.add_argument("--outcomes", type=Path, default=SAMPLE_DIR / "aac_outcomes_sample.csv")
    parser.add_argument("--reference-year", type=int, default=2019)
    parser.add_argument("--current-year", type=int, default=2021)
    args = parser.parse_args(argv)

    episodes, _ = build_episodes(load_intakes(str(args.intakes)), load_outcomes(str(args.outcomes)), DATA_CUTOFF)
    features, _ = build_cohort(build_features(label_horizons(episodes, data_cutoff=DATA_CUTOFF)))
    year = features["intake_datetime"].dt.year
    reference = features.loc[year == args.reference_year]
    current = features.loc[year == args.current_year]

    report = feature_drift_report(reference, current, NUMERIC, CATEGORICAL, DriftThresholds())

    print(f"Reference {args.reference_year}: {len(reference):,} episodes   "
          f"Current {args.current_year}: {len(current):,} episodes\n")
    print(report[["feature", "kind", "psi", "ks_statistic", "status"]].to_string(index=False))

    critical = int((report["status"] == "CRITICAL").sum())
    warning = int((report["status"] == "WARNING").sum())
    print(f"\n{critical} critical, {warning} warning, {len(report)} features checked")
    return 2 if critical else (1 if warning else 0)


if __name__ == "__main__":
    raise SystemExit(main())
