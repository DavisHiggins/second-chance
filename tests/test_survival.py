"""Tests for the survival and competing-risk code.

The headline finding of this project is that treating a transfer as ordinary
censoring overstates 30-day adoption by 23.7 percentage points. That finding is
only worth anything if the estimators behind it are right, so this file checks
them against cases with known closed-form answers rather than against each
other.

The competing-risk section is the important one. Every function there has a
plausible wrong implementation that returns numbers in the right range, and the
tests are chosen so that the wrong implementation fails.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from secondchance.survival import (
    competing_risk_incidence,
    cumulative_incidence,
    expand_person_period,
    expected_days,
    integrated_brier_score,
    kaplan_meier,
    median_survival_days,
    survival_from_hazards,
    to_survival_arrays,
)

# --- extracting the arrays ----------------------------------------------------


def test_administrative_censoring_at_the_horizon_rewrites_both_time_and_code():
    """An adoption on day 400 is not an adoption within a one-year study window.

    It has to become "still present at day 365, censored", or the curve past the
    horizon is estimated from a handful of long-term residents who are not like
    the rest of the population.
    """
    frame = pd.DataFrame(
        {"length_of_stay_days": [10.0, 400.0, 365.0], "event_code": [1, 1, 2]}
    )
    arrays = to_survival_arrays(frame, max_days=365.0)
    assert list(arrays.duration) == [10.0, 365.0, 365.0]
    assert list(arrays.event_code) == [1, 0, 2]
    assert list(arrays.event_adoption) == [1, 0, 0]


def test_extraction_does_not_mutate_the_caller_frame():
    """Because the same episode table is reused by four downstream scripts."""
    frame = pd.DataFrame({"length_of_stay_days": [400.0], "event_code": [1]})
    to_survival_arrays(frame, max_days=365.0)
    assert frame.loc[0, "length_of_stay_days"] == 400.0
    assert frame.loc[0, "event_code"] == 1


# --- Kaplan-Meier against a hand-computable case ------------------------------


def test_kaplan_meier_matches_the_product_limit_by_hand():
    """Four animals, one adoption at day 1 and one at day 3, one censored at 2.

    S(1) = 1 - 1/4 = 0.75
    S(2) = 0.75, the censored animal only leaves the risk set
    S(3) = 0.75 * (1 - 1/2) = 0.375
    """
    frame = pd.DataFrame(
        {"length_of_stay_days": [1.0, 2.0, 3.0, 4.0], "event_code": [1, 0, 1, 0]}
    )
    curve = kaplan_meier(to_survival_arrays(frame)).set_index("day")["survival"]
    assert curve.loc[1.0] == pytest.approx(0.75)
    assert curve.loc[2.0] == pytest.approx(0.75)
    assert curve.loc[3.0] == pytest.approx(0.375)


def test_kaplan_meier_confidence_band_contains_the_estimate():
    frame = pd.DataFrame(
        {
            "length_of_stay_days": np.linspace(1, 100, 200),
            "event_code": np.tile([1, 0], 100),
        }
    )
    curve = kaplan_meier(to_survival_arrays(frame))
    assert (curve["survival_lower"] <= curve["survival"] + 1e-9).all()
    assert (curve["survival_upper"] >= curve["survival"] - 1e-9).all()
    assert curve["adopted_cumulative"].is_monotonic_increasing


def test_median_survival_is_nan_when_the_curve_never_falls_to_a_half():
    """Ninety percent competing exits means the adoption curve stays high.

    Returning some large finite number here instead of NaN would put an invented
    median in the descriptive table.
    """
    frame = pd.DataFrame(
        {
            "length_of_stay_days": np.linspace(1, 200, 200),
            "event_code": np.array([1] * 10 + [2] * 190),
        }
    )
    assert np.isnan(median_survival_days(to_survival_arrays(frame)))


# --- the finding: cause-specific KM versus Aalen-Johansen ---------------------


def test_cause_specific_km_overstates_adoption_when_competing_exits_are_common():
    """This is the paper's headline, reduced to twenty animals.

    Half the animals are adopted and half are transferred, all on the same
    schedule. The true share ever adopted is 0.5. Cause-specific Kaplan-Meier,
    which pretends the transferred animals could still be adopted later, will say
    something much larger, and that gap is the whole argument.
    """
    duration = np.tile(np.arange(1.0, 11.0), 2)
    code = np.array([1] * 10 + [2] * 10)
    arrays = to_survival_arrays(
        pd.DataFrame({"length_of_stay_days": duration, "event_code": code})
    )

    km = kaplan_meier(arrays).set_index("day")["adopted_cumulative"]
    aj = cumulative_incidence(arrays).set_index("day")["cumulative_incidence"]

    naive = float(km.iloc[-1])
    correct = float(aj.iloc[-1])
    truth = 0.5

    assert correct == pytest.approx(truth, abs=0.02), "Aalen-Johansen must recover the truth"
    assert naive > correct + 0.15, "the naive estimator must be visibly biased upward"


def test_cumulative_incidence_is_monotone_and_bounded():
    duration = np.concatenate([np.linspace(1, 50, 100), np.linspace(1, 80, 100)])
    code = np.array([1] * 100 + [2] * 100)
    arrays = to_survival_arrays(
        pd.DataFrame({"length_of_stay_days": duration, "event_code": code})
    )
    curve = cumulative_incidence(arrays)["cumulative_incidence"]
    assert curve.is_monotonic_increasing
    assert curve.min() >= 0.0
    assert curve.max() <= 1.0


def test_the_two_causes_and_survival_sum_to_one():
    """The identity that makes a competing-risk decomposition a decomposition."""
    duration = np.concatenate([np.linspace(1, 60, 150), np.linspace(1, 60, 150)])
    code = np.array([1] * 150 + [2] * 150)
    arrays = to_survival_arrays(
        pd.DataFrame({"length_of_stay_days": duration, "event_code": code})
    )
    adoption = cumulative_incidence(arrays, cause=1).set_index("day")["cumulative_incidence"]
    other = cumulative_incidence(arrays, cause=2).set_index("day")["cumulative_incidence"]
    at_the_end = float(adoption.iloc[-1] + other.iloc[-1])
    assert at_the_end == pytest.approx(1.0, abs=0.02)


# --- person-period expansion --------------------------------------------------


def test_expansion_produces_one_row_per_interval_survived_into():
    """An animal adopted in interval 3 contributes rows for intervals 0, 1, 2, 3.

    It contributes no row for interval 4, because it was not at risk then. The
    common bug is to keep expanding to the end of the grid, which teaches the
    model that every animal survives forever.
    """
    edges = np.array([0.0, 7.0, 14.0, 21.0, 28.0, 35.0])
    frame = pd.DataFrame({"duration": [24.0], "event_adoption": [1], "x": [1.0]})
    expanded = expand_person_period(frame, ["x"], edges)

    assert list(expanded["interval"]) == [0, 1, 2, 3]
    assert list(expanded["hazard_label"]) == [0, 0, 0, 1]
    assert list(expanded["interval_start"]) == [0.0, 7.0, 14.0, 21.0]
    assert (expanded["interval_width"] == 7.0).all()


def test_a_competing_exit_contributes_rows_with_no_positive_hazard():
    """Transferred on day 24 means "not adopted in intervals 0 to 3", then gone."""
    edges = np.array([0.0, 7.0, 14.0, 21.0, 28.0, 35.0])
    frame = pd.DataFrame(
        {"duration": [24.0], "event_adoption": [0], "event_code_capped": [2], "x": [1.0]}
    )
    expanded = expand_person_period(frame, ["x"], edges)
    assert list(expanded["hazard_label"]) == [0, 0, 0, 0]
    assert list(expanded["other_exit_label"]) == [0, 0, 0, 1]


def test_a_duration_exactly_on_a_boundary_lands_in_the_closing_interval():
    """Day 14 with weekly bins ends interval 1, not interval 2.

    Off-by-one here would silently add an extra at-risk row for every animal that
    left on a round day, and shelters do a lot of things on round days.
    """
    edges = np.array([0.0, 7.0, 14.0, 21.0])
    frame = pd.DataFrame({"duration": [14.0], "event_adoption": [1], "x": [1.0]})
    expanded = expand_person_period(frame, ["x"], edges)
    assert list(expanded["interval"]) == [0, 1]
    assert list(expanded["hazard_label"]) == [0, 1]


def test_expansion_carries_covariates_unchanged_into_every_row():
    edges = np.array([0.0, 10.0, 20.0, 30.0])
    frame = pd.DataFrame(
        {"duration": [25.0, 5.0], "event_adoption": [1, 1], "x": [3.5, 9.0], "y": ["a", "b"]}
    )
    expanded = expand_person_period(frame, ["x", "y"], edges)
    first = expanded.loc[expanded["_episode_row"] == 0]
    assert (first["x"] == 3.5).all()
    assert (first["y"] == "a").all()
    assert len(first) == 3
    assert len(expanded.loc[expanded["_episode_row"] == 1]) == 1


def test_expansion_row_count_matches_the_sum_of_intervals_at_risk():
    rng = np.random.default_rng(20260820)
    edges = np.arange(0.0, 366.0, 7.0)
    frame = pd.DataFrame(
        {
            "duration": rng.uniform(1, 360, 500),
            "event_adoption": rng.integers(0, 2, 500),
            "x": rng.normal(size=500),
        }
    )
    expanded = expand_person_period(frame, ["x"], edges)
    expected = int(
        np.clip(np.searchsorted(edges[1:], frame["duration"].to_numpy(), side="left"),
                0, len(edges) - 2).sum()
        + len(frame)
    )
    assert len(expanded) == expected


# --- turning hazards back into curves -----------------------------------------


def test_survival_from_a_constant_hazard_decays_geometrically():
    hazard = np.full((1, 5), 0.1)
    survival = survival_from_hazards(hazard)[0]
    np.testing.assert_allclose(survival, 0.9 ** np.arange(1, 6), rtol=1e-9)


def test_competing_risk_incidence_never_exceeds_the_single_cause_version():
    """The correction can only move the estimate down, and it must.

    Modelling only the adoption hazard answers "how fast would adoption happen if
    transfers did not exist". Keeping both causes in the risk set is the honest
    version, and on any input with a non-zero competing hazard it is smaller.
    """
    adoption = np.full((1, 10), 0.08)
    other = np.full((1, 10), 0.08)

    naive = 1.0 - survival_from_hazards(adoption)
    _, corrected = competing_risk_incidence(adoption, other)

    assert (corrected[0] <= naive[0] + 1e-12).all()
    assert corrected[0, -1] < naive[0, -1] - 0.05


def test_competing_risk_decomposition_sums_to_one():
    """Still present, adopted, and exited another way have to account for everyone."""
    rng = np.random.default_rng(20260820)
    adoption = rng.uniform(0.01, 0.10, size=(50, 12))
    other = rng.uniform(0.01, 0.10, size=(50, 12))

    still_present, adopted = competing_risk_incidence(adoption, other)
    _, other_exit = competing_risk_incidence(other, adoption)

    total = still_present + adopted + other_exit
    np.testing.assert_allclose(total, np.ones_like(total), atol=1e-8)


def test_competing_risk_incidence_matches_a_hand_computed_two_step():
    """Two intervals, both hazards 0.2, worked out on paper.

    Interval 1: S(0) = 1, so CIF = 1 * 0.2 = 0.2, and S(1) = 1 - 0.4 = 0.6.
    Interval 2: CIF = 0.2 + 0.6 * 0.2 = 0.32, and S(2) = 0.6 * 0.6 = 0.36.
    """
    adoption = np.array([[0.2, 0.2]])
    other = np.array([[0.2, 0.2]])
    still_present, incidence = competing_risk_incidence(adoption, other)
    np.testing.assert_allclose(still_present[0], [0.6, 0.36], atol=1e-9)
    np.testing.assert_allclose(incidence[0], [0.2, 0.32], atol=1e-9)


def test_expected_days_integrates_the_survival_curve():
    """An animal certain to still be present has a restricted mean of the horizon."""
    edges = np.array([0.0, 10.0, 20.0, 30.0])
    always_present = np.ones((1, 3))
    assert expected_days(always_present, edges)[0] == pytest.approx(30.0)

    # And one that leaves immediately integrates to half of the first interval,
    # because the trapezoid runs from survival 1 at day 0 down to 0 at day 10.
    leaves_at_once = np.zeros((1, 3))
    assert expected_days(leaves_at_once, edges)[0] == pytest.approx(5.0)


# --- the integrated Brier score ------------------------------------------------


def test_a_perfect_survival_prediction_scores_near_zero():
    edges = np.array([0.0, 10.0, 20.0, 30.0, 40.0])
    durations = np.array([5.0, 15.0, 25.0, 35.0] * 50)
    events = np.ones(200, dtype=int)
    # A step function that is 1 before the animal leaves and 0 after.
    survival = np.array([(durations[i] > edges[1:]).astype(float) for i in range(200)])
    score = integrated_brier_score(survival, durations, events, edges)
    assert score < 0.02


def test_a_useless_survival_prediction_scores_worse_than_a_good_one():
    rng = np.random.default_rng(20260820)
    edges = np.arange(0.0, 101.0, 10.0)
    durations = rng.uniform(1, 99, 400)
    events = rng.binomial(1, 0.7, 400)

    good = np.array([(d > edges[1:]).astype(float) for d in durations])
    useless = np.full((400, len(edges) - 1), 0.5)

    assert integrated_brier_score(good, durations, events, edges) < integrated_brier_score(
        useless, durations, events, edges
    )


def test_integrated_brier_score_is_bounded():
    """It is an average of squared residuals in [0, 1], reweighted, so it cannot exceed 1."""
    rng = np.random.default_rng(20260820)
    edges = np.arange(0.0, 61.0, 10.0)
    durations = rng.uniform(1, 59, 300)
    events = rng.binomial(1, 0.6, 300)
    survival = rng.uniform(0, 1, size=(300, len(edges) - 1))
    score = integrated_brier_score(survival, durations, events, edges)
    assert 0.0 <= score <= 1.0
