"""Tests for the monitoring pipeline.

The drift work in this project produced three findings that were only visible
because the first version of the detector was wrong in three different ways. Each
of those is pinned here, because they are exactly the kind of thing that gets
"simplified" back in later:

  1. A feature that is monotone in calendar time has an unbounded PSI against any
     earlier reference, so it fires forever and means nothing.
  2. A shelter-level covariate is near constant within a quarter, so its PSI
     saturates and says CRITICAL for a shift a director would call normal.
  3. A calendar-cycle feature drifts against the previous quarter by
     construction, which is why the reference is year over year.

The other half of the file is the ordinary business of checking that a detector
stays quiet when nothing has happened, which is the property that decides whether
anyone still reads its alerts in six months.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from secondchance.monitor.drift import (
    PSI_MAJOR,
    PSI_MINOR,
    DriftThresholds,
    categorical_drift,
    classify,
    feature_drift_report,
    ks_statistic,
    performance_report,
    population_stability_index,
)

SEED = 20260820


# --- PSI ---------------------------------------------------------------------


def test_psi_is_zero_against_the_reference_itself():
    """The property that makes the number readable at all."""
    rng = np.random.default_rng(SEED)
    sample = rng.normal(size=5000)
    assert population_stability_index(sample, sample) == pytest.approx(0.0, abs=1e-9)


def test_psi_stays_quiet_for_two_draws_from_one_distribution():
    """A detector that fires on sampling noise is a detector nobody reads."""
    rng = np.random.default_rng(SEED)
    for _ in range(20):
        a = rng.normal(size=4000)
        b = rng.normal(size=4000)
        assert population_stability_index(a, b) < PSI_MINOR


def test_psi_grows_monotonically_with_the_size_of_the_shift():
    rng = np.random.default_rng(SEED)
    reference = rng.normal(size=6000)
    values = [
        population_stability_index(reference, rng.normal(loc=shift, size=6000))
        for shift in [0.0, 0.25, 0.5, 1.0, 2.0]
    ]
    assert values == sorted(values)
    assert values[-1] > PSI_MAJOR


def test_psi_is_not_measurable_on_a_tiny_sample():
    """Returning a number here would be worse than returning nothing.

    A week with eleven animals in it can produce any PSI at all, and the
    monitoring job should say "insufficient data" rather than raise an alarm the
    on-call person cannot act on.
    """
    rng = np.random.default_rng(SEED)
    assert np.isnan(population_stability_index(rng.normal(size=10), rng.normal(size=10)))


def test_psi_handles_an_empty_bin_without_an_infinite_logarithm():
    """A category that disappears entirely is real drift, not a crash."""
    reference = np.concatenate([np.zeros(500), np.ones(500)])
    current = np.zeros(500)
    value = population_stability_index(reference, current)
    assert np.isfinite(value)
    assert value > PSI_MAJOR


def test_psi_of_a_constant_column_is_zero_not_undefined():
    """Quantile edges collapse to a single value, which must not become a NaN."""
    reference = np.full(500, 3.0)
    current = np.full(500, 3.0)
    assert population_stability_index(reference, current) == 0.0


# --- the three failure modes the project actually hit -------------------------


def test_a_monotone_time_feature_fires_no_matter_what_happens():
    """Finding one, pinned.

    intake_year in a later quarter has no overlap at all with its reference, so
    PSI saturates whether or not the shelter changed. This is why the feature is
    excluded from the deployed model rather than monitored more carefully.
    """
    reference = np.repeat([2016.0, 2017.0, 2018.0], 400)
    current = np.repeat([2020.0, 2021.0], 600)
    assert population_stability_index(reference, current) > PSI_MAJOR


def test_a_calendar_cycle_feature_drifts_quarter_over_quarter_by_construction():
    """Finding three, pinned.

    Day-of-year sine in Q3 cannot resemble Q2 no matter how stable the shelter
    is, which is why the reference window is the same quarter a year earlier.
    """
    day = np.arange(1, 366)
    doy_sin = np.sin(2 * np.pi * day / 365.25)
    q2 = np.repeat(doy_sin[90:181], 8)
    q3 = np.repeat(doy_sin[181:273], 8)
    q3_last_year = np.repeat(doy_sin[181:273], 8) + np.random.default_rng(SEED).normal(
        0, 0.01, 92 * 8
    )

    assert population_stability_index(q2, q3) > PSI_MAJOR, "quarter over quarter must fire"
    assert population_stability_index(q3_last_year, q3) < PSI_MINOR, "year over year must not"


def test_a_near_constant_shelter_level_feature_saturates_psi():
    """Finding two, pinned.

    Every animal in a quarter shares almost the same shelter census, so the
    quantile bins are razor thin and a shift a director would describe as a quiet
    month reads as catastrophic. The monitoring job reports a relative level
    change for these instead.
    """
    rng = np.random.default_rng(SEED)
    reference = rng.normal(600, 5, 3000)
    current = rng.normal(560, 5, 3000)  # under 7 percent lower

    saturated = population_stability_index(reference, current)
    relative_change = abs(current.mean() - reference.mean()) / reference.mean()

    assert saturated > PSI_MAJOR
    assert relative_change < 0.10, "a change this small should not be a CRITICAL"


# --- categorical drift --------------------------------------------------------


def test_categorical_drift_is_zero_for_identical_distributions():
    series = pd.Series(["Stray"] * 700 + ["Owner Surrender"] * 250 + ["Public Assist"] * 50)
    assert categorical_drift(series, series.copy()) == pytest.approx(0.0, abs=1e-12)


def test_categorical_drift_detects_a_new_level():
    """March 2020 is exactly this: a level that did not exist before appears."""
    reference = pd.Series(["Stray"] * 900 + ["Owner Surrender"] * 100)
    current = pd.Series(["Stray"] * 400 + ["Owner Surrender"] * 100 + ["Wildlife"] * 500)
    assert categorical_drift(reference, current) > PSI_MAJOR


def test_categorical_drift_detects_a_level_that_vanishes():
    reference = pd.Series(["Stray"] * 500 + ["Owner Surrender"] * 500)
    current = pd.Series(["Stray"] * 1000)
    assert np.isfinite(categorical_drift(reference, current))
    assert categorical_drift(reference, current) > PSI_MAJOR


# --- KS ----------------------------------------------------------------------


def test_ks_agrees_with_psi_about_whether_anything_moved():
    rng = np.random.default_rng(SEED)
    reference = rng.normal(size=3000)
    same = rng.normal(size=3000)
    shifted = rng.normal(loc=1.5, size=3000)

    quiet_statistic, quiet_p = ks_statistic(reference, same)
    loud_statistic, loud_p = ks_statistic(reference, shifted)

    assert quiet_p > 0.01
    assert loud_p < 1e-10
    assert loud_statistic > quiet_statistic


def test_ks_is_not_measurable_on_a_tiny_sample():
    statistic, p_value = ks_statistic(np.zeros(5), np.ones(5))
    assert np.isnan(statistic)
    assert np.isnan(p_value)


# --- the classifier -----------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0.0, "OK"),
        (0.099, "OK"),
        (PSI_MINOR, "WARNING"),
        (0.20, "WARNING"),
        (PSI_MAJOR, "CRITICAL"),
        (1.5, "CRITICAL"),
        (float("nan"), "INSUFFICIENT_DATA"),
    ],
)
def test_classify_boundaries_are_inclusive_at_the_threshold(value, expected):
    assert classify(value, PSI_MINOR, PSI_MAJOR) == expected


def test_missing_data_is_never_reported_as_healthy():
    """The failure mode where the pipeline breaks and the dashboard goes green."""
    assert classify(float("nan"), 0.1, 0.25) != "OK"


# --- the reports --------------------------------------------------------------


def _reference_and_current(shift: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(SEED)
    n = 2000
    reference = pd.DataFrame(
        {
            "age_at_intake_days": rng.gamma(2, 400, n),
            "shelter_census_at_intake": rng.normal(600, 60, n),
            "intake_type": rng.choice(["Stray", "Owner Surrender"], n, p=[0.75, 0.25]),
        }
    )
    current = pd.DataFrame(
        {
            "age_at_intake_days": rng.gamma(2, 400, n) * (1 + shift),
            "shelter_census_at_intake": rng.normal(600, 60, n),
            "intake_type": rng.choice(
                ["Stray", "Owner Surrender"], n, p=[max(0.05, 0.75 - shift), min(0.95, 0.25 + shift)]
            ),
        }
    )
    return reference, current


def test_feature_drift_report_is_sorted_worst_first():
    reference, current = _reference_and_current(shift=0.6)
    report = feature_drift_report(
        reference, current, ["age_at_intake_days", "shelter_census_at_intake"], ["intake_type"]
    )
    assert list(report["psi"]) == sorted(report["psi"], reverse=True)
    assert set(report["feature"]) == {
        "age_at_intake_days",
        "shelter_census_at_intake",
        "intake_type",
    }
    assert set(report["kind"]) == {"numeric", "categorical"}


def test_feature_drift_report_stays_green_when_nothing_changed():
    reference, current = _reference_and_current(shift=0.0)
    report = feature_drift_report(
        reference, current, ["age_at_intake_days", "shelter_census_at_intake"], ["intake_type"]
    )
    assert set(report["status"]) == {"OK"}, report[["feature", "psi", "status"]].to_string()


def test_performance_report_flags_the_period_where_calibration_slips():
    """The finding from July 2020: ranking held, the numbers stopped meaning anything.

    Two quarters of identical, well-ordered scores. In the second one the shelter's
    real adoption rate collapses while the model keeps predicting the old rate. AUC
    is untouched. The calibration gap is what has to catch it.
    """
    rng = np.random.default_rng(SEED)
    n = 2000
    score = rng.beta(2, 3, n * 2)

    healthy_label = rng.binomial(1, score[:n]).astype(float)
    # Same ranking, but only a third as many animals actually leave.
    collapsed_label = rng.binomial(1, score[n:] / 3.0).astype(float)

    frame = pd.DataFrame(
        {
            "label": np.concatenate([healthy_label, collapsed_label]),
            "score": score,
            "period": ["2020Q1"] * n + ["2020Q2"] * n,
        }
    )
    # The baseline is the model's own validated AUC, which is what the real
    # monitoring job uses. Here that is whatever the healthy quarter achieves.
    from sklearn.metrics import roc_auc_score

    baseline = float(roc_auc_score(healthy_label, score[:n]))
    report = performance_report(
        frame, "label", "score", "period", baseline_auc=baseline
    ).set_index("period")

    assert report.loc["2020Q1", "status"] == "OK"
    assert report.loc["2020Q2", "status"] == "CRITICAL"
    assert report.loc["2020Q2", "calibration_gap"] > 0.10
    # And the point of the finding: discrimination barely moved.
    assert abs(report.loc["2020Q2", "roc_auc"] - report.loc["2020Q1", "roc_auc"]) < 0.10


def test_performance_report_refuses_to_score_a_thin_period():
    """Better to say "not enough animals" than to publish an AUC on forty of them."""
    rng = np.random.default_rng(SEED)
    frame = pd.DataFrame(
        {
            "label": rng.binomial(1, 0.4, 40).astype(float),
            "score": rng.uniform(size=40),
            "period": ["2021Q4"] * 40,
        }
    )
    report = performance_report(frame, "label", "score", "period", baseline_auc=0.80)
    assert report.loc[0, "status"] == "INSUFFICIENT_DATA"
    assert np.isnan(report.loc[0, "roc_auc"])
    assert report.loc[0, "n"] == 40


def test_performance_report_refuses_a_period_with_one_class():
    """AUC is undefined when nothing happened, and undefined is not zero."""
    frame = pd.DataFrame(
        {
            "label": np.zeros(500),
            "score": np.linspace(0, 1, 500),
            "period": ["2021Q4"] * 500,
        }
    )
    report = performance_report(frame, "label", "score", "period", baseline_auc=0.80)
    assert report.loc[0, "status"] == "INSUFFICIENT_DATA"


def test_thresholds_are_relative_to_the_models_own_baseline():
    """An absolute AUC floor becomes unreachable when the population shifts.

    The same model, the same real behaviour, evaluated against two different
    baselines, has to produce two different verdicts. That is the point of making
    the rule relative.
    """
    rng = np.random.default_rng(SEED)
    n = 3000
    score = rng.beta(2, 3, n)
    label = rng.binomial(1, score).astype(float)
    frame = pd.DataFrame({"label": label, "score": score, "period": ["p"] * n})

    generous = performance_report(frame, "label", "score", "period", baseline_auc=0.72)
    harsh = performance_report(frame, "label", "score", "period", baseline_auc=0.95)

    assert generous.loc[0, "auc_relative_drop"] < harsh.loc[0, "auc_relative_drop"]
    assert harsh.loc[0, "auc_status"] == "CRITICAL"


def test_thresholds_are_declared_before_the_data_is_looked_at():
    """A defaults object, not a set of arguments tuned until the chart looked right."""
    thresholds = DriftThresholds()
    assert thresholds.psi_warning == PSI_MINOR
    assert thresholds.psi_critical == PSI_MAJOR
    assert thresholds.psi_warning < thresholds.psi_critical
    assert thresholds.auc_relative_drop_warning < thresholds.auc_relative_drop_critical
    assert thresholds.calibration_gap_warning < thresholds.calibration_gap_critical
    assert thresholds.min_rows_to_evaluate >= 100
