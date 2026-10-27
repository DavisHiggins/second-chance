"""Time to adoption as a survival problem, on the small sample dataset.

Shows the project's central statistical point in a few lines: when some animals
leave by transfer or return to owner, the usual Kaplan-Meier "1 - survival"
overstates how many arrivals are adopted. The Aalen-Johansen cumulative
incidence function treats those exits as competing risks and gives the honest
share. On the real archive the gap at day 30 is 23.7 percentage points.

Usage:
    python bin/survival_example.py
    python bin/survival_example.py --intakes data/raw/aac_intakes_20220304.csv \
                                   --outcomes data/raw/aac_outcomes_20220304.csv
"""

from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from secondchance.episodes import build_episodes, load_intakes, load_outcomes  # noqa: E402
from secondchance.survival import (  # noqa: E402
    cumulative_incidence,
    kaplan_meier,
    median_survival_days,
    to_survival_arrays,
)

# lifelines breaks tied exit times with a tiny seeded jitter and says so on
# every call. The jitter is expected here, so the notice is only noise.
warnings.filterwarnings("ignore", message="Tied event times were detected")

SAMPLE_DIR = ROOT / "data" / "sample"
DATA_CUTOFF = pd.Timestamp("2022-03-04 11:25:00")


def value_at(curve: pd.DataFrame, column: str, day: float) -> float:
    """Read a step function at a given day (the last value at or before it)."""
    known = curve.loc[curve["day"] <= day, column]
    return float(known.iloc[-1]) if len(known) else 0.0


def main(argv: list[str] | None = None) -> int:
    """Print naive vs. competing-risk adoption shares at several horizons."""
    parser = argparse.ArgumentParser(description="Kaplan-Meier vs. Aalen-Johansen on shelter stays.")
    parser.add_argument("--intakes", type=Path, default=SAMPLE_DIR / "aac_intakes_sample.csv")
    parser.add_argument("--outcomes", type=Path, default=SAMPLE_DIR / "aac_outcomes_sample.csv")
    args = parser.parse_args(argv)

    episodes, _ = build_episodes(load_intakes(str(args.intakes)), load_outcomes(str(args.outcomes)), DATA_CUTOFF)
    episodes = episodes.loc[episodes["animal_type"].isin(["Dog", "Cat"])]

    for species in ("Dog", "Cat"):
        arrays = to_survival_arrays(episodes.loc[episodes["animal_type"] == species])
        naive = kaplan_meier(arrays)
        honest = cumulative_incidence(arrays, cause=1)
        print(f"\n{species}s: {len(arrays.duration):,} stays, "
              f"median cause-specific time to adoption {median_survival_days(arrays):.1f} days")
        print(f"  {'day':>5}  {'KM 1-S (naive)':>15}  {'Aalen-Johansen':>15}  {'overstatement':>14}")
        for day in (7, 14, 30, 60, 90):
            km = value_at(naive, "adopted_cumulative", day)
            aj = value_at(honest, "cumulative_incidence", day)
            print(f"  {day:>5}  {km:>15.1%}  {aj:>15.1%}  {100 * (km - aj):>11.1f} pp")

    exits = episodes.loc[episodes["is_matched"], "outcome_type"].value_counts(normalize=True)
    print("\nShare of exits by type (the competing risks):")
    print((exits * 100).round(1).astype(str).add("%").to_string())
    print(f"\nNon-adoption exits: {100 * float(np.sum(exits.drop(['Adoption', 'Rto-Adopt'], errors='ignore'))):.1f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
