"""Tests for episode reconstruction.

These are the tests that matter most in the project. Everything downstream is
built on the assumption that intake and outcome rows were paired correctly, and a
mistake there is silent: the durations still look plausible, the models still
train, and the numbers are quietly wrong.

Each test below encodes one thing that could go wrong with the pairing, written
so that a failure names the failure rather than just going red.
"""

from __future__ import annotations

import pandas as pd
import pytest

from factories import make_intakes, make_outcomes
from secondchance.episodes import (
    ADOPTION_OUTCOMES,
    build_episodes,
    label_horizons,
    parse_age_to_days,
)

CUTOFF = pd.Timestamp("2022-03-04 11:25:00")


# --- age parsing -------------------------------------------------------------

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2 years", 730.5),
        ("1 year", 365.25),
        ("11 months", 334.8125),
        ("4 weeks", 28.0),
        ("1 day", 1.0),
        ("3 days", 3.0),
    ],
)
def test_parse_age_converts_every_unit(raw, expected):
    assert parse_age_to_days(raw) == pytest.approx(expected, rel=1e-6)


@pytest.mark.parametrize("raw", [None, "", "unknown", "2", "years", "-1 years", 42, float("nan")])
def test_parse_age_returns_nan_rather_than_guessing(raw):
    """A negative or unreadable age becomes missing, never zero.

    Zero would be a three-week-old kitten, which is a very different animal from
    one whose age was typed in wrong.
    """
    assert pd.isna(parse_age_to_days(raw))


# --- the pairing rule --------------------------------------------------------

def test_single_visit_pairs_cleanly():
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"}])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-11 09:00", "outcome_type": "Adoption"}
    ])
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)

    assert len(episodes) == 1
    assert audit.episodes_matched == 1
    assert episodes.loc[0, "length_of_stay_days"] == pytest.approx(10.0)
    assert episodes.loc[0, "is_adopted"] == 1
    assert episodes.loc[0, "event_code"] == 1


def test_repeat_visitor_does_not_produce_a_cross_product():
    """Two intakes and two outcomes must give two episodes, not four.

    This is the failure the whole module exists to prevent. A naive join on animal
    ID gives four rows with plausible-looking durations, and nothing downstream
    would notice.
    """
    intakes = make_intakes([
        {"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"},
        {"animal_id": "A1", "intake_datetime": "2020-06-01 09:00"},
    ])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-05 09:00", "outcome_type": "Return to Owner"},
        {"animal_id": "A1", "outcome_datetime": "2020-06-20 09:00", "outcome_type": "Adoption"},
    ])
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)

    assert len(episodes) == 2, "a repeat visitor produced a cross product"
    assert audit.episodes_matched == 2
    durations = sorted(episodes["length_of_stay_days"].round(2))
    assert durations == [pytest.approx(4.0), pytest.approx(19.0)]
    assert episodes.loc[episodes["episode_number"] == 2, "prior_intake_count"].iloc[0] == 1


def test_outcome_after_the_next_arrival_is_rejected():
    """An outcome belonging to a later visit must not close an earlier one."""
    intakes = make_intakes([
        {"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"},
        {"animal_id": "A1", "intake_datetime": "2020-02-01 09:00"},
    ])
    # Only one outcome, and it happens after the second arrival.
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-02-10 09:00", "outcome_type": "Adoption"}
    ])
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)

    first = episodes.loc[episodes["episode_number"] == 1].iloc[0]
    second = episodes.loc[episodes["episode_number"] == 2].iloc[0]
    assert first["is_matched"] is False or first["is_matched"] == 0, (
        "the first episode was wrongly closed by the second visit's outcome"
    )
    assert second["is_matched"]
    assert audit.episodes_open_at_cutoff == 1


def test_open_episode_is_censored_not_dropped():
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2022-03-01 09:00"}])
    outcomes = make_outcomes([])
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)

    assert len(episodes) == 1
    assert audit.episodes_open_at_cutoff == 1
    assert episodes.loc[0, "event_code"] == 0, "an open episode must be censored, not a failure"
    assert episodes.loc[0, "length_of_stay_days"] > 0


