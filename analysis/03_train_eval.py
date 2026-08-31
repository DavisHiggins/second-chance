"""Step three: train every model on every target and record what actually happened.

Run order: 01_build_episodes.py, 02_build_features.py, then this.

Writes:
  results/tables/main_results.json      every metric for every model and target
  results/tables/subgroup_metrics.csv   per subgroup performance for the champion
  data/interim/test_predictions.parquet calibrated scores on the test block
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
log = logging.getLogger("train")

from secondchance.features import DEPLOYMENT_FEATURES as MODEL_FEATURES
from secondchance.features import build_cohort
from secondchance.modeling import (
    DEFAULT_SPLIT,
    bootstrap_metric,
    delong_style_paired_bootstrap,
    evaluate_binary,
    fit_calibrated,
    make_model,
    subgroup_metrics,
)

TARGETS = ["adopted_within_7d", "adopted_within_14d", "adopted_within_30d", "long_stay_60d"]
MODELS = ["prior", "logistic", "lightgbm", "xgboost"]
CHAMPION = "lightgbm"

# Subgroups we are obliged to check. The last three are the ones where a shelter
# model can do real damage if it is quietly worse for some animals than others.
SUBGROUP_COLUMNS = [
    "animal_type",
    "age_band",
    "sex_upon_intake",
    "intake_type",
    "intake_condition",
    "breed_primary_group",
    "breed_bully_type",
    "color_has_black",
    "breed_bsl_risk",
]


# build_cohort is imported above and re-exported here, because four other
# analysis scripts pull it off this module by name. The definition itself lives
# in the library so the command line tool, the ablation study and this script
# cannot drift into three slightly different cohorts.
__all__ = ["SUBGROUP_COLUMNS", "build_cohort", "main"]


def main() -> None:
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    cohort, exclusions = build_cohort(features)
    log.info("Cohort: %s", exclusions)

    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])
    block_counts = cohort["block"].value_counts().to_dict()
    log.info("Blocks: %s", block_counts)

    results: dict = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "split": DEFAULT_SPLIT.as_dict(),
        "cohort": exclusions,
        "block_counts": {k: int(v) for k, v in block_counts.items()},
        "block_date_ranges": {},
        "feature_count": len(MODEL_FEATURES),
        "targets": {},
    }
    for block in ["train", "valid", "test"]:
        sub = cohort.loc[cohort["block"] == block, "intake_datetime"]
        results["block_date_ranges"][block] = [str(sub.min().date()), str(sub.max().date())]

    stored_predictions: dict[str, pd.DataFrame] = {}

    for target in TARGETS:
        log.info("=" * 70)
        log.info("TARGET %s", target)
        labelled = cohort.loc[cohort[target].notna()].copy()
        train = labelled.loc[labelled["block"] == "train"]
        valid = labelled.loc[labelled["block"] == "valid"]
        test = labelled.loc[labelled["block"] == "test"]

        x_train, y_train = train[MODEL_FEATURES], train[target].to_numpy()
        x_valid, y_valid = valid[MODEL_FEATURES], valid[target].to_numpy()
        x_test, y_test = test[MODEL_FEATURES], test[target].to_numpy()

        pos_weight = float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
        target_block: dict = {
            "n_train": len(train),
            "n_valid": len(valid),
            "n_test": len(test),
            "train_positive_rate": float(y_train.mean()),
            "valid_positive_rate": float(y_valid.mean()),
            "test_positive_rate": float(y_test.mean()),
            "scale_pos_weight_used": round(pos_weight, 3),
            "models": {},
        }

        test_probabilities: dict[str, np.ndarray] = {}

        for name in MODELS:
            started = time.time()
            # Only the boosted models get the imbalance weight, and only on the
            # long stay target where the positive class is under nine percent.
            weight = pos_weight if (name in {"lightgbm", "xgboost"} and target == "long_stay_60d") else 1.0
            model = make_model(name, MODEL_FEATURES, scale_pos_weight=weight)

            if name == "prior":
                model.fit(x_train, y_train)
                raw_test = model.predict_proba(x_test)[:, 1]
                cal_test = raw_test
                cal_valid = model.predict_proba(x_valid)[:, 1]
            else:
                fitted, calibrated = fit_calibrated(model, x_train, y_train, x_valid, y_valid)
                raw_test = fitted.predict_proba(x_test)[:, 1]
                cal_test = calibrated.predict_proba(x_test)[:, 1]
                cal_valid = calibrated.predict_proba(x_valid)[:, 1]

            entry = {
                "fit_seconds": round(time.time() - started, 1),
                "test_raw": evaluate_binary(y_test, raw_test),
                "test_calibrated": evaluate_binary(y_test, cal_test),
                "valid_calibrated": evaluate_binary(y_valid, cal_valid),
            }
            if name != "prior":
                _, low, high = bootstrap_metric(y_test, cal_test, "roc_auc")
                entry["test_calibrated"]["roc_auc_ci"] = [round(low, 4), round(high, 4)]
                _, low, high = bootstrap_metric(y_test, cal_test, "pr_auc")
                entry["test_calibrated"]["pr_auc_ci"] = [round(low, 4), round(high, 4)]

            target_block["models"][name] = entry
            test_probabilities[name] = cal_test
            log.info(
                "  %-10s raw AUC %.4f  calibrated AUC %.4f  ECE %.4f  Brier %.4f  (%.0fs)",
                name,
                entry["test_raw"]["roc_auc"],
                entry["test_calibrated"]["roc_auc"],
                entry["test_calibrated"]["ece"],
                entry["test_calibrated"]["brier"],
                entry["fit_seconds"],
            )

        # Head to head against the strongest non boosted alternative.
        target_block["champion_vs_logistic"] = delong_style_paired_bootstrap(
            y_test, test_probabilities[CHAMPION], test_probabilities["logistic"]
        )
        target_block["champion_vs_xgboost"] = delong_style_paired_bootstrap(
            y_test, test_probabilities[CHAMPION], test_probabilities["xgboost"]
        )

        results["targets"][target] = target_block

        keep = list(
            dict.fromkeys(
                [
                    "episode_id", "animal_id", "animal_type",
                    "intake_datetime", "breed", "name",
                    *SUBGROUP_COLUMNS,
                ]
            )
        )
        frame = test[keep].copy()
        frame[f"y_{target}"] = y_test
        for name, probs in test_probabilities.items():
            frame[f"p_{name}_{target}"] = probs
        stored_predictions[target] = frame

    # Subgroup breakdown for the champion on the 30 day target, which is the one
    # the outreach planner in the product actually uses.
    focus = "adopted_within_30d"
    frame = stored_predictions[focus]
    sub = subgroup_metrics(
        frame.reset_index(drop=True),
        frame[f"y_{focus}"].to_numpy(),
        frame[f"p_{CHAMPION}_{focus}"].to_numpy(),
        SUBGROUP_COLUMNS,
    )
    sub.to_csv(ROOT / "results/tables/subgroup_metrics.csv", index=False)
    log.info("\n%s", sub.head(30).to_string(index=False))

    long_stay = stored_predictions["long_stay_60d"]
    sub_ls = subgroup_metrics(
        long_stay.reset_index(drop=True),
        long_stay["y_long_stay_60d"].to_numpy(),
        long_stay[f"p_{CHAMPION}_long_stay_60d"].to_numpy(),
        SUBGROUP_COLUMNS,
    )
    sub_ls.to_csv(ROOT / "results/tables/subgroup_metrics_long_stay.csv", index=False)

    merged = stored_predictions[TARGETS[0]]
    for target in TARGETS[1:]:
        cols = [c for c in stored_predictions[target].columns if c.startswith(("y_", "p_"))]
        merged = merged.merge(
            stored_predictions[target][["episode_id", *cols]], on="episode_id", how="outer"
        )
    merged.to_parquet(ROOT / "data/interim/test_predictions.parquet", index=False)

    (ROOT / "results/tables/main_results.json").write_text(json.dumps(results, indent=2))
    log.info("Wrote results/tables/main_results.json")


if __name__ == "__main__":
    main()
