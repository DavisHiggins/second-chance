"""Tests for feature construction.

The theme running through this file is leakage. Every feature in the deployed
set has to be knowable at the moment an animal is standing at the intake desk,
before anyone knows what happens to it. A feature that quietly encodes the
outcome will not announce itself: it will just make the AUC look good.

So most of these tests are of the form "build the same feature for two animals
who differ only in what happened later, and assert the feature is identical".
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from factories import make_intakes, make_outcomes
from secondchance.episodes import build_episodes, label_horizons
from secondchance.features import (
    ALL_FEATURES,
    CATEGORICAL_FEATURES,
    DEPLOYMENT_FEATURES,
    FEATURE_BLOCKS,
    MONOTONE_TIME_FEATURES,
    _age_band,
    _season,
    add_shelter_context,
    add_weather,
    build_features,
    feature_columns,
    split_feature_types,
)

CUTOFF = pd.Timestamp("2022-03-04 11:25:00")


def build_small_cohort(rows: list[dict], outcome_rows: list[dict]) -> pd.DataFrame:
    """Run the real pipeline end to end on a handful of animals."""
    episodes, _ = build_episodes(make_intakes(rows), make_outcomes(outcome_rows), CUTOFF)
    labelled = label_horizons(episodes, data_cutoff=CUTOFF)
    return build_features(labelled, weather=None, breed_strategy="llm")


@pytest.fixture(scope="module")
def cohort() -> pd.DataFrame:
    """Twelve animals with a deliberate spread of ages, breeds and outcomes."""
    intakes = []
    outcomes = []
    for i in range(12):
        animal = f"A{i:02d}"
        intakes.append(
            {
                "animal_id": animal,
                "intake_datetime": f"2018-0{(i % 9) + 1}-1{i % 9} 1{i % 9}:00",
                "name": None if i % 3 == 0 else ("*Rufus" if i % 3 == 1 else "Bella"),
                "animal_type": "Dog" if i % 2 == 0 else "Cat",
                "breed": "Pit Bull Mix" if i % 2 == 0 else "Domestic Shorthair Mix",
                "color": "Black/White" if i % 4 else "Brown Tabby",
                "sex_upon_intake": "Intact Female" if i % 2 else "Neutered Male",
                "intake_type": "Stray" if i % 3 else "Owner Surrender",
                "intake_condition": "Normal" if i % 4 else "Sick",
                "age_upon_intake_days": [20.0, 120.0, 300.0, 900.0, 3000.0, 4000.0][i % 6],
                "found_location": "7201 Levander Loop in Austin (TX)" if i % 2 else "Travis (TX)",
            }
        )
        outcomes.append(
            {
                "animal_id": animal,
                "outcome_datetime": f"2018-0{(i % 9) + 1}-2{i % 8} 1{i % 9}:00",
                "outcome_type": "Adoption" if i % 3 else "Transfer",
            }
        )
    return build_small_cohort(intakes, outcomes)


# --- the feature lists themselves --------------------------------------------

def test_every_declared_feature_is_actually_built(cohort):
    missing = [c for c in ALL_FEATURES if c not in cohort.columns]
    assert not missing, f"declared but never built: {missing}"


def test_feature_blocks_partition_the_feature_list():
    """Every feature belongs to exactly one block.

    The ablation study adds one block at a time, so a feature in two blocks would
    be added twice and one in none would never be tested at all. Either way the
    ablation table in the paper would be quietly wrong.
    """
    seen: list[str] = []
    for block in FEATURE_BLOCKS.values():
        seen.extend(block)
    duplicates = {c for c in seen if seen.count(c) > 1}
    assert not duplicates, f"features in more than one block: {sorted(duplicates)}"
    # The blocks partition the deployed set. The two monotone time features sit
    # outside every block on purpose: they exist so that the experiment in
    # analysis/09_time_features.py can measure them, and they are not part of any
    # ablation because they are not part of the deployed model.
    assert set(seen) == set(DEPLOYMENT_FEATURES), (
        f"blocks and DEPLOYMENT_FEATURES disagree: "
        f"only in blocks {sorted(set(seen) - set(DEPLOYMENT_FEATURES))}, "
        f"only in DEPLOYMENT_FEATURES {sorted(set(DEPLOYMENT_FEATURES) - set(seen))}"
    )
    assert set(ALL_FEATURES) - set(seen) == set(MONOTONE_TIME_FEATURES)


def test_deployment_set_excludes_the_monotone_time_features():
    """Intake year rises forever, so a PSI against it can only ever go up.

    The drift chapter is about this: a feature whose distribution cannot overlap
    its own reference is not measurable, so it is dropped from the deployed model
    rather than left in to set off an alarm every quarter.
    """
    for column in MONOTONE_TIME_FEATURES:
        assert column in ALL_FEATURES
        assert column not in DEPLOYMENT_FEATURES
    assert len(DEPLOYMENT_FEATURES) == len(ALL_FEATURES) - len(MONOTONE_TIME_FEATURES)


def test_no_outcome_column_leaked_into_the_feature_list():
    """The single most expensive mistake available in this dataset.

    "Sex upon Outcome" and "Age upon Outcome" are in the raw export and would both
    lift the AUC substantially, because they are recorded after the thing being
    predicted has already happened.
    """
    forbidden = ("outcome", "adopted", "length_of_stay", "event_code", "is_matched", "censor")
    offenders = [c for c in ALL_FEATURES if any(f in c.lower() for f in forbidden)]
    # adoptions_prior_30d is a count of other animals' past outcomes, which is
    # knowable at intake time and is not this animal's outcome.
    offenders = [c for c in offenders if c != "adoptions_prior_30d"]
    assert not offenders, f"outcome-derived columns in the feature list: {offenders}"


def test_split_feature_types_covers_everything():
    numeric, categorical = split_feature_types(list(ALL_FEATURES))
    assert set(numeric) | set(categorical) == set(ALL_FEATURES)
    assert not set(numeric) & set(categorical)
    assert set(categorical) == set(CATEGORICAL_FEATURES)


def test_feature_columns_preserves_order_and_deduplicates():
    columns = feature_columns(["animal", "intake_context", "animal"])
    assert columns == list(dict.fromkeys(FEATURE_BLOCKS["animal"] + FEATURE_BLOCKS["intake_context"]))


# --- leakage, tested behaviourally -------------------------------------------

def test_features_are_identical_for_two_animals_with_different_outcomes():
    """The real leakage test: change only the outcome and nothing may move."""
    base_intake = {
        "animal_id": "A1",
        "intake_datetime": "2018-05-05 10:00",
        "breed": "Labrador Retriever Mix",
        "age_upon_intake_days": 700.0,
    }
    adopted = build_small_cohort(
        [base_intake],
        [{"animal_id": "A1", "outcome_datetime": "2018-05-08 10:00", "outcome_type": "Adoption"}],
    )
    euthanised = build_small_cohort(
        [base_intake],
        [{"animal_id": "A1", "outcome_datetime": "2018-09-30 10:00", "outcome_type": "Euthanasia"}],
    )
    for column in DEPLOYMENT_FEATURES:
        left, right = adopted.loc[0, column], euthanised.loc[0, column]
        if isinstance(left, float) and np.isnan(left):
            assert np.isnan(right), column
        else:
            assert left == right, f"{column} changed with the outcome: {left!r} vs {right!r}"


def test_shelter_census_counts_the_others_not_the_animal_itself():
    """Three animals in the building means a census of two for each of them."""
    intakes = make_intakes(
        [
            {"animal_id": "A1", "intake_datetime": "2018-01-01 09:00"},
            {"animal_id": "A2", "intake_datetime": "2018-01-02 09:00"},
            {"animal_id": "A3", "intake_datetime": "2018-01-03 09:00"},
        ]
    )
    outcomes = make_outcomes(
        [
            {"animal_id": "A1", "outcome_datetime": "2018-06-01 09:00", "outcome_type": "Adoption"},
            {"animal_id": "A2", "outcome_datetime": "2018-06-01 09:00", "outcome_type": "Adoption"},
            {"animal_id": "A3", "outcome_datetime": "2018-06-01 09:00", "outcome_type": "Adoption"},
        ]
    )
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    with_context = add_shelter_context(episodes)
    census = dict(
        zip(with_context["animal_id"], with_context["shelter_census_at_intake"], strict=True)
    )
    assert census["A1"] == 0
    assert census["A2"] == 1
    assert census["A3"] == 2


def test_prior_volume_features_exclude_the_current_day():
    """A count that included today would leak same-day arrivals into the feature.

    The shift by one day is the whole point, and it is the kind of thing that is
    easy to lose in a refactor because the number still looks reasonable.
    """
    rows = [
        {"animal_id": f"B{i}", "intake_datetime": "2018-03-01 09:00"} for i in range(20)
    ] + [{"animal_id": "TARGET", "intake_datetime": "2018-03-01 15:00"}]
    intakes = make_intakes(rows)
    outcomes = make_outcomes(
        [
            {
                "animal_id": row["animal_id"],
                "outcome_datetime": "2018-03-20 09:00",
                "outcome_type": "Adoption",
            }
            for row in rows
        ]
    )
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    with_context = add_shelter_context(episodes)
    prior = with_context.set_index("animal_id")["intakes_prior_7d"]
    # Nothing arrived before 1 March, so the prior-7-day count is zero for
    # everyone, including the animal that arrived last that day.
    assert prior["TARGET"] == 0 or np.isnan(prior["TARGET"])


# --- individual feature semantics --------------------------------------------

@pytest.mark.parametrize(
    ("days", "band"),
    [
        (0.0, "neonate"),
        (59.9, "neonate"),
        (60.0, "puppy_kitten"),
        (179.0, "puppy_kitten"),
        (180.0, "juvenile"),
        (364.0, "juvenile"),
        (365.0, "young_adult"),
        (1000.0, "young_adult"),
        (1200.0, "adult"),
        (2922.1, "senior"),
        (float("nan"), "unknown"),
    ],
)
def test_age_bands_are_contiguous_and_handle_missing(days, band):
    assert _age_band(days) == band


@pytest.mark.parametrize(
    ("month", "season"),
    [(12, "winter"), (1, "winter"), (2, "winter"), (3, "spring"), (5, "spring"),
     (6, "summer"), (8, "summer"), (9, "fall"), (11, "fall")],
)
def test_seasons_cover_all_twelve_months(month, season):
    assert _season(month) == season


def test_star_prefixed_names_are_recognised_as_shelter_assigned(cohort):
    """Austin marks staff-given names with a leading asterisk.

    This turns out to be one of the strongest single features in the long-stay
    model, and the paper argues it is a proxy for arriving without an owner
    rather than anything about the animal, so it needs to be extracted exactly.
    """
    starred = cohort.loc[cohort["name"].fillna("").str.startswith("*")]
    assert len(starred) > 0
    assert (starred["name_is_shelter_assigned"] == 1).all()
    assert (starred["has_name"] == 1).all()
    # The asterisk is stripped before measuring length: "*Rufus" is five letters.
    assert (starred["name_length"] == 5).all()

    unnamed = cohort.loc[cohort["name"].isna()]
    assert (unnamed["has_name"] == 0).all()
    assert (unnamed["name_is_shelter_assigned"] == 0).all()


def test_day_of_year_is_encoded_as_a_circle():
    """New Year's Eve and New Year's Day have to be neighbours.

    On a raw day-of-year axis they are 364 apart, which is the largest possible
    distance, and a tree would happily split between them.
    """
    intakes = make_intakes(
        [
            {"animal_id": "NYE", "intake_datetime": "2018-12-31 12:00"},
            {"animal_id": "NYD", "intake_datetime": "2019-01-01 12:00"},
            {"animal_id": "JUL", "intake_datetime": "2018-07-01 12:00"},
        ]
    )
    outcomes = make_outcomes(
        [
            {"animal_id": a, "outcome_datetime": "2019-06-01 09:00", "outcome_type": "Adoption"}
            for a in ["NYE", "NYD", "JUL"]
        ]
    )
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    features = build_features(label_horizons(episodes, data_cutoff=CUTOFF), breed_strategy="none")
    point = features.set_index("animal_id")[["intake_doy_sin", "intake_doy_cos"]]

    def distance(a: str, b: str) -> float:
        return float(np.linalg.norm(point.loc[a].to_numpy() - point.loc[b].to_numpy()))

    assert distance("NYE", "NYD") < 0.1
    assert distance("NYE", "JUL") > 1.5


def test_missing_weather_is_missing_rather_than_zero():
    """Zero degrees in Austin would be a remarkable and entirely invented fact."""
    intakes = make_intakes([{"animal_id": "A1", "intake_datetime": "2018-05-05 09:00"}])
    outcomes = make_outcomes(
        [{"animal_id": "A1", "outcome_datetime": "2018-05-15 09:00", "outcome_type": "Adoption"}]
    )
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    features = build_features(label_horizons(episodes, data_cutoff=CUTOFF), weather=None)
    for column in FEATURE_BLOCKS["weather"]:
        assert np.isnan(features.loc[0, column]), column
    assert features.loc[0, "has_weather"] == 0


def test_weather_join_marks_uncovered_dates():
    """The station record stops before the shelter record does.

    The ablation in the paper is reported on the covered window only, and that
    depends on this indicator being right.
    """
    intakes = make_intakes(
        [
            {"animal_id": "COVERED", "intake_datetime": "2018-05-05 09:00"},
            {"animal_id": "AFTER", "intake_datetime": "2021-05-05 09:00"},
        ]
    )
    outcomes = make_outcomes(
        [
            {"animal_id": "COVERED", "outcome_datetime": "2018-05-15 09:00", "outcome_type": "Adoption"},
            {"animal_id": "AFTER", "outcome_datetime": "2021-05-15 09:00", "outcome_type": "Adoption"},
        ]
    )
    weather = pd.DataFrame(
        {
            "date": pd.date_range("2018-01-01", "2018-12-31", freq="D"),
            "tmax": 80.0,
            "tmin": 60.0,
            "prcp": 0.1,
        }
    )
    episodes, _ = build_episodes(intakes, outcomes, CUTOFF)
    features = add_weather(label_horizons(episodes, data_cutoff=CUTOFF), weather)
    by_animal = features.set_index("animal_id")
    assert by_animal.loc["COVERED", "has_weather"] == 1
    assert by_animal.loc["COVERED", "weather_tmax_f"] == pytest.approx(80.0)
    assert by_animal.loc["AFTER", "has_weather"] == 0
    assert np.isnan(by_animal.loc["AFTER", "weather_tmax_f"])


def test_breed_strategy_none_still_produces_every_column(cohort):
    """The ablation compares three strategies, so the matrix shape must not move."""
    episodes, _ = build_episodes(
        make_intakes([{"animal_id": "A1", "intake_datetime": "2018-05-05 09:00"}]),
        make_outcomes(
            [{"animal_id": "A1", "outcome_datetime": "2018-05-15 09:00", "outcome_type": "Adoption"}]
        ),
        CUTOFF,
    )
    labelled = label_horizons(episodes, data_cutoff=CUTOFF)
    for strategy in ["llm", "rules", "none"]:
        features = build_features(labelled, breed_strategy=strategy)
        missing = [c for c in ALL_FEATURES if c not in features.columns]
        assert not missing, f"{strategy} strategy missed {missing}"


def test_an_unknown_breed_strategy_is_refused_rather_than_ignored():
    episodes, _ = build_episodes(
        make_intakes([{"animal_id": "A1", "intake_datetime": "2018-05-05 09:00"}]),
        make_outcomes(
            [{"animal_id": "A1", "outcome_datetime": "2018-05-15 09:00", "outcome_type": "Adoption"}]
        ),
        CUTOFF,
    )
    labelled = label_horizons(episodes, data_cutoff=CUTOFF)
    with pytest.raises(ValueError, match="breed_strategy"):
        build_features(labelled, breed_strategy="vibes")