def test_exact_duplicate_rows_are_collapsed():
    intakes = make_intakes([
        {"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"},
        {"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"},
    ])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-05 09:00", "outcome_type": "Adoption"}
    ])
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)

    assert audit.duplicate_intake_rows_dropped == 1
    assert len(episodes) == 1


def test_competing_exit_is_coded_separately_from_adoption():
    """A transfer must not be codeable as either an adoption or as censoring."""
    intakes = make_intakes([
        {"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"},
        {"animal_id": "A2", "intake_datetime": "2020-01-01 09:00"},
    ])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-05 09:00", "outcome_type": "Transfer"},
        {"animal_id": "A2", "outcome_datetime": "2020-01-05 09:00", "outcome_type": "Adoption"},
    ])
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    codes = dict(zip(episodes["animal_id"], episodes["event_code"], strict=True))
    assert codes["A1"] == 2
    assert codes["A2"] == 1


def test_rto_adopt_counts_as_an_adoption():
    """Austin's "Rto-Adopt" is an adoption from the animal's point of view."""
    assert "Rto-Adopt" in ADOPTION_OUTCOMES
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"}])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-05 09:00", "outcome_type": "Rto-Adopt"}
    ])
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    assert episodes.loc[0, "is_adopted"] == 1


def test_no_negative_durations_survive():
    """An outcome before its intake is a data error and must not become an episode."""
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2020-01-10 09:00"}])
    # merge_asof forward means this outcome can never match, so the episode is
    # simply left open rather than given a negative duration.
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-01 09:00", "outcome_type": "Adoption"}
    ])
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)
    assert (episodes["length_of_stay_days"] >= 0).all()
    assert audit.outcomes_unmatched == 1


# --- labels ------------------------------------------------------------------

def test_horizon_label_is_missing_when_not_yet_observable():
    """An animal observed for less than the horizon has no label, not a zero.

    This is the distinction that separates a censored row from a negative one, and
    conflating the two is the classic way to make a shelter model look better than
    it is.
    """
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2022-03-01 09:00"}])
    outcomes = make_outcomes([])
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    labelled = label_horizons(episodes, data_cutoff=CUTOFF)

    assert pd.isna(labelled.loc[0, "adopted_within_7d"]), (
        "an animal observed for three days cannot have a 7-day label"
    )
    assert pd.isna(labelled.loc[0, "long_stay_60d"])


def test_competing_exit_is_a_negative_for_the_horizon_label():
    """Transferred on day 5 means "not adopted within 7 days", which is observed."""
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"}])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-01-06 09:00", "outcome_type": "Transfer"}
    ])
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    labelled = label_horizons(episodes, data_cutoff=CUTOFF)
    assert labelled.loc[0, "adopted_within_7d"] == 0.0


def test_long_stay_label_is_observable_for_a_closed_long_episode():
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2020-01-01 09:00"}])
    outcomes = make_outcomes([
        {"animal_id": "A1", "outcome_datetime": "2020-04-01 09:00", "outcome_type": "Adoption"}
    ])
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    labelled = label_horizons(episodes, data_cutoff=CUTOFF)
    assert labelled.loc[0, "long_stay_60d"] == 1.0
    assert labelled.loc[0, "adopted_within_30d"] == 0.0


def test_suspected_missing_outcome_flag_uses_a_data_derived_threshold():
    """A very old open episode is flagged; a recent one is not."""
    intakes = make_intakes(
        [{"animal_id": f"A{i}", "intake_datetime": "2020-01-01 09:00"} for i in range(50)]
        + [{"animal_id": "OLD", "intake_datetime": "2014-01-01 09:00"},
           {"animal_id": "NEW", "intake_datetime": "2022-03-01 09:00"}]
    )
    outcomes = make_outcomes(
        [{"animal_id": f"A{i}", "outcome_datetime": "2020-01-11 09:00", "outcome_type": "Adoption"}
         for i in range(50)]
    )
    episodes, audit = build_episodes(intakes, outcomes, CUTOFF)
    flags = dict(zip(episodes["animal_id"], episodes["suspected_missing_outcome"], strict=True))

    assert audit.missing_outcome_threshold_days > 0
    assert flags["OLD"] == 1, "an eight-year open episode should be flagged"
    assert flags["NEW"] == 0, "a three-day open episode is genuine censoring"
