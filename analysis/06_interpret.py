"""Step six: work out what the model is actually keying on, and whether we believe it.

Feature importance from a boosted tree is easy to produce and easy to
misinterpret. Split-count importance rewards high cardinality columns, and
neither split counts nor gain say anything about direction. So this script uses
three views that answer different questions:

  SHAP values           per animal contributions with a sign, so we can put a
                        real explanation on the queue card the shelter sees
  Permutation importance what the held out score loses when a column is broken,
                        which is the only importance that is about generalisation
  Partial dependence    the shape of the relationship, which is where the
                        surprises live

Where the three disagree, that disagreement is the finding, and the paper says so
rather than picking whichever chart looks tidiest.

Writes results/tables/interpretability.json, shap_importance.csv,
permutation_importance.csv, partial_dependence.csv and example_explanations.json.
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
log = logging.getLogger("interpret")

from importlib import import_module

from secondchance.features import DEPLOYMENT_FEATURES as MODEL_FEATURES
from secondchance.modeling import DEFAULT_SPLIT, RANDOM_SEED, build_preprocessor

build_cohort = import_module("03_train_eval").build_cohort

TARGET = "adopted_within_30d"
LONG_STAY = "long_stay_60d"
PERMUTATION_SAMPLE = 6000
PERMUTATION_REPEATS = 8
SHAP_SAMPLE = 4000


def readable(name: str) -> str:
    """Turn a transformer output name into something a human would say."""
    trimmed = name.split("__", 1)[-1]
    return trimmed.replace("_", " ")


def main() -> None:
    import lightgbm as lgb
    import shap
    from sklearn.inspection import permutation_importance
    from sklearn.metrics import roc_auc_score

    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    cohort, _ = build_cohort(features)
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])

    output: dict = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    for target, tag in [(TARGET, "adopt_30d"), (LONG_STAY, "long_stay_60d")]:
        log.info("=" * 70)
        log.info("INTERPRETING %s", target)
        labelled = cohort.loc[cohort[target].notna()]
        train = labelled.loc[labelled["block"] == "train"]
        test = labelled.loc[labelled["block"] == "test"]

        preprocessor = build_preprocessor(MODEL_FEATURES)
        x_train = preprocessor.fit_transform(train[MODEL_FEATURES])
        x_test = preprocessor.transform(test[MODEL_FEATURES])
        names = [readable(n) for n in preprocessor.get_feature_names_out()]
        y_train = train[target].to_numpy()
        y_test = test[target].to_numpy()

        weight = (
            float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
            if target == LONG_STAY
            else 1.0
        )
        model = lgb.LGBMClassifier(
            n_estimators=600,
            learning_rate=0.05,
            num_leaves=48,
            min_child_samples=60,
            subsample=0.85,
            subsample_freq=1,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            scale_pos_weight=weight,
            random_state=RANDOM_SEED,
            n_jobs=-1,
            verbose=-1,
        )
        model.fit(x_train, y_train)
        baseline_auc = float(roc_auc_score(y_test, model.predict_proba(x_test)[:, 1]))
        log.info("  baseline test AUC %.4f", baseline_auc)

        # ---- SHAP ----------------------------------------------------------
        rng = np.random.default_rng(RANDOM_SEED)
        shap_index = rng.choice(len(x_test), size=min(SHAP_SAMPLE, len(x_test)), replace=False)
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(x_test[shap_index])
        if isinstance(shap_values, list):  # older shap returns one array per class
            shap_values = shap_values[1]
        if shap_values.ndim == 3:
            shap_values = shap_values[:, :, 1]

        shap_frame = pd.DataFrame(
            {
                "feature": names,
                "mean_abs_shap": np.abs(shap_values).mean(axis=0),
                "mean_shap": shap_values.mean(axis=0),
                # Sign of the correlation between the feature value and its own
                # SHAP value: positive means "more of this feature pushes the
                # prediction up".
                "direction": [
                    float(np.corrcoef(x_test[shap_index][:, j], shap_values[:, j])[0, 1])
                    if np.std(x_test[shap_index][:, j]) > 0
                    else 0.0
                    for j in range(len(names))
                ],
            }
        ).sort_values("mean_abs_shap", ascending=False)
        shap_frame.to_csv(ROOT / f"results/tables/shap_importance_{tag}.csv", index=False)
        log.info("\n  Top SHAP features:\n%s", shap_frame.head(15).round(4).to_string(index=False))

        # ---- permutation importance ----------------------------------------
        perm_index = rng.choice(len(x_test), size=min(PERMUTATION_SAMPLE, len(x_test)), replace=False)
        perm = permutation_importance(
            model,
            x_test[perm_index],
            y_test[perm_index],
            scoring="roc_auc",
            n_repeats=PERMUTATION_REPEATS,
            random_state=RANDOM_SEED,
            n_jobs=1,
        )
        perm_frame = pd.DataFrame(
            {
                "feature": names,
                "auc_drop_mean": perm.importances_mean,
                "auc_drop_std": perm.importances_std,
            }
        ).sort_values("auc_drop_mean", ascending=False)
        perm_frame.to_csv(ROOT / f"results/tables/permutation_importance_{tag}.csv", index=False)
        log.info(
            "\n  Top permutation features:\n%s",
            perm_frame.head(15).round(5).to_string(index=False),
        )

        # ---- partial dependence for the columns a shelter can act on --------
        pdp_rows = []
        actionable = {
            "age at intake days": np.array([14, 30, 60, 120, 180, 365, 730, 1460, 2920, 4380]),
            "shelter census at intake": np.array([400, 600, 800, 1000, 1200, 1400, 1600]),
            "breed weight lb": np.array([5, 10, 20, 30, 45, 60, 80, 110, 150]),
            "name length": np.array([0, 3, 5, 7, 9, 12]),
        }
        for feature, grid in actionable.items():
            if feature not in names:
                continue
            column = names.index(feature)
            sample = x_test[rng.choice(len(x_test), size=min(2000, len(x_test)), replace=False)].copy()
            # The transformer scaled the numerics, so the grid has to be scaled
            # the same way before it is written into the design matrix.
            numeric_step = preprocessor.named_transformers_["numeric"]
            raw_name = feature.replace(" ", "_")
            scaler = numeric_step.named_steps["scale"]
            raw_columns = list(preprocessor.transformers_[0][2])
            if raw_name in raw_columns:
                position = raw_columns.index(raw_name)
                centre, scale = scaler.mean_[position], scaler.scale_[position]
            else:
                centre, scale = 0.0, 1.0
            for value in grid:
                probe = sample.copy()
                probe[:, column] = (value - centre) / scale
                pdp_rows.append(
                    {
                        "target": target,
                        "feature": feature,
                        "value": float(value),
                        "mean_prediction": float(model.predict_proba(probe)[:, 1].mean()),
                    }
                )
        pd.DataFrame(pdp_rows).to_csv(
            ROOT / f"results/tables/partial_dependence_{tag}.csv", index=False
        )

        # ---- agreement between the two importance views ---------------------
        merged = shap_frame.merge(perm_frame, on="feature")
        agreement = float(
            merged["mean_abs_shap"].rank().corr(merged["auc_drop_mean"].rank(), method="spearman")
        )

        output[tag] = {
            "target": target,
            "baseline_test_auc": round(baseline_auc, 4),
            "n_train": len(train),
            "n_test": len(test),
            "shap_sample": len(shap_index),
            "permutation_sample": len(perm_index),
            "permutation_repeats": PERMUTATION_REPEATS,
            "top_10_shap": shap_frame.head(10)[["feature", "mean_abs_shap", "direction"]]
            .round(4)
            .to_dict("records"),
            "top_10_permutation": perm_frame.head(10)[["feature", "auc_drop_mean", "auc_drop_std"]]
            .round(5)
            .to_dict("records"),
            "shap_permutation_rank_correlation": round(agreement, 4),
        }
        log.info("  SHAP vs permutation rank correlation: %.3f", agreement)

        # ---- worked examples for the product's explanation card -------------
        if target == TARGET:
            probabilities = model.predict_proba(x_test)[:, 1]
            examples = []
            for label, position in [
                ("lowest predicted adoption chance", int(np.argmin(probabilities))),
                ("highest predicted adoption chance", int(np.argmax(probabilities))),
                ("median predicted adoption chance", int(np.argsort(probabilities)[len(probabilities) // 2])),
            ]:
                single = explainer.shap_values(x_test[position : position + 1])
                if isinstance(single, list):
                    single = single[1]
                if single.ndim == 3:
                    single = single[:, :, 1]
                contributions = pd.DataFrame(
                    {"feature": names, "shap": single[0]}
                )
                contributions["abs"] = contributions["shap"].abs()
                top = contributions.nlargest(6, "abs")
                record = test.iloc[position]
                examples.append(
                    {
                        "case": label,
                        "animal_type": str(record["animal_type"]),
                        "breed": str(record["breed"]),
                        "age_band": str(record["age_band"]),
                        "intake_type": str(record["intake_type"]),
                        "predicted_probability": round(float(probabilities[position]), 4),
                        "actual_outcome_adopted_within_30d": int(record[TARGET]),
                        "drivers": [
                            {"feature": r.feature, "contribution": round(float(r.shap), 4)}
                            for r in top.itertuples()
                        ],
                    }
                )
            (ROOT / "results/tables/example_explanations.json").write_text(
                json.dumps(examples, indent=2)
            )
            log.info("\n%s", json.dumps(examples, indent=2)[:2000])

    (ROOT / "results/tables/interpretability.json").write_text(json.dumps(output, indent=2))
    log.info("Wrote results/tables/interpretability.json")


if __name__ == "__main__":
    main()
