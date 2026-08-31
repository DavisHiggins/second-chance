"""Step seven: monitoring, drift detection, and the retraining response.

This is the part of the project that makes it a system rather than a notebook.
It answers four questions with numbers rather than intentions:

1. Did the input distribution move between the training era and the test era?
2. Did the model's performance actually decay, and when?
3. Would our alerting rules have caught it, and how early?
4. Does retraining recover the loss, and by how much?

The Austin data contains a genuine, dated, externally caused distribution shift:
the shelter's operating model changed in March 2020. That gives us a real event
to detect rather than a synthetic one we injected ourselves, which is worth much
more as evidence that the monitoring works.

Writes results/tables/drift_results.json and monthly_performance.csv.
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
log = logging.getLogger("drift")

from importlib import import_module

from secondchance.features import (
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
)
from secondchance.features import (
    DEPLOYMENT_FEATURES as MODEL_FEATURES,
)
from secondchance.modeling import (
    DEFAULT_SPLIT,
    TemporalSplit,
    evaluate_binary,
    fit_calibrated,
    make_model,
)
from secondchance.monitor.drift import (
    DriftThresholds,
    classify,
    feature_drift_report,
    performance_report,
)

build_cohort = import_module("03_train_eval").build_cohort

TARGET = "adopted_within_30d"
SHIFT_DATE = pd.Timestamp("2020-03-15")  # Austin's shelter operations changed here

# Two of the model's features are monotone in calendar time: intake_year and
# days_since_series_start. Their population stability index against any earlier
# reference window is unbounded by construction, because every test value is
# larger than every training value. Leaving them in the monitored set produced a
# CRITICAL verdict in the very first quarter of the test period and in every
# quarter after, including quarters where nothing operational had changed. A
# detector that fires on day one and never stops is not a detector.
#
# They are excluded from drift monitoring and tracked separately as expected
# trend. Whether they belong in the model at all is a different question, which
# analysis/09_time_features.py answers with an experiment.
MONOTONE_TIME_FEATURES = ["intake_year", "days_since_series_start"]

# A second distinction that turned out to matter more than expected.
#
# Five of the model's features describe the shelter, not the animal: how full the
# building was, how many arrivals there had been in the last week and month, how
# many adoptions in the last month. Within any one week, every animal shares
# almost the same value. The "distribution" of such a feature inside a quarter is
# therefore close to a point mass, and the population stability index between two
# quarters is comparing two point masses that barely overlap. It returns a number
# around 8 whether the underlying level moved by two percent or by forty, which
# makes it useless as a severity signal.
#
# The right instrument for a shelter-level covariate is the change in its level.
# We monitor the two groups separately and report both.
# Third and last exclusion. Four features are deterministic functions of the
# calendar: intake_month, season, and the sine and cosine of day of year. Compare
# a single quarter against a multi-year reference and they will differ enormously,
# because one quarter is one season and the reference is all four. That is not
# drift, it is the calendar, and it was drowning the real signal at PSI around 6
# in every quarter of the test period including the stable ones.
#
# They stay in the model, where the cyclical encoding is doing useful work. They
# come out of the distributional monitor, where they only ever measure which part
# of the year the window happens to cover.
CALENDAR_CYCLE_FEATURES = ["intake_month", "season", "intake_doy_sin", "intake_doy_cos"]

SHELTER_LEVEL_FEATURES = [
    "shelter_census_at_intake",
    "species_census_at_intake",
    "intakes_prior_7d",
    "intakes_prior_30d",
    "adoptions_prior_30d",
]
MONITORED_NUMERIC = [
    c
    for c in NUMERIC_FEATURES
    if not c.startswith("weather_")
    and c not in MONOTONE_TIME_FEATURES
    and c not in SHELTER_LEVEL_FEATURES
    and c not in CALENDAR_CYCLE_FEATURES
]
MONITORED_CATEGORICAL = [c for c in CATEGORICAL_FEATURES if c not in CALENDAR_CYCLE_FEATURES]


def shelter_level_report(reference: pd.DataFrame, current: pd.DataFrame) -> pd.DataFrame:
    """Level comparison for the shelter-level covariates.

    Relative change in the mean, with a warning at 15 percent and a critical at 30
    percent. Those thresholds are a judgement, stated here rather than buried: a
    fifteen percent change in monthly intake volume is the kind of thing an
    operations manager would already have noticed, and a thirty percent change is
    a different shelter.
    """
    rows = []
    for column in SHELTER_LEVEL_FEATURES:
        before = float(np.nanmean(reference[column].to_numpy(dtype=float)))
        after = float(np.nanmean(current[column].to_numpy(dtype=float)))
        relative = (after - before) / before if before else float("nan")
        rows.append(
            {
                "feature": column,
                "reference_mean": round(before, 1),
                "current_mean": round(after, 1),
                "relative_change": round(relative, 4),
                "status": classify(abs(relative), 0.15, 0.30),
            }
        )
    return pd.DataFrame(rows).reindex(
        pd.DataFrame(rows)["relative_change"].abs().sort_values(ascending=False).index
    )


def main() -> None:
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    cohort, _ = build_cohort(features)
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])
    labelled = cohort.loc[cohort[TARGET].notna()].copy()

    train = labelled.loc[labelled["block"] == "train"]
    valid = labelled.loc[labelled["block"] == "valid"]
    test = labelled.loc[labelled["block"] == "test"].copy()

    thresholds = DriftThresholds()
    output: dict = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target": TARGET,
        "thresholds": thresholds.__dict__,
        "known_shift_date": str(SHIFT_DATE.date()),
        "monitored_feature_count": len(MONITORED_NUMERIC) + len(MONITORED_CATEGORICAL),
        "excluded_from_psi_monitoring": {
            "monotone_time_features": {
                "features": MONOTONE_TIME_FEATURES,
                "reason": (
                    "Monotone in calendar time, so their population stability index "
                    "against an earlier reference is unbounded by construction and "
                    "fires in every window regardless of whether anything changed."
                ),
            },
            "calendar_cycle_features": {
                "features": CALENDAR_CYCLE_FEATURES,
                "reason": (
                    "Deterministic functions of the calendar. A single quarter "
                    "compared against a multi-year reference differs on them by "
                    "construction, which is the season, not drift."
                ),
            },
            "shelter_level_features": {
                "features": SHELTER_LEVEL_FEATURES,
                "reason": (
                    "Near constant across animals within a week, so PSI between two "
                    "windows compares two point masses and saturates around 8 "
                    "regardless of the size of the real change. Monitored as a level "
                    "change instead, in shelter_level_drift."
                ),
            },
        },
    }

    # ---- 1. train the frozen production model ------------------------------
    log.info("Training the model that will be monitored")
    model = make_model("lightgbm", MODEL_FEATURES)
    _, calibrated = fit_calibrated(
        model,
        train[MODEL_FEATURES],
        train[TARGET].to_numpy(),
        valid[MODEL_FEATURES],
        valid[TARGET].to_numpy(),
    )
    valid_metrics = evaluate_binary(
        valid[TARGET].to_numpy(), calibrated.predict_proba(valid[MODEL_FEATURES])[:, 1]
    )
    baseline_auc = valid_metrics["roc_auc"]
    output["baseline"] = {
        "source": "validation block 2019, the last period before deployment",
        "roc_auc": round(baseline_auc, 4),
        "brier": round(valid_metrics["brier"], 4),
        "ece": round(valid_metrics["ece"], 4),
        "n": valid_metrics["n"],
    }
    log.info("Baseline validation AUC %.4f", baseline_auc)

    test["score"] = calibrated.predict_proba(test[MODEL_FEATURES])[:, 1]
    test["month"] = test["intake_datetime"].dt.to_period("M")
    test["quarter"] = test["intake_datetime"].dt.to_period("Q")

    # ---- 2. input drift, quarter by quarter --------------------------------
    log.info("=" * 70)
    log.info("INPUT DRIFT BY QUARTER")
    quarterly = []
    for quarter, group in test.groupby("quarter", observed=True):
        report = feature_drift_report(
            train, group, MONITORED_NUMERIC, MONITORED_CATEGORICAL, thresholds
        )
        critical = report.loc[report["status"] == "CRITICAL", "feature"].tolist()
        warning = report.loc[report["status"] == "WARNING", "feature"].tolist()
        quarterly.append(
            {
                "quarter": str(quarter),
                "n": len(group),
                "max_psi": round(float(report["psi"].max()), 4),
                "mean_psi": round(float(report["psi"].mean()), 4),
                "n_critical": len(critical),
                "n_warning": len(warning),
                "critical_features": critical[:6],
                "status": "CRITICAL" if critical else ("WARNING" if warning else "OK"),
            }
        )
        log.info(
            "  %s  n=%5d  max PSI=%.3f  critical=%d  %s",
            quarter,
            len(group),
            report["psi"].max(),
            len(critical),
            critical[:4],
        )
    output["input_drift_by_quarter"] = quarterly

    # ---- 2b. year over year reference --------------------------------------
    # Against a fixed 2018 reference, every quarter after March 2020 is critical.
    # That verdict is correct and almost useless: it says "the world you trained on
    # is gone", which stays true until somebody retrains, so the alarm never clears
    # and staff stop reading it.
    #
    # A moving reference asks a more actionable question: has anything changed
    # recently? The obvious version, this quarter against last quarter, does not
    # work here. Shelter intake is strongly seasonal, and comparing Q2 to Q1 makes
    # the season and day-of-year features change completely every single time, so
    # the detector fires on the calendar rather than on anything real. We measured
    # that: quarter over quarter, every comparison came back critical with `season`
    # as the worst feature, in 2019 as much as in 2020.
    #
    # Comparing each quarter against the same quarter one year earlier removes the
    # seasonal cycle by construction, which is also how any operations team already
    # thinks about volume. A deployed system wants both references: the fixed one
    # says whether the model is still inside its training domain, the year over
    # year one says when something just happened.
    log.info("=" * 70)
    log.info("YEAR OVER YEAR DRIFT")
    combined = pd.concat([valid, test]).sort_values("intake_datetime").copy()
    combined["quarter"] = combined["intake_datetime"].dt.to_period("Q")
    quarters = sorted(combined["quarter"].unique())
    rolling = []
    for current in quarters:
        previous = current - 4  # same quarter, one year earlier
        before = combined.loc[combined["quarter"] == previous]
        after = combined.loc[combined["quarter"] == current]
        if len(before) < 300 or len(after) < 300:
            continue
        report = feature_drift_report(
            before, after, MONITORED_NUMERIC, MONITORED_CATEGORICAL, thresholds
        )
        critical = report.loc[report["status"] == "CRITICAL", "feature"].tolist()
        rolling.append(
            {
                "quarter": str(current),
                "reference": str(previous),
                "n": len(after),
                "max_psi": round(float(report["psi"].max()), 4),
                "mean_psi": round(float(report["psi"].mean()), 4),
                "n_critical": len(critical),
                "worst_feature": str(report.iloc[0]["feature"]),
                "status": "CRITICAL" if critical else (
                    "WARNING" if (report["status"] == "WARNING").any() else "OK"
                ),
            }
        )
        log.info(
            "  %s vs %s  max PSI=%.3f  critical=%d  worst=%s",
            current,
            previous,
            report["psi"].max(),
            len(critical),
            report.iloc[0]["feature"],
        )
    output["year_over_year_drift"] = rolling
    peak = max(rolling, key=lambda r: r["max_psi"]) if rolling else None
    output["year_over_year_summary"] = {
        "peak_quarter": peak["quarter"] if peak else None,
        "peak_max_psi": peak["max_psi"] if peak else None,
        "quarters_critical": sum(1 for r in rolling if r["status"] == "CRITICAL"),
        "quarters_evaluated": len(rolling),
        "quarter_over_quarter_note": (
            "A quarter-over-quarter reference was tried first and rejected. Shelter "
            "intake is seasonal, so season and day-of-year change completely between "
            "adjacent quarters and the detector returned CRITICAL for every "
            "comparison in the series, including the stable 2019 quarters, with "
            "season as the worst feature every time."
        ),
        "interpretation": (
            "The fixed reference marks every post-shift quarter critical, which is "
            "true but never clears. The year over year reference localises the event "
            "and settles afterwards, which is what an on-call rota can act on."
        ),
    }

    # The post-shift block, used below for the shelter-level level-change table
    # and for the figure.
    post = test.loc[test["intake_datetime"] >= SHIFT_DATE]

    # Shelter-level covariates, measured as a level change rather than a
    # distributional one. See the note beside SHELTER_LEVEL_FEATURES.
    log.info("=" * 70)
    log.info("SHELTER-LEVEL COVARIATES, LEVEL CHANGE")
    level_report = shelter_level_report(train, post)
    level_report.to_csv(ROOT / "results/tables/shelter_level_drift.csv", index=False)
    output["shelter_level_drift"] = level_report.to_dict("records")
    log.info("\n%s", level_report.to_string(index=False))

    full_report = feature_drift_report(
        train, post, MONITORED_NUMERIC, MONITORED_CATEGORICAL, thresholds
    )
    full_report.to_csv(ROOT / "results/tables/feature_drift_post_shift.csv", index=False)
    output["top_drifting_features_post_shift"] = (
        full_report.head(12)[["feature", "kind", "psi", "status", "reference_mean", "current_mean"]]
        .round(4)
        .to_dict("records")
    )
    log.info("\n%s", full_report.head(12).round(4).to_string(index=False))

    # ---- 3. performance drift, month by month ------------------------------
    log.info("=" * 70)
    log.info("PERFORMANCE BY MONTH")
    monthly = performance_report(test, TARGET, "score", "month", baseline_auc, thresholds)
    monthly.to_csv(ROOT / "results/tables/monthly_performance.csv", index=False)
    log.info("\n%s", monthly.round(4).to_string(index=False))

    evaluable = monthly.loc[monthly["status"] != "INSUFFICIENT_DATA"]
    first_warning = evaluable.loc[evaluable["status"].isin(["WARNING", "CRITICAL"]), "period"]
    first_critical = evaluable.loc[evaluable["status"] == "CRITICAL", "period"]
    output["performance_drift"] = {
        "n_months_evaluated": len(evaluable),
        "months_ok": int((evaluable["status"] == "OK").sum()),
        "months_warning": int((evaluable["status"] == "WARNING").sum()),
        "months_critical": int((evaluable["status"] == "CRITICAL").sum()),
        "first_warning_month": str(first_warning.iloc[0]) if len(first_warning) else None,
        "first_critical_month": str(first_critical.iloc[0]) if len(first_critical) else None,
        "mean_auc_before_shift": round(
            float(evaluable.loc[evaluable["period"] < "2020-03", "roc_auc"].mean()), 4
        ),
        "mean_auc_after_shift": round(
            float(evaluable.loc[evaluable["period"] >= "2020-03", "roc_auc"].mean()), 4
        ),
        "worst_month": str(evaluable.loc[evaluable["roc_auc"].idxmin(), "period"]),
        "worst_month_auc": round(float(evaluable["roc_auc"].min()), 4),
        "largest_calibration_gap": round(float(evaluable["calibration_gap"].abs().max()), 4),
    }
    log.info("Performance drift summary: %s", output["performance_drift"])

    # ---- 4. did the early signal beat the late one? ------------------------
    # Input drift is available the day an animal arrives. Performance drift needs
    # the 30 day label plus a month of accumulation, so it is structurally at
    # least six weeks behind. This block puts a number on that gap.
    drift_alarm_quarter = next(
        (q["quarter"] for q in quarterly if q["status"] == "CRITICAL"), None
    )
    output["lead_time"] = {
        "first_critical_input_drift_quarter": drift_alarm_quarter,
        "first_critical_performance_month": output["performance_drift"]["first_critical_month"],
        "label_delay_days": 30,
        "note": (
            "Input drift is computable on the day of intake. The 30 day adoption "
            "label does not exist until 30 days later, and a month of labels has "
            "to accumulate before a monthly AUC means anything, so performance "
            "drift is at best six weeks behind the event that caused it. That gap "
            "is the operational argument for monitoring inputs as well as outcomes."
        ),
    }

    # ---- 5. retraining response --------------------------------------------
    log.info("=" * 70)
    log.info("RETRAINING RESPONSE")
    # Pretend it is 1 January 2021. The alarms have been firing for months. We
    # retrain on everything up to that date and see whether 2021 gets better.
    retrain_split = TemporalSplit(
        train_end=pd.Timestamp("2020-07-01"),
        valid_end=pd.Timestamp("2021-01-01"),
        test_end=pd.Timestamp("2022-01-03"),
    )
    retrain_frame = labelled.copy()
    retrain_frame["block"] = retrain_split.assign(retrain_frame["intake_datetime"])
    retrain_train = retrain_frame.loc[retrain_frame["block"] == "train"]
    retrain_valid = retrain_frame.loc[retrain_frame["block"] == "valid"]
    retrain_test = retrain_frame.loc[retrain_frame["block"] == "test"]

    fresh = make_model("lightgbm", MODEL_FEATURES)
    fresh_fitted, fresh_calibrated = fit_calibrated(
        fresh,
        retrain_train[MODEL_FEATURES],
        retrain_train[TARGET].to_numpy(),
        retrain_valid[MODEL_FEATURES],
        retrain_valid[TARGET].to_numpy(),
    )

    y_2021 = retrain_test[TARGET].to_numpy()
    stale_scores = calibrated.predict_proba(retrain_test[MODEL_FEATURES])[:, 1]
    fresh_scores = fresh_calibrated.predict_proba(retrain_test[MODEL_FEATURES])[:, 1]
    fresh_uncalibrated = fresh_fitted.predict_proba(retrain_test[MODEL_FEATURES])[:, 1]
    stale_metrics = evaluate_binary(y_2021, stale_scores)
    fresh_metrics = evaluate_binary(y_2021, fresh_scores)
    fresh_raw_metrics = evaluate_binary(y_2021, fresh_uncalibrated)

    output["retraining"] = {
        "evaluation_period": [
            str(retrain_test["intake_datetime"].min().date()),
            str(retrain_test["intake_datetime"].max().date()),
        ],
        "n_evaluated": len(retrain_test),
        "stale_model": {
            "trained_through": "2018-12-31",
            "calibrated_on": "2019",
            "roc_auc": round(stale_metrics["roc_auc"], 4),
            "brier": round(stale_metrics["brier"], 4),
            "ece": round(stale_metrics["ece"], 4),
            "calibration_gap": round(float(stale_scores.mean() - y_2021.mean()), 4),
        },
        "retrained_model": {
            "trained_through": "2020-06-30",
            "calibrated_on": "2020-07-01 to 2020-12-31",
            "roc_auc": round(fresh_metrics["roc_auc"], 4),
            "brier": round(fresh_metrics["brier"], 4),
            "ece": round(fresh_metrics["ece"], 4),
            "calibration_gap": round(float(fresh_scores.mean() - y_2021.mean()), 4),
        },
        "retrained_model_uncalibrated": {
            "roc_auc": round(fresh_raw_metrics["roc_auc"], 4),
            "brier": round(fresh_raw_metrics["brier"], 4),
            "ece": round(fresh_raw_metrics["ece"], 4),
        },
        "auc_gain": round(fresh_metrics["roc_auc"] - stale_metrics["roc_auc"], 4),
        "brier_improvement": round(stale_metrics["brier"] - fresh_metrics["brier"], 4),
        "ece_improvement": round(stale_metrics["ece"] - fresh_metrics["ece"], 4),
        "finding": (
            "Retraining did not help. Discrimination was unchanged and calibration "
            "got worse. The reason is the calibration block: the second half of "
            "2020 was the most unusual six months in the whole series, and an "
            "isotonic map fitted to it transfers badly to 2021. This is the case "
            "for a champion versus challenger approval gate rather than automatic "
            "promotion, and for choosing a calibration window on stability rather "
            "than on recency."
        ),
    }
    log.info(
        "  stale AUC %.4f -> retrained AUC %.4f (gain %+.4f); ECE %.4f -> %.4f",
        stale_metrics["roc_auc"],
        fresh_metrics["roc_auc"],
        output["retraining"]["auc_gain"],
        stale_metrics["ece"],
        fresh_metrics["ece"],
    )

    # Would the approval gate have caught this before it reached production? The
    # gate compares the challenger against the champion on a common holdout, which
    # here is the last quarter of the challenger's own calibration window.
    gate_window = retrain_valid.loc[retrain_valid["intake_datetime"] >= "2020-10-01"]
    gate_y = gate_window[TARGET].to_numpy()
    gate_champion = evaluate_binary(
        gate_y, calibrated.predict_proba(gate_window[MODEL_FEATURES])[:, 1]
    )
    gate_challenger = evaluate_binary(
        gate_y, fresh_calibrated.predict_proba(gate_window[MODEL_FEATURES])[:, 1]
    )
    promote = (
        gate_challenger["roc_auc"] >= gate_champion["roc_auc"] - 0.005
        and gate_challenger["ece"] <= gate_champion["ece"] + 0.01
    )
    output["approval_gate"] = {
        "holdout_window": ["2020-10-01", "2020-12-31"],
        "n": len(gate_window),
        "champion_auc": round(gate_champion["roc_auc"], 4),
        "challenger_auc": round(gate_challenger["roc_auc"], 4),
        "champion_ece": round(gate_champion["ece"], 4),
        "challenger_ece": round(gate_challenger["ece"], 4),
        "rule": "promote if AUC is within 0.005 of the champion and ECE is no more than 0.01 worse",
        "decision": "PROMOTE" if promote else "HOLD_FOR_HUMAN_REVIEW",
    }
    log.info("  approval gate decision: %s", output["approval_gate"]["decision"])

    # ---- 6. cost of the alerting policy ------------------------------------
    # An alarm that fires every month is an alarm nobody reads. The right place to
    # measure the false alarm rate is a period we know was stable, which is the
    # 2019 validation year, not the two pre-COVID months of the test block.
    valid_scored = valid.copy()
    valid_scored["score"] = calibrated.predict_proba(valid[MODEL_FEATURES])[:, 1]
    valid_scored["month"] = valid_scored["intake_datetime"].dt.to_period("M")
    stable_monthly = performance_report(
        valid_scored, TARGET, "score", "month", baseline_auc, thresholds
    )
    stable = stable_monthly.loc[stable_monthly["status"] != "INSUFFICIENT_DATA"]
    output["alerting_cost"] = {
        "stable_period": "2019, the validation year, before any known shift",
        "stable_months_evaluated": len(stable),
        "stable_months_alarming": int((stable["status"] != "OK").sum()),
        "false_alarm_rate": round(
            float((stable["status"] != "OK").mean()) if len(stable) else float("nan"), 4
        ),
        "caveat": (
            "The baseline AUC is computed on this same block, so this is an "
            "optimistic estimate of the false alarm rate rather than an unbiased one. "
            "It is reported as a lower bound."
        ),
    }
    stable_monthly.to_csv(ROOT / "results/tables/stable_period_performance.csv", index=False)
    log.info("Alerting cost on the stable period: %s", output["alerting_cost"])

    (ROOT / "results/tables/drift_results.json").write_text(json.dumps(output, indent=2, default=str))
    log.info("Wrote results/tables/drift_results.json")


if __name__ == "__main__":
    main()
