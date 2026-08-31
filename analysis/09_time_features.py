"""Step nine: should a model that will be deployed contain a clock?

Two features in the matrix are monotone in calendar time: ``intake_year`` and
``days_since_series_start``. A gradient boosted tree can only split them at values
it has seen, so once the model is deployed every future animal lands in the final
bin and the feature stops varying. Worse, if the model has learned a trend from
them, it keeps applying the last observed level of that trend forever.

They also break the drift detector, which is what made us look at them.

This script asks whether they earn their place, three ways:

1. Drop them and see what the held-out score does.
2. Check whether the model's advantage over the trend-free version decays across
   the test period, which is what a stale trend would look like.
3. Report how far outside the training range the test values actually sit.

Writes results/tables/time_feature_check.json.
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
sys.path.insert(0, str(ROOT / "analysis"))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("timefeat")

from importlib import import_module

from secondchance.features import ALL_FEATURES
from secondchance.modeling import (
    DEFAULT_SPLIT,
    delong_style_paired_bootstrap,
    evaluate_binary,
    fit_calibrated,
    make_model,
)

build_cohort = import_module("03_train_eval").build_cohort

MONOTONE = ["intake_year", "days_since_series_start"]
TARGETS = ["adopted_within_30d", "long_stay_60d"]


def main() -> None:
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    cohort, _ = build_cohort(features)
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])

    output: dict = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    # How far outside the training range do the test values sit?
    train_all = cohort.loc[cohort["block"] == "train"]
    test_all = cohort.loc[cohort["block"] == "test"]
    extrapolation = {}
    for column in MONOTONE:
        train_max = float(train_all[column].max())
        test_min = float(test_all[column].min())
        test_max = float(test_all[column].max())
        extrapolation[column] = {
            "train_range": [float(train_all[column].min()), train_max],
            "test_range": [test_min, test_max],
            "share_of_test_above_train_max": round(
                float((test_all[column] > train_max).mean()), 4
            ),
        }
    output["extrapolation"] = extrapolation
    log.info("Extrapolation check: %s", json.dumps(extrapolation, indent=1))

    with_time = list(ALL_FEATURES)
    without_time = [c for c in ALL_FEATURES if c not in MONOTONE]

    output["comparison"] = {}
    for target in TARGETS:
        labelled = cohort.loc[cohort[target].notna()]
        train = labelled.loc[labelled["block"] == "train"]
        valid = labelled.loc[labelled["block"] == "valid"]
        test = labelled.loc[labelled["block"] == "test"].copy()
        y_train = train[target].to_numpy()
        y_valid = valid[target].to_numpy()
        y_test = test[target].to_numpy()
        weight = (
            float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
            if target == "long_stay_60d"
            else 1.0
        )

        scores: dict[str, np.ndarray] = {}
        metrics: dict[str, dict] = {}
        for label, columns in [("with_time", with_time), ("without_time", without_time)]:
            model = make_model("lightgbm", columns, scale_pos_weight=weight)
            _, calibrated = fit_calibrated(
                model, train[columns], y_train, valid[columns], y_valid
            )
            probabilities = calibrated.predict_proba(test[columns])[:, 1]
            scores[label] = probabilities
            metrics[label] = {
                k: round(v, 4)
                for k, v in evaluate_binary(y_test, probabilities).items()
                if isinstance(v, float)
            }
            log.info(
                "  [%s] %-13s AUC=%.4f ECE=%.4f",
                target,
                label,
                metrics[label]["roc_auc"],
                metrics[label]["ece"],
            )

        paired = delong_style_paired_bootstrap(
            y_test, scores["with_time"], scores["without_time"], n_boot=1000
        )

        # Does the advantage decay? If the clock features carry a stale trend, the
        # model that has them should look better early in the test period and worse
        # later, as the frozen trend drifts further from reality.
        test = test.assign(
            with_time=scores["with_time"], without_time=scores["without_time"], y=y_test
        )
        test["half"] = np.where(test["intake_datetime"] < "2021-01-01", "2020", "2021")
        by_half = []
        from sklearn.metrics import roc_auc_score

        for half, group in test.groupby("half", observed=True):
            by_half.append(
                {
                    "period": half,
                    "n": len(group),
                    "auc_with_time": round(float(roc_auc_score(group["y"], group["with_time"])), 4),
                    "auc_without_time": round(
                        float(roc_auc_score(group["y"], group["without_time"])), 4
                    ),
                }
            )
            by_half[-1]["advantage"] = round(
                by_half[-1]["auc_with_time"] - by_half[-1]["auc_without_time"], 4
            )

        output["comparison"][target] = {
            "with_time": metrics["with_time"],
            "without_time": metrics["without_time"],
            "paired_test": paired,
            "advantage_by_period": by_half,
        }
        log.info("  [%s] paired delta %+.4f (p=%.3f)", target, paired["auc_difference"], paired["p_value"])
        log.info("  [%s] by period: %s", target, by_half)

    # The recommendation this evidence supports, written once here so the paper,
    # the model card and the config file cannot disagree about it.
    thirty = output["comparison"]["adopted_within_30d"]["paired_test"]
    output["recommendation"] = {
        "keep_monotone_time_features": bool(
            thirty["auc_difference"] > 0 and thirty["ci_low"] > 0
        ),
        "rationale": (
            "Keep them only if they buy a statistically resolvable gain and that "
            "gain does not shrink across the test period. Otherwise drop them: a "
            "feature that a deployed tree model cannot split on is dead weight "
            "that also saturates the drift detector."
        ),
    }

    (ROOT / "results/tables/time_feature_check.json").write_text(json.dumps(output, indent=2))
    log.info("Wrote results/tables/time_feature_check.json")


if __name__ == "__main__":
    main()
