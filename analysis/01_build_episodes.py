"""Step one of the analysis: build the episode table and write the audit."""
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

from secondchance.episodes import (
    build_episodes,
    label_horizons,
    load_intakes,
    load_outcomes,
    summarise_episodes,
)

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
INTERIM.mkdir(parents=True, exist_ok=True)
RESULTS = ROOT / "results"
(RESULTS / "tables").mkdir(parents=True, exist_ok=True)

intakes = load_intakes(str(RAW / "aac_intakes_20220304.csv"))
outcomes = load_outcomes(str(RAW / "aac_outcomes_20220304.csv"))

cutoff = max(intakes["intake_datetime"].max(), outcomes["outcome_datetime"].max())
print("DATA CUTOFF:", cutoff)

episodes, audit = build_episodes(intakes, outcomes, cutoff)
episodes = label_horizons(episodes, data_cutoff=cutoff)

print("\n=== AUDIT ===")
for k, v in audit.as_dict().items():
    print(f"  {k}: {v}")

print("\n=== BY SPECIES ===")
print(summarise_episodes(episodes))

print("\n=== LOS distribution (closed episodes) ===")
closed = episodes[episodes.is_matched]
print(closed["length_of_stay_days"].describe(percentiles=[.1,.25,.5,.75,.9,.95,.99]))

print("\n=== outcome type ===")
print(episodes["outcome_type"].value_counts(dropna=False))

print("\n=== label availability ===")
for c in ["adopted_within_7d","adopted_within_14d","adopted_within_30d","long_stay_60d"]:
    s = episodes[c]
    print(f"  {c}: n={s.notna().sum()}, positive_rate={s.mean():.4f}, missing={s.isna().sum()}")

episodes.to_parquet(INTERIM / "episodes.parquet", index=False)
(RESULTS / "tables" / "episode_audit.json").write_text(json.dumps(audit.as_dict(), indent=2))
print("\nsaved", INTERIM / "episodes.parquet", episodes.shape)
