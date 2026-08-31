"""Step four: ablations. Which feature blocks actually earn their keep?

Three questions:

1. What does each block of features add on top of the ones before it? Adding
   columns until the score stops moving is how you end up maintaining a pipeline
   that ingests weather data for nothing.
2. Does the LLM breed structuring beat the keyword baseline, and does either beat
   dropping breed entirely? This is the question that justifies the whole LLM
   component, so it gets a paired bootstrap rather than a shrug.
3. Does a shuffled label control land on 0.5? If it does not, something is
   leaking and every other number in the paper is worthless.

Writes results/tables/ablations.json.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ablate")

from secondchance.features import FEATURE_BLOCKS, build_features, feature_columns
from secondchance.modeling import (
    DEFAULT_SPLIT,
    RANDOM_SEED,
    delong_style_paired_bootstrap,
    evaluate_binary,
    fit_calibrated,
    make_model,
)

sys.path.insert(0, str(ROOT / "analysis"))
from importlib import import_module

build_cohort = import_module("03_train_eval").build_cohort

TARGET = "adopted_within_30d"
SECOND_TARGET = "long_stay_60d"

# Weather is deliberately absent from the cumulative ladder. The station record
# stops on 2020-12-31 while the shelter record runs to 2022-03-04, so the weather
# columns are missing for the last fourteen months. Our imputer emits a
# "value was missing" indicator, and on the full cohort that indicator is a
# perfect flag for "this intake happened in 2021 or later", which is a era marker
# rather than a fact about the weather. On the long stay target that artefact was
# worth a spurious +0.013 AUC on an earlier feature set. Weather is therefore evaluated
# only on the window where it actually exists, in a separate section below.
CUMULATIVE_BLOCKS = [
    ("animal", ["animal"]),
    ("+ intake context", ["animal", "intake_context"]),
    ("+ shelter load", ["animal", "intake_context", "shelter_load"]),
    ("+ breed structure", ["animal", "intake_context", "shelter_load", "breed_llm"]),
]


def run_one(cohort: pd.DataFrame, columns: list[str], target: str, model_name: str = "lightgbm"):
    """Fit, calibrate and score one configuration. Returns metrics and test scores."""
    labelled = cohort.loc[cohort[target].notna()]
    train = labelled.loc[labelled["block"] == "train"]
    valid = labelled.loc[labelled["block"] == "valid"]
    test = labelled.loc[labelled["block"] == "test"]

    y_train = train[target].to_numpy()
    weight = (
        float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
        if target == SECOND_TARGET
        else 1.0
    )
    model = make_model(model_name, columns, scale_pos_weight=weight)
    _, calibrated = fit_calibrated(
        model, train[columns], y_train, valid[columns], valid[target].to_numpy()
    )
    probabilities = calibrated.predict_proba(test[columns])[:, 1]
    return evaluate_binary(test[target].to_numpy(), probabilities), probabilities, test[target].to_numpy()


def main() -> None:
    episodes = pd.read_parquet(ROOT / "data/interim/episodes.parquet")
    weather = pd.read_csv(ROOT / "data/raw/austin_weather_USW00013958.csv")
    weather = weather.rename(columns={weather.columns[0]: "row_id", "Date": "date"})
    weather["date"] = pd.to_datetime(weather["date"])
    weather = weather[weather.date >= "2013-01-01"][["date", "tmax", "tmin", "prcp"]]
    for column in ["tmax", "tmin", "prcp"]:
        weather[column] = pd.to_numeric(weather[column], errors="coerce")

    output: dict = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    # ---- 1. cumulative feature blocks --------------------------------------
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    cohort, _ = build_cohort(features)
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])

    log.info("=" * 70)
    log.info("CUMULATIVE FEATURE BLOCKS, target %s", TARGET)
    block_rows = []
    previous_probabilities = None
    for label, blocks in CUMULATIVE_BLOCKS:
        columns = feature_columns(blocks)
        metrics, probabilities, y_test = run_one(cohort, columns, TARGET)
        row = {
            "configuration": label,
            "blocks": blocks,
            "n_features": len(columns),
            "roc_auc": round(metrics["roc_auc"], 4),
            "pr_auc": round(metrics["pr_auc"], 4),
            "brier": round(metrics["brier"], 4),
            "ece": round(metrics["ece"], 4),
            "precision_at_50": round(metrics["precision_at_50"], 4),
        }
        if previous_probabilities is not None:
            comparison = delong_style_paired_bootstrap(
                y_test, probabilities, previous_probabilities, n_boot=500
            )
            row["auc_gain_over_previous"] = round(comparison["auc_difference"], 4)
            row["gain_ci"] = [round(comparison["ci_low"], 4), round(comparison["ci_high"], 4)]
            row["gain_p_value"] = round(comparison["p_value"], 4)
        previous_probabilities = probabilities
        block_rows.append(row)
        log.info("  %-20s features=%3d AUC=%.4f", label, len(columns), metrics["roc_auc"])
    output["cumulative_blocks"] = block_rows

    # ---- 2. breed strategy comparison --------------------------------------
    log.info("=" * 70)
    log.info("BREED STRATEGY COMPARISON")
    # Both targets, because the 30 day question and the long stay question turn
    # out to disagree about how much breed matters, and that disagreement is one
    # of the more useful things in this paper.
    rebuilt_cohorts: dict[str, pd.DataFrame] = {}
    for strategy in ["none", "rules", "llm"]:
        rebuilt = build_features(episodes, weather=weather, breed_strategy=strategy)
        sub_cohort, _ = build_cohort(rebuilt)
        sub_cohort["block"] = DEFAULT_SPLIT.assign(sub_cohort["intake_datetime"])
        rebuilt_cohorts[strategy] = sub_cohort

    output["breed_strategy"] = {}
    output["breed_strategy_tests"] = {}
    for target in [TARGET, SECOND_TARGET]:
        strategy_rows = []
        strategy_probabilities: dict[str, np.ndarray] = {}
        y_reference = None
        for strategy in ["none", "rules", "llm"]:
            columns = feature_columns(["animal", "intake_context", "shelter_load", "breed_llm"])
            if strategy == "none":
                # With no breed structure there is nothing to encode, so the run
                # uses the other three blocks only. Reporting it this way makes the
                # size of the whole breed contribution visible.
                columns = feature_columns(["animal", "intake_context", "shelter_load"])
            metrics, probabilities, y_test = run_one(rebuilt_cohorts[strategy], columns, target)
            strategy_probabilities[strategy] = probabilities
            y_reference = y_test
            strategy_rows.append(
                {
                    "strategy": strategy,
                    "n_features": len(columns),
                    "roc_auc": round(metrics["roc_auc"], 4),
                    "pr_auc": round(metrics["pr_auc"], 4),
                    "brier": round(metrics["brier"], 4),
                    "ece": round(metrics["ece"], 4),
                    "lift_at_50": round(metrics["lift_at_50"], 3),
                }
            )
            log.info(
                "  [%s] %-6s AUC=%.4f  PR-AUC=%.4f",
                target,
                strategy,
                metrics["roc_auc"],
                metrics["pr_auc"],
            )

        output["breed_strategy"][target] = strategy_rows
        output["breed_strategy_tests"][target] = {
            "llm_vs_rules": delong_style_paired_bootstrap(
                y_reference, strategy_probabilities["llm"], strategy_probabilities["rules"], n_boot=1000
            ),
            "llm_vs_none": delong_style_paired_bootstrap(
                y_reference, strategy_probabilities["llm"], strategy_probabilities["none"], n_boot=1000
            ),
            "rules_vs_none": delong_style_paired_bootstrap(
                y_reference, strategy_probabilities["rules"], strategy_probabilities["none"], n_boot=1000
            ),
        }
        for key, value in output["breed_strategy_tests"][target].items():
            log.info(
                "  [%s] %-14s delta=%+.4f  CI [%+.4f, %+.4f]  p=%.4f",
                target,
                key,
                value["auc_difference"],
                value["ci_low"],
                value["ci_high"],
                value["p_value"],
            )

    # ---- 3. weather, restricted to the covered window -----------------------
    log.info("=" * 70)
    log.info("WEATHER ABLATION ON THE COVERED WINDOW")
    covered = cohort.loc[cohort["has_weather"] == 1].copy()
    output["weather_window"] = {
        "n_episodes": len(covered),
        "coverage_share_of_cohort": round(float(len(covered) / len(cohort)), 4),
        "date_range": [
            str(covered["intake_datetime"].min().date()),
            str(covered["intake_datetime"].max().date()),
        ],
    }
    without = feature_columns(["animal", "intake_context", "shelter_load", "breed_llm"])
    with_weather = feature_columns(["animal", "intake_context", "shelter_load", "breed_llm", "weather"])
    output["weather_ablation"] = {}
    for target in [TARGET, SECOND_TARGET]:
        metrics_without, probabilities_without, y_covered = run_one(covered, without, target)
        metrics_with, probabilities_with, _ = run_one(covered, with_weather, target)
        output["weather_ablation"][target] = {
            "without_weather": {
                k: round(v, 4) for k, v in metrics_without.items() if isinstance(v, float)
            },
            "with_weather": {
                k: round(v, 4) for k, v in metrics_with.items() if isinstance(v, float)
            },
            "paired_test": delong_style_paired_bootstrap(
                y_covered, probabilities_with, probabilities_without, n_boot=1000
            ),
        }
        log.info(
            "  [%s] without=%.4f  with=%.4f  delta=%+.4f  p=%.4f",
            target,
            metrics_without["roc_auc"],
            metrics_with["roc_auc"],
            output["weather_ablation"][target]["paired_test"]["auc_difference"],
            output["weather_ablation"][target]["paired_test"]["p_value"],
        )

    # Quantify the artefact we chose not to report as a result, so a reader can
    # see the size of the trap rather than take our word that it existed.
    artefact_without, _, _ = run_one(cohort, without, SECOND_TARGET)
    artefact_with, _, _ = run_one(cohort, with_weather, SECOND_TARGET)
    output["weather_missingness_artefact"] = {
        "note": (
            "Full-cohort weather ablation, where the weather columns are missing for every intake after 2020-12-31 and the imputer emits a missingness indicator. On an earlier feature set that also contained two monotone calendar-time features, this configuration showed a spurious +0.0133 AUC gain on the long-stay target: the missingness indicator was acting as a post-2020 era flag. With those time features removed the spurious gain disappears, which is consistent with that diagnosis. The covered-window result above remains the honest test either way."
        ),
        "target": SECOND_TARGET,
        "auc_without_weather_full_cohort": round(artefact_without["roc_auc"], 4),
        "auc_with_weather_full_cohort": round(artefact_with["roc_auc"], 4),
        "spurious_gain": round(artefact_with["roc_auc"] - artefact_without["roc_auc"], 4),
    }
    log.info(
        "  artefact check on full cohort: %.4f -> %.4f (spurious +%.4f)",
        artefact_without["roc_auc"],
        artefact_with["roc_auc"],
        artefact_with["roc_auc"] - artefact_without["roc_auc"],
    )

    # ---- 4. leakage control -------------------------------------------------
    log.info("=" * 70)
    log.info("SHUFFLED LABEL CONTROL")
    rng = np.random.default_rng(RANDOM_SEED)
    shuffled = cohort.copy()
    labelled_mask = shuffled[TARGET].notna()
    values = shuffled.loc[labelled_mask, TARGET].to_numpy().copy()
    rng.shuffle(values)
    shuffled.loc[labelled_mask, TARGET] = values
    all_columns = feature_columns(list(FEATURE_BLOCKS))
    control_metrics, _, _ = run_one(shuffled, all_columns, TARGET)
    output["shuffled_label_control"] = {
        "roc_auc": round(control_metrics["roc_auc"], 4),
        "pr_auc": round(control_metrics["pr_auc"], 4),
        "interpretation": (
            "A model trained on shuffled labels should score near 0.5. Anything "
            "meaningfully above that would mean a feature encodes the outcome."
        ),
    }
    log.info("  shuffled label AUC = %.4f", control_metrics["roc_auc"])

    # ---- 5. second target, block ablation -----------------------------------
    log.info("=" * 70)
    log.info("CUMULATIVE BLOCKS, target %s", SECOND_TARGET)
    long_rows = []
    for label, blocks in CUMULATIVE_BLOCKS:
        columns = feature_columns(blocks)
        metrics, _, _ = run_one(cohort, columns, SECOND_TARGET)
        long_rows.append(
            {
                "configuration": label,
                "n_features": len(columns),
                "roc_auc": round(metrics["roc_auc"], 4),
                "pr_auc": round(metrics["pr_auc"], 4),
                "precision_at_50": round(metrics["precision_at_50"], 4),
                "lift_at_50": round(metrics["lift_at_50"], 3),
            }
        )
        log.info("  %-20s AUC=%.4f  lift@50=%.2f", label, metrics["roc_auc"], metrics["lift_at_50"])
    output["cumulative_blocks_long_stay"] = long_rows

    (ROOT / "results/tables/ablations.json").write_text(json.dumps(output, indent=2))
    log.info("Wrote results/tables/ablations.json")


if __name__ == "__main__":
    main()
