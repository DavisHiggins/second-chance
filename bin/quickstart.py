"""Train and evaluate a SecondChance model on the small sample dataset.

This is the "get started" demo: the whole modelling pipeline, end to end, in
well under a minute on a laptop. It uses the same library functions as the full
35-minute study, only on about 3,200 synthetic intake rows instead of 137,000
real ones.

What it does, in the order the full pipeline does it:

    1. load_intakes / load_outcomes   read the two Austin-format CSV event logs
    2. build_episodes                 pair each arrival with the outcome that closed it
    3. label_horizons                 attach the targets, leaving censored rows unlabelled
    4. build_features                 build the intake-time feature matrix
    5. build_cohort                   keep cats and dogs on the adoption pathway
    6. DEFAULT_SPLIT                  temporal split: train < 2019, validate 2019, test 2020-21
    7. make_model + fit_calibrated    fit on train, calibrate on validation
    8. evaluate_binary                score the untouched test block
    9. write the fitted model and a ranked support queue to disk

Usage:
    python bin/quickstart.py                                  # sample data, adopted_within_30d, LightGBM
    python bin/quickstart.py --target long_stay_60d
    python bin/quickstart.py --model logistic
    python bin/quickstart.py --intakes data/raw/aac_intakes_20220304.csv \
                             --outcomes data/raw/aac_outcomes_20220304.csv   # the real archive

Run ``python bin/make_sample_data.py`` first if data/sample/ is empty; the
sample CSVs are committed, so normally it is not.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

# Make the library importable from a bare checkout, without `pip install -e .`.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from secondchance.episodes import build_episodes, label_horizons, load_intakes, load_outcomes  # noqa: E402
from secondchance.features import DEPLOYMENT_FEATURES, build_cohort, build_features  # noqa: E402
from secondchance.modeling import (  # noqa: E402
    DEFAULT_SPLIT,
    evaluate_binary,
    fit_calibrated,
    make_model,
)

SAMPLE_DIR = ROOT / "data" / "sample"
DEFAULT_OUTPUT = ROOT / "results" / "quickstart"
DATA_CUTOFF = pd.Timestamp("2022-03-04 11:25:00")
TARGETS = ["adopted_within_7d", "adopted_within_14d", "adopted_within_30d", "long_stay_60d"]
MODELS = ["prior", "logistic", "lightgbm", "xgboost"]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Read the command line."""
    parser = argparse.ArgumentParser(description="Train a SecondChance model on a small dataset.")
    parser.add_argument("--intakes", type=Path, default=SAMPLE_DIR / "aac_intakes_sample.csv")
    parser.add_argument("--outcomes", type=Path, default=SAMPLE_DIR / "aac_outcomes_sample.csv")
    parser.add_argument("--target", choices=TARGETS, default="adopted_within_30d")
    parser.add_argument("--model", choices=MODELS, default="lightgbm")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--queue-size", type=int, default=10, help="rows to show in the support queue")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run the demo and print a short report."""
    args = parse_args(argv)
    started = time.perf_counter()

    if not args.intakes.exists() or not args.outcomes.exists():
        print(f"Missing input CSVs. Run: python bin/make_sample_data.py\n  {args.intakes}\n  {args.outcomes}")
        return 1

    # 1-3. Event logs -> episodes -> labelled episodes.
    intakes = load_intakes(str(args.intakes))
    outcomes = load_outcomes(str(args.outcomes))
    episodes, audit = build_episodes(intakes, outcomes, DATA_CUTOFF)
    labelled = label_horizons(episodes, data_cutoff=DATA_CUTOFF)
    print(f"[1-3] {audit.intake_rows:,} intakes + {audit.outcome_rows:,} outcomes "
          f"-> {audit.episodes_built:,} episodes ({audit.episodes_open_at_cutoff} still open at the cutoff)")

    # 4-5. Intake-time features, then the modelling cohort.
    features = build_features(labelled, breed_strategy="llm")
    cohort, exclusions = build_cohort(features)
    print(f"[4-5] {len(DEPLOYMENT_FEATURES)} intake-time feature columns; cohort of {exclusions['episodes_final']:,} "
          f"cat and dog episodes ({exclusions['episodes_start'] - exclusions['episodes_final']} excluded)")

    # 6. Temporal split. Rows whose label is censored are dropped for this target only.
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])
    usable = cohort.loc[cohort[args.target].notna()]
    blocks = {name: usable.loc[usable["block"] == name] for name in ("train", "valid", "test")}
    print("[6]   split: " + ", ".join(f"{name} {len(rows):,}" for name, rows in blocks.items()))
    if min(len(rows) for rows in blocks.values()) == 0:
        print("One of the three blocks is empty; the data must span 2016 to 2021.")
        return 1

    # 7. Fit on train, calibrate on validation. The test block is never seen here.
    # Columns with no observed value (the weather block, when no weather file is
    # given) carry no information and only make the imputer complain.
    train, valid, test = blocks["train"], blocks["valid"], blocks["test"]
    columns = [c for c in DEPLOYMENT_FEATURES if train[c].notna().any()]
    _, calibrated = fit_calibrated(
        make_model(args.model, columns),
        train[columns], train[args.target].to_numpy(),
        valid[columns], valid[args.target].to_numpy(),
    )

    # 8. Evaluate on the held-out, later test block.
    probabilities = calibrated.predict_proba(test[columns])[:, 1]
    metrics = evaluate_binary(test[args.target].to_numpy(), probabilities, queue_sizes=(20, 50))
    print(f"[7-8] {args.model} on {args.target}, held-out test block:")
    for key in ("n", "positive_rate", "roc_auc", "pr_auc", "brier", "ece", "lift_at_50"):
        value = metrics[key]
        print(f"        {key:<14} {value:,.4f}" if isinstance(value, float) else f"        {key:<14} {value:,}")

    # 9. Save the fitted model and a ranked queue. For long stays, high risk
    # ranks first; for adoption targets, the lowest chance ranks first. Either
    # way the queue lists animals that may need extra support.
    import joblib

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / f"{args.target}_{args.model}.joblib"
    joblib.dump({"calibrated_model": calibrated, "feature_columns": columns, "target": args.target}, model_path)

    queue = test[["animal_id", "intake_datetime", "animal_type", "age_band", "intake_condition"]].copy()
    queue[f"p_{args.target}"] = probabilities
    ascending = not args.target.startswith("long_stay")
    queue = queue.sort_values(f"p_{args.target}", ascending=ascending)
    queue_path = args.output_dir / f"{args.target}_support_queue.csv"
    queue.to_csv(queue_path, index=False)

    print(f"[9]   model -> {model_path.relative_to(ROOT) if model_path.is_relative_to(ROOT) else model_path}")
    print(f"      queue -> {queue_path.relative_to(ROOT) if queue_path.is_relative_to(ROOT) else queue_path}")
    print(f"\nTop {args.queue_size} animals that may need extra support:")
    print(queue.head(args.queue_size).to_string(index=False))
    print(f"\nDone in {time.perf_counter() - started:.1f}s.")
    print("A high predicted long-stay risk is a request for more help, not less. "
          "Scores must never justify euthanasia, intake refusal or reduced care.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
