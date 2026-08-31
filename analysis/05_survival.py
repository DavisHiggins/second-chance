"""Step five: survival analysis of time to adoption.

Writes:
  results/tables/survival_results.json
  results/tables/km_curves.csv                 curves for the figures
  results/tables/cox_coefficients.csv
  data/interim/survival_predictions.parquet    per animal predicted curves
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
log = logging.getLogger("survival")

from importlib import import_module

from secondchance.features import feature_columns
from secondchance.modeling import DEFAULT_SPLIT, build_preprocessor
from secondchance.survival import (
    competing_risk_incidence,
    concordance,
    cumulative_incidence,
    expand_person_period,
    expected_days,
    fit_cox,
    integrated_brier_score,
    kaplan_meier,
    median_survival_days,
    survival_from_hazards,
    to_survival_arrays,
)

build_cohort = import_module("03_train_eval").build_cohort

HORIZON_DAYS = 365.0
# Daily resolution for the first fortnight, because half of all adoptions happen
# inside it and weekly bins would smear the shape that matters most. Weekly to
# three months, then monthly out to a year where the sample thins out.
BIN_EDGES = np.unique(
    np.concatenate(
        [
            np.arange(0, 15, 1.0),
            np.arange(14, 91, 7.0),
            np.arange(90, 366, 30.0),
            [365.0],
        ]
    )
)


def main() -> None:
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    cohort, _ = build_cohort(features)
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])
    cohort = cohort.loc[cohort["block"] != "excluded"].reset_index(drop=True)

    arrays = to_survival_arrays(cohort, max_days=HORIZON_DAYS)
    cohort["duration"] = arrays.duration
    cohort["event_adoption"] = arrays.event_adoption
    cohort["event_code_capped"] = arrays.event_code

    output: dict = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "horizon_days": HORIZON_DAYS,
        "n_episodes": len(cohort),
        "n_adoptions": int(arrays.event_adoption.sum()),
        "n_competing_exits": int((arrays.event_code == 2).sum()),
        "n_censored": int((arrays.event_code == 0).sum()),
        "n_bins": int(len(BIN_EDGES) - 1),
    }
    log.info(
        "episodes=%d adoptions=%d competing=%d censored=%d",
        output["n_episodes"],
        output["n_adoptions"],
        output["n_competing_exits"],
        output["n_censored"],
    )

    # ---- 1. the estimator comparison that motivates competing risks ---------
    km = kaplan_meier(arrays)
    cif = cumulative_incidence(arrays, cause=1)
    output["median_days_to_adoption_cause_specific"] = median_survival_days(arrays)

    checkpoints = [7, 14, 30, 60, 90, 180, 365]
    comparison = []
    for day in checkpoints:
        km_value = float(np.interp(day, km["day"], km["adopted_cumulative"]))
        cif_value = float(np.interp(day, cif["day"], cif["cumulative_incidence"]))
        comparison.append(
            {
                "day": day,
                "kaplan_meier_cause_specific": round(km_value, 4),
                "aalen_johansen_cif": round(cif_value, 4),
                "overstatement": round(km_value - cif_value, 4),
                "relative_overstatement_pct": round(100 * (km_value - cif_value) / cif_value, 2),
            }
        )
    output["estimator_comparison"] = comparison
    log.info("\n%s", pd.DataFrame(comparison).to_string(index=False))

    # ---- 2. curves by stratum, for the figures ------------------------------
    curves = []
    for column, levels in [
        ("animal_type", ["Dog", "Cat"]),
        ("age_band", ["neonate", "puppy_kitten", "juvenile", "young_adult", "adult", "senior"]),
        ("breed_bully_type", [0, 1]),
        ("color_has_black", [0, 1]),
        ("intake_type", ["Stray", "Owner Surrender", "Public Assist", "Abandoned"]),
    ]:
        for level in levels:
            subset = cohort.loc[cohort[column] == level]
            if len(subset) < 300:
                continue
            sub_arrays = to_survival_arrays(subset, max_days=HORIZON_DAYS)
            sub_km = kaplan_meier(sub_arrays)
            sub_cif = cumulative_incidence(sub_arrays, cause=1)
            for day in np.arange(0, 181, 1.0):
                curves.append(
                    {
                        "stratum": column,
                        "level": str(level),
                        "n": len(subset),
                        "day": day,
                        "km_adopted": float(np.interp(day, sub_km["day"], sub_km["adopted_cumulative"])),
                        "cif_adopted": float(
                            np.interp(day, sub_cif["day"], sub_cif["cumulative_incidence"])
                        ),
                    }
                )
    curve_frame = pd.DataFrame(curves)
    curve_frame.to_csv(ROOT / "results/tables/km_curves.csv", index=False)

    stratum_summary = []
    for (column, level), group in curve_frame.groupby(["stratum", "level"]):
        row = {"stratum": column, "level": level, "n": int(group["n"].iloc[0])}
        for day in [7, 30, 90, 180]:
            match = group.loc[group["day"] == day]
            row[f"cif_day_{day}"] = round(float(match["cif_adopted"].iloc[0]), 4)
        stratum_summary.append(row)
    output["stratum_cif"] = stratum_summary
    log.info("\n%s", pd.DataFrame(stratum_summary).to_string(index=False))

    # ---- 3. Cox proportional hazards ---------------------------------------
    continuous_columns = [
        "age_at_intake_log",
        "is_sterilized_at_intake",
        "is_female",
        "has_name",
        "name_is_shelter_assigned",
        "breed_size_ordinal",
        "breed_coat_ordinal",
        "breed_energy_ordinal",
        "breed_bully_type",
        "breed_bsl_risk",
        "breed_purebred",
        "breed_is_mix",
        "color_has_black",
        "shelter_census_at_intake",
        "prior_intake_count",
    ]
    train = cohort.loc[cohort["block"] == "train"].copy()
    test = cohort.loc[cohort["block"] == "test"].copy()

    # Standardise so hazard ratios are per standard deviation and therefore
    # comparable to one another rather than to whatever units the column happens
    # to use.
    means = train[continuous_columns].mean()
    stds = train[continuous_columns].std().replace(0, 1)
    train_scaled = train.copy()
    test_scaled = test.copy()
    train_scaled[continuous_columns] = (train[continuous_columns] - means) / stds
    test_scaled[continuous_columns] = (test[continuous_columns] - means) / stds
    train_scaled[continuous_columns] = train_scaled[continuous_columns].fillna(0)
    test_scaled[continuous_columns] = test_scaled[continuous_columns].fillna(0)

    # The categorical intake fields carry most of the signal a shelter manager
    # would name first, and leaving them out of the Cox model was making it look
    # much weaker than it is. Reference levels are the most common category, so a
    # hazard ratio reads as "relative to an ordinary stray dog in normal condition".
    dummy_specs = [
        ("animal_type", "Dog"),
        ("intake_type", "Stray"),
        ("intake_condition", "Normal"),
        ("age_band", "young_adult"),
    ]
    cox_columns = list(continuous_columns)
    for column, reference in dummy_specs:
        dummies = pd.get_dummies(train_scaled[column], prefix=column).astype(float)
        test_dummies = pd.get_dummies(test_scaled[column], prefix=column).astype(float)
        keep = [
            c
            for c in dummies.columns
            if c != f"{column}_{reference}" and dummies[c].sum() >= 200
        ]
        for name in keep:
            train_scaled[name] = dummies[name]
            test_scaled[name] = test_dummies.get(name, 0.0)
        cox_columns.extend(keep)

    # A light penalty rather than a heavy one. With 87,000 episodes and 40,000
    # events there is plenty of information here; the earlier value of 0.1 was
    # shrinking real effects toward one and making the table say less than the
    # data supports.
    cox = fit_cox(train_scaled, cox_columns, penalizer=0.01)
    summary = cox.summary[["coef", "exp(coef)", "se(coef)", "exp(coef) lower 95%", "exp(coef) upper 95%", "p"]]
    summary = summary.rename(
        columns={
            "exp(coef)": "hazard_ratio",
            "exp(coef) lower 95%": "hr_lower_95",
            "exp(coef) upper 95%": "hr_upper_95",
        }
    ).sort_values("hazard_ratio", ascending=False)
    summary.to_csv(ROOT / "results/tables/cox_coefficients.csv")
    log.info("\nCox hazard ratios per standard deviation:\n%s", summary.round(4).to_string())

    cox_risk_test = cox.predict_partial_hazard(test_scaled[cox_columns]).to_numpy()
    output["cox"] = {
        "n_train": len(train_scaled),
        "n_test": len(test_scaled),
        "n_covariates": len(cox_columns),
        "concordance_train": float(cox.concordance_index_),
        "concordance_test": concordance(
            test_scaled["duration"].to_numpy(),
            cox_risk_test,
            test_scaled["event_adoption"].to_numpy(),
        ),
        "log_likelihood": float(cox.log_likelihood_),
        "penalizer": 0.01,
        "top_accelerators": summary.head(5)["hazard_ratio"].round(3).to_dict(),
        "top_decelerators": summary.tail(5)["hazard_ratio"].round(3).to_dict(),
    }
    log.info("Cox concordance: train %.4f  test %.4f",
             output["cox"]["concordance_train"], output["cox"]["concordance_test"])

    # ---- 4. discrete time hazard model with gradient boosting ---------------
    import lightgbm as lgb

    model_columns = feature_columns(["animal", "intake_context", "shelter_load", "breed_llm"])
    expanded_train = expand_person_period(train, model_columns, BIN_EDGES)
    log.info(
        "person-period expansion: %d episodes -> %d rows (%.1fx)",
        len(train),
        len(expanded_train),
        len(expanded_train) / len(train),
    )

    design_columns = [*model_columns, "interval"]
    preprocessor = build_preprocessor(design_columns)
    x_train = preprocessor.fit_transform(expanded_train[design_columns])

    def new_booster() -> lgb.LGBMClassifier:
        return lgb.LGBMClassifier(
            n_estimators=400,
            learning_rate=0.06,
            num_leaves=64,
            min_child_samples=100,
            subsample=0.8,
            subsample_freq=1,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            random_state=20260820,
            n_jobs=-1,
            verbose=-1,
        )

    # Two cause-specific hazards, not one. Modelling adoption alone and reporting
    # 1 - prod(1 - h) answers a counterfactual question about a shelter with no
    # transfers, which is not the shelter Austin runs. See
    # secondchance.survival.competing_risk_incidence for the arithmetic.
    log.info("  fitting adoption hazard")
    adoption_model = new_booster()
    adoption_model.fit(x_train, expanded_train["hazard_label"].to_numpy())

    log.info("  fitting competing exit hazard")
    other_model = new_booster()
    other_model.fit(x_train, expanded_train["other_exit_label"].to_numpy())

    # Score every test animal in every interval, whether or not it survived that
    # long, so we get a complete predicted curve for each one.
    n_intervals = len(BIN_EDGES) - 1
    hazard_matrix = np.zeros((len(test), n_intervals))
    other_matrix = np.zeros((len(test), n_intervals))
    for j in range(n_intervals):
        block = test[model_columns].copy()
        block["interval"] = j
        design = preprocessor.transform(block[design_columns])
        hazard_matrix[:, j] = adoption_model.predict_proba(design)[:, 1]
        other_matrix[:, j] = other_model.predict_proba(design)[:, 1]

    # The cause-specific survival curve, kept for the comparison table that shows
    # how far wrong the naive construction goes.
    naive_survival = survival_from_hazards(hazard_matrix)
    survival_matrix, adoption_cif = competing_risk_incidence(hazard_matrix, other_matrix)
    rmst = expected_days(survival_matrix, BIN_EDGES)

    durations_test = test["duration"].to_numpy()
    events_test = test["event_adoption"].to_numpy()
    day30 = int(np.searchsorted(BIN_EDGES[1:], 30.0, side="left"))
    risk_score = adoption_cif[:, day30]

    # The Brier score is scored against "did this animal leave the shelter", which
    # is the quantity S(t) actually predicts once both causes are in the model.
    any_exit = (test["event_code_capped"] != 0).astype(int).to_numpy()
    log.info("  scoring complete, computing integrated Brier score")
    ibs_model = integrated_brier_score(survival_matrix, durations_test, any_exit, BIN_EDGES)

    # Reference model: the training set Kaplan-Meier curve applied to everyone.
    # Any model that cannot beat "assume every animal is average" is not earning
    # its keep.
    # Baseline: apply the training set's overall exit curve to every animal. Any
    # model that cannot beat "assume every animal is average" is not earning its
    # keep.
    from lifelines import KaplanMeierFitter

    overall = KaplanMeierFitter()
    train_capped = to_survival_arrays(train, max_days=HORIZON_DAYS)
    overall.fit(train_capped.duration, (train_capped.event_code != 0).astype(int))
    baseline_curve = np.interp(
        BIN_EDGES[1:],
        overall.survival_function_.index.to_numpy(),
        overall.survival_function_.iloc[:, 0].to_numpy(),
    )
    baseline_matrix = np.tile(baseline_curve, (len(test), 1))
    ibs_baseline = integrated_brier_score(baseline_matrix, durations_test, any_exit, BIN_EDGES)

    output["discrete_time_hazard"] = {
        "n_person_period_rows_train": len(expanded_train),
        "expansion_factor": round(len(expanded_train) / len(train), 2),
        "concordance_test": concordance(durations_test, risk_score, events_test),
        "integrated_brier_score": round(ibs_model, 5),
        "integrated_brier_score_km_baseline": round(ibs_baseline, 5),
        "ibs_improvement_pct": round(100 * (ibs_baseline - ibs_model) / ibs_baseline, 2),
        "predicted_rmst_days_mean": round(float(rmst.mean()), 2),
        "observed_mean_days_capped": round(float(durations_test.mean()), 2),
    }
    log.info(
        "Discrete-time hazard: C=%.4f  IBS=%.5f vs KM baseline %.5f (%.1f%% better)",
        output["discrete_time_hazard"]["concordance_test"],
        ibs_model,
        ibs_baseline,
        output["discrete_time_hazard"]["ibs_improvement_pct"],
    )

    # How much would we have overstated adoption by ignoring competing risks? This
    # is the same trap as the Kaplan-Meier versus Aalen-Johansen comparison above,
    # but at the level of individual predictions rather than the group curve.
    naive_30 = 1.0 - naive_survival[:, day30]
    proper_30 = adoption_cif[:, day30]
    output["competing_risk_correction"] = {
        "mean_naive_predicted_30d": round(float(naive_30.mean()), 4),
        "mean_competing_risk_predicted_30d": round(float(proper_30.mean()), 4),
        "mean_observed_cif_30d": round(
            float(
                np.interp(
                    30,
                    cumulative_incidence(to_survival_arrays(test, HORIZON_DAYS))["day"],
                    cumulative_incidence(to_survival_arrays(test, HORIZON_DAYS))[
                        "cumulative_incidence"
                    ],
                )
            ),
            4,
        ),
        "mean_absolute_overstatement": round(float((naive_30 - proper_30).mean()), 4),
    }
    log.info("Competing risk correction: %s", output["competing_risk_correction"])

    # Calibration of the predicted curve: bucket animals by predicted 30 day
    # adoption probability and compare against the observed Aalen-Johansen
    # incidence inside each bucket.
    predicted_30 = proper_30
    test = test.assign(predicted_adopt_30=predicted_30, rmst_days=rmst)
    deciles = pd.qcut(predicted_30, 10, labels=False, duplicates="drop")
    calibration_rows = []
    for decile in sorted(set(deciles)):
        mask = deciles == decile
        subset = test.loc[mask]
        sub_arrays = to_survival_arrays(subset, max_days=HORIZON_DAYS)
        observed = cumulative_incidence(sub_arrays, cause=1)
        calibration_rows.append(
            {
                "decile": int(decile) + 1,
                "n": int(mask.sum()),
                "mean_predicted_30d": round(float(predicted_30[mask].mean()), 4),
                "observed_cif_30d": round(
                    float(np.interp(30, observed["day"], observed["cumulative_incidence"])), 4
                ),
                "mean_predicted_rmst_days": round(float(rmst[mask].mean()), 2),
            }
        )
    output["survival_calibration_by_decile"] = calibration_rows
    log.info("\n%s", pd.DataFrame(calibration_rows).to_string(index=False))

    keep = [
        "episode_id", "animal_id", "animal_type", "breed", "name", "intake_datetime",
        "age_band", "breed_bully_type", "duration", "event_adoption",
        "predicted_adopt_30", "rmst_days",
    ]
    curve_columns = pd.DataFrame(
        survival_matrix, columns=[f"s_day_{int(d)}" for d in BIN_EDGES[1:]], index=test.index
    )
    pd.concat([test[keep], curve_columns], axis=1).to_parquet(
        ROOT / "data/interim/survival_predictions.parquet", index=False
    )

    (ROOT / "results/tables/survival_results.json").write_text(json.dumps(output, indent=2, default=float))
    log.info("Wrote results/tables/survival_results.json")


if __name__ == "__main__":
    main()
