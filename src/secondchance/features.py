"""Feature construction for the SecondChance models.

The hard rule in this file is that every feature must be knowable at the moment
the animal walks through the door. That rule is easy to state and easy to break.
The Austin outcomes feed carries fields like ``Sex upon Outcome`` and ``Age upon
Outcome`` that look harmless and are pure leakage: an animal that leaves neutered
was very likely adopted, because Austin neuters on the way out. Include that
column and the model reports an AUC in the high nineties and is worthless in
production, because at intake time nobody knows it yet.

So the intake side of the join is the only source of animal attributes here. The
one exception is the shelter context block, which uses the outcome timestamps of
*other* animals to compute how full the building was on the day this animal
arrived. That is legitimate: a kennel manager standing at the intake desk can
count the occupied runs. It is knowledge about the shelter, not about the future
of the animal in front of them.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import numpy as np
import pandas as pd

from .labeling.breed_llm import load_reference, structure_breed
from .labeling.rule_baseline import structure_breed_rules

log = logging.getLogger(__name__)

# Austin prefixes shelter-assigned names with an asterisk. "*Brock" means staff
# named him because he arrived without one. That is a genuine intake-time signal
# about whether anyone was looking for this animal.
_STAR_NAME = re.compile(r"^\s*\*")

# Colour vocabulary worth flagging explicitly. Black coat colour is the classic
# shelter folklore variable ("black dog syndrome") and deserves a real test
# rather than an anecdote, so we give the model a clean flag to use or ignore.
_COLOR_FLAGS = {
    "color_has_black": re.compile(r"\bblack\b", re.I),
    "color_has_white": re.compile(r"\bwhite\b", re.I),
    "color_has_brown": re.compile(r"\bbrown\b", re.I),
    "color_is_tabby": re.compile(r"\btabby\b", re.I),
    "color_is_brindle": re.compile(r"\bbrindle\b", re.I),
    "color_is_tricolor": re.compile(r"\btricolor\b", re.I),
}

# Found location tells us how the animal reached the shelter. "Austin (TX)" with
# no street address is Austin's way of saying the location was not recorded.
_ADDRESS_LIKE = re.compile(r"\d|\band\b|\bblock\b", re.I)
_OUTSIDE_AUSTIN = re.compile(
    r"\b(?:travis|williamson|hays|bastrop|caldwell|pflugerville|manor|del valle|"
    r"round rock|cedar park|leander|kyle|buda|elgin|lakeway|bee cave)\b",
    re.I,
)

NUMERIC_FEATURES = [
    "age_at_intake_days",
    "age_at_intake_log",
    "intake_hour",
    "intake_month",
    "intake_dayofweek",
    "intake_year",
    "intake_doy_sin",
    "intake_doy_cos",
    "days_since_series_start",
    "prior_intake_count",
    "name_length",
    "color_token_count",
    "shelter_census_at_intake",
    "species_census_at_intake",
    "intakes_prior_7d",
    "intakes_prior_30d",
    "adoptions_prior_30d",
    "breed_tokens",
    "breed_size_ordinal",
    "breed_weight_lb",
    "breed_coat_ordinal",
    "breed_grooming_ordinal",
    "breed_energy_ordinal",
    "weather_tmax_f",
    "weather_tmin_f",
    "weather_prcp_in",
    "weather_tmax_7d_mean",
    "weather_prcp_7d_total",
]

BINARY_FEATURES = [
    "has_name",
    "name_is_shelter_assigned",
    "is_sterilized_at_intake",
    "is_female",
    "sex_unknown",
    "location_has_street_address",
    "location_outside_austin_city",
    "is_repeat_visitor",
    "breed_resolved",
    "breed_is_mix",
    "breed_bully_type",
    "breed_brachycephalic",
    "breed_guardian",
    "breed_bsl_risk",
    "breed_purebred",
    "color_has_black",
    "color_has_white",
    "color_has_brown",
    "color_is_tabby",
    "color_is_brindle",
    "color_is_tricolor",
    "is_weekend_intake",
    "is_after_hours_intake",
]

CATEGORICAL_FEATURES = [
    "animal_type",
    "intake_type",
    "intake_condition",
    "sex_upon_intake",
    "breed_primary_group",
    "age_band",
    "season",
]

ALL_FEATURES = NUMERIC_FEATURES + BINARY_FEATURES + CATEGORICAL_FEATURES

# Two features are monotone in calendar time. They are kept in ALL_FEATURES so the
# experiment in analysis/09_time_features.py can measure them, and excluded from
# the deployed set because that experiment says they hurt.
#
# The reasoning, in short. A boosted tree can only split a feature where it has
# seen values. Once the model is deployed, every future animal has an intake_year
# beyond the training maximum, lands in the terminal bin, and the feature stops
# discriminating between animals entirely. What it does instead is freeze whatever
# trend the model learned and keep applying it. Measured on the 2020 to 2021 test
# block, including them cost 0.0055 AUC on the 30 day target with a paired
# bootstrap p below 0.001. They also make the population stability index unbounded
# against any earlier reference window, which fires the drift detector in every
# period whether or not anything real has changed.
MONOTONE_TIME_FEATURES = ["intake_year", "days_since_series_start"]

# What the trained, deployed, monitored model actually uses.
DEPLOYMENT_FEATURES = [c for c in ALL_FEATURES if c not in MONOTONE_TIME_FEATURES]

# Feature blocks, used by the ablation study in the results section.
FEATURE_BLOCKS = {
    "animal": [
        "age_at_intake_days", "age_at_intake_log", "age_band", "animal_type",
        "sex_upon_intake", "is_sterilized_at_intake", "is_female", "sex_unknown",
        "has_name", "name_is_shelter_assigned", "name_length",
        "color_token_count", "color_has_black", "color_has_white",
        "color_has_brown", "color_is_tabby", "color_is_brindle", "color_is_tricolor",
    ],
    "intake_context": [
        "intake_type", "intake_condition", "location_has_street_address",
        "location_outside_austin_city", "prior_intake_count", "is_repeat_visitor",
        "intake_hour", "intake_month", "intake_dayofweek",
        "intake_doy_sin", "intake_doy_cos", "season",
        "is_weekend_intake", "is_after_hours_intake",
    ],
    "shelter_load": [
        "shelter_census_at_intake", "species_census_at_intake",
        "intakes_prior_7d", "intakes_prior_30d", "adoptions_prior_30d",
    ],
    "breed_llm": [
        "breed_tokens", "breed_resolved", "breed_is_mix", "breed_size_ordinal",
        "breed_weight_lb", "breed_coat_ordinal", "breed_grooming_ordinal",
        "breed_energy_ordinal", "breed_bully_type", "breed_brachycephalic",
        "breed_guardian", "breed_bsl_risk", "breed_purebred", "breed_primary_group",
    ],
    "weather": [
        "weather_tmax_f", "weather_tmin_f", "weather_prcp_in",
        "weather_tmax_7d_mean", "weather_prcp_7d_total",
    ],
}


def _age_band(days: float) -> str:
    """Coarse life stage buckets, chosen to match how shelters actually talk."""
    if not np.isfinite(days):
        return "unknown"
    if days < 60:
        return "neonate"
    if days < 180:
        return "puppy_kitten"
    if days < 365:
        return "juvenile"
    if days < 3 * 365.25:
        return "young_adult"
    if days < 8 * 365.25:
        return "adult"
    return "senior"


def _season(month: int) -> str:
    """Texas seasons, not calendar seasons. Kitten season is the real driver."""
    if month in (12, 1, 2):
        return "winter"
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8):
        return "summer"
    return "fall"


def add_shelter_context(episodes: pd.DataFrame) -> pd.DataFrame:
    """Count how full the shelter was when each animal arrived.

    Implemented as a sweep over arrival and departure events rather than a join,
    because a naive "for each intake, count overlapping episodes" is quadratic and
    would take hours on 137k rows. The sweep is linear after the sort.
    """
    frame = episodes.copy()

    # Use the corrected exit time, not the raw outcome time. See the note in
    # episodes.build_episodes about unfiled outcome rows: without the correction,
    # roughly 550 lost forms accumulate into a phantom occupancy of several
    # hundred animals by the end of the series, and the model learns a trend that
    # is an artefact of Austin's paperwork rather than a fact about the building.
    exit_column = (
        "effective_exit_datetime"
        if "effective_exit_datetime" in frame.columns
        else "censor_datetime"
    )
    departs = frame[exit_column].notna() & (frame[exit_column] < frame[exit_column].max())

    arrivals = pd.DataFrame(
        {"t": frame["intake_datetime"], "delta": 1, "species": frame["animal_type"]}
    )
    departures = pd.DataFrame(
        {
            "t": frame.loc[departs, exit_column],
            "delta": -1,
            "species": frame.loc[departs, "animal_type"],
        }
    )
    events = pd.concat([arrivals, departures], ignore_index=True).sort_values(
        ["t", "delta"], kind="mergesort"
    )
    # Sorting departures (-1) before arrivals (+1) at an identical timestamp means
    # an animal that replaces one leaving the same minute does not double count.
    events["running"] = events["delta"].cumsum()

    census_by_time = events.groupby("t")["running"].last()
    frame["shelter_census_at_intake"] = (
        census_by_time.reindex(frame["intake_datetime"]).to_numpy() - 1
    )

    # Same idea again, but per species, because 400 cats in the building is a very
    # different operational situation from 400 dogs.
    species_census = np.full(len(frame), np.nan)
    for species, group in events.groupby("species", observed=True):
        group = group.copy()
        group["running"] = group["delta"].cumsum()
        by_time = group.groupby("t")["running"].last()
        mask = (frame["animal_type"] == species).to_numpy()
        species_census[mask] = (
            by_time.reindex(frame.loc[mask, "intake_datetime"]).to_numpy() - 1
        )
    frame["species_census_at_intake"] = species_census

    # Rolling arrival and adoption volume. Both are counts of things that already
    # happened, so both are safe.
    daily_intakes = (
        frame.set_index("intake_datetime")
        .assign(one=1)["one"]
        .resample("D")
        .sum()
        .rename("n")
    )
    prior_7 = daily_intakes.rolling(7, min_periods=1).sum().shift(1)
    prior_30 = daily_intakes.rolling(30, min_periods=1).sum().shift(1)

    adopted = frame.loc[frame["is_adopted"] == 1]
    daily_adoptions = (
        adopted.set_index("outcome_datetime")
        .assign(one=1)["one"]
        .resample("D")
        .sum()
        .reindex(daily_intakes.index, fill_value=0)
    )
    adopt_30 = daily_adoptions.rolling(30, min_periods=1).sum().shift(1)

    intake_day = frame["intake_datetime"].dt.floor("D")
    frame["intakes_prior_7d"] = prior_7.reindex(intake_day).to_numpy()
    frame["intakes_prior_30d"] = prior_30.reindex(intake_day).to_numpy()
    frame["adoptions_prior_30d"] = adopt_30.reindex(intake_day).to_numpy()

    return frame


def add_weather(episodes: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    """Join daily Austin observations onto the intake date.

    The station record ends before the shelter record does, so the tail of the
    study period has no weather. We leave those values missing on purpose rather
    than forward filling a year of invented temperatures, and the results section
    reports the weather ablation on the covered window only.
    """
    frame = episodes.copy()
    w = weather.copy()
    w["date"] = pd.to_datetime(w["date"]).dt.floor("D")
    w = w.sort_values("date").drop_duplicates("date")
    w["weather_tmax_7d_mean"] = w["tmax"].rolling(7, min_periods=3).mean()
    w["weather_prcp_7d_total"] = w["prcp"].rolling(7, min_periods=3).sum()
    w = w.rename(
        columns={"tmax": "weather_tmax_f", "tmin": "weather_tmin_f", "prcp": "weather_prcp_in"}
    )

    frame["_intake_date"] = frame["intake_datetime"].dt.floor("D")
    merged = frame.merge(
        w[
            [
                "date",
                "weather_tmax_f",
                "weather_tmin_f",
                "weather_prcp_in",
                "weather_tmax_7d_mean",
                "weather_prcp_7d_total",
            ]
        ],
        left_on="_intake_date",
        right_on="date",
        how="left",
    ).drop(columns=["date", "_intake_date"])
    merged["has_weather"] = merged["weather_tmax_f"].notna().astype(int)
    return merged


def build_features(
    episodes: pd.DataFrame,
    weather: pd.DataFrame | None = None,
    breed_strategy: str = "llm",
) -> pd.DataFrame:
    """Assemble the full modelling matrix.

    Args:
        episodes: output of :func:`secondchance.episodes.label_horizons`.
        weather: optional daily weather frame with date, tmax, tmin, prcp.
        breed_strategy: "llm" for the structured reference, "rules" for the
            keyword baseline, or "none" to drop breed structure entirely. The
            three settings are what the ablation in the paper compares.

    Returns:
        The episode frame with every column in :data:`ALL_FEATURES` present.
    """
    frame = episodes.copy()

    # --- animal attributes, all read off the intake record -------------------
    frame["age_at_intake_days"] = frame["age_upon_intake_days"].astype(float)
    frame["age_at_intake_log"] = np.log1p(frame["age_at_intake_days"].clip(lower=0))
    frame["age_band"] = frame["age_at_intake_days"].map(_age_band)

    name = frame["name"].fillna("")
    frame["has_name"] = (name.str.strip() != "").astype(int)
    frame["name_is_shelter_assigned"] = name.str.match(_STAR_NAME).fillna(False).astype(int)
    frame["name_length"] = name.str.replace(_STAR_NAME, "", regex=True).str.len().astype(float)

    sex = frame["sex_upon_intake"].fillna("Unknown")
    frame["sex_upon_intake"] = sex
    frame["is_sterilized_at_intake"] = sex.str.contains("Neutered|Spayed", regex=True).astype(int)
    frame["is_female"] = sex.str.contains("Female").astype(int)
    frame["sex_unknown"] = (sex == "Unknown").astype(int)

    color = frame["color"].fillna("")
    frame["color_token_count"] = color.str.count("/").add(1).where(color != "", 0).astype(float)
    for flag, pattern in _COLOR_FLAGS.items():
        frame[flag] = color.str.contains(pattern).astype(int)

    # --- how the animal arrived ---------------------------------------------
    location = frame["found_location"].fillna("")
    frame["location_has_street_address"] = location.str.contains(_ADDRESS_LIKE).astype(int)
    frame["location_outside_austin_city"] = location.str.contains(_OUTSIDE_AUSTIN).astype(int)
    frame["is_repeat_visitor"] = (frame["prior_intake_count"] > 0).astype(int)
    frame["intake_type"] = frame["intake_type"].fillna("Unknown")
    frame["intake_condition"] = frame["intake_condition"].fillna("Unknown")

    # --- calendar ------------------------------------------------------------
    dt = frame["intake_datetime"]
    frame["intake_hour"] = dt.dt.hour.astype(float)
    frame["intake_month"] = dt.dt.month.astype(float)
    frame["intake_dayofweek"] = dt.dt.dayofweek.astype(float)
    frame["intake_year"] = dt.dt.year.astype(float)
    doy = dt.dt.dayofyear.astype(float)
    # Sine and cosine of day of year so the model sees late December and early
    # January as neighbours instead of opposite ends of a number line.
    frame["intake_doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    frame["intake_doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    frame["days_since_series_start"] = (dt - dt.min()).dt.total_seconds() / 86400.0
    frame["season"] = frame["intake_month"].astype(int).map(_season)
    frame["is_weekend_intake"] = (frame["intake_dayofweek"] >= 5).astype(int)
    frame["is_after_hours_intake"] = (
        (frame["intake_hour"] < 8) | (frame["intake_hour"] >= 18)
    ).astype(int)

    # --- shelter load --------------------------------------------------------
    frame = add_shelter_context(frame)

    # --- breed structure -----------------------------------------------------
    if breed_strategy == "llm":
        reference = load_reference()
        unique_breeds = frame["breed"].dropna().unique()
        lookup = {b: structure_breed(b, reference) for b in unique_breeds}
    elif breed_strategy == "rules":
        unique_breeds = frame["breed"].dropna().unique()
        lookup = {b: structure_breed_rules(b) for b in unique_breeds}
    elif breed_strategy == "none":
        lookup = {}
    else:
        raise ValueError(f"Unknown breed_strategy {breed_strategy!r}")

    if lookup:
        template = next(iter(lookup.values()))
        empty: dict[str, Any] = {
            k: (np.nan if isinstance(v, float) else 0) for k, v in template.items()
        }
        empty["breed_primary_group"] = "Unknown"
        empty["breed_primary_token"] = "Unknown"
        expanded = pd.DataFrame(
            [lookup.get(b, empty) for b in frame["breed"]], index=frame.index
        )
        frame = pd.concat([frame, expanded], axis=1)
    else:
        for column in FEATURE_BLOCKS["breed_llm"]:
            frame[column] = np.nan if column not in {"breed_primary_group"} else "Unknown"
        frame["breed_primary_token"] = "Unknown"

    # --- weather -------------------------------------------------------------
    if weather is not None:
        frame = add_weather(frame, weather)
    else:
        for column in FEATURE_BLOCKS["weather"]:
            frame[column] = np.nan
        frame["has_weather"] = 0

    missing = [c for c in ALL_FEATURES if c not in frame.columns]
    if missing:
        raise RuntimeError(f"Feature construction missed columns: {missing}")

    log.info("Built %d features over %d episodes", len(ALL_FEATURES), len(frame))
    return frame


def build_cohort(features: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Apply the modelling cohort definition and return the exclusion counts.

    Three exclusions, each of which changes what the reported numbers mean, so
    each one is counted and reported rather than applied silently.

    Non dog or cat. Austin takes in bats, chickens, raccoons and the occasional
    livestock animal. They do not go through the adoption pathway this model
    describes, and their outcomes are governed by entirely different rules.

    Off-pathway intake types. Wildlife and owner-requested euthanasia never enter
    the adoption pathway at all. Leaving them in would inflate every score with a
    group whose outcome is effectively known before the model looks at it, and
    the deployed queue would never contain them anyway.

    Suspected missing outcomes. An intake in 2015 with no outcome row by 2022 is
    an unfiled form, not a seven year resident. See the note in
    :func:`secondchance.episodes.build_episodes` for how the threshold is derived.

    This lives here rather than in an analysis script so that the command line
    tool, the analysis pipeline and the ablation study cannot drift into three
    slightly different cohorts and quietly report incomparable numbers.

    Args:
        features: the output of :func:`build_features`.

    Returns:
        The filtered cohort and a dict of counts, starting at ``episodes_start``
        and ending at ``episodes_final``.
    """
    counts = {"episodes_start": len(features)}
    frame = features.copy()

    non_dog_cat = ~frame["animal_type"].isin(["Dog", "Cat"])
    counts["excluded_not_dog_or_cat"] = int(non_dog_cat.sum())
    frame = frame.loc[~non_dog_cat]

    off_pathway = frame["intake_type"].isin(["Wildlife", "Euthanasia Request"])
    counts["excluded_off_adoption_pathway"] = int(off_pathway.sum())
    frame = frame.loc[~off_pathway]

    suspect = frame["suspected_missing_outcome"] == 1
    counts["excluded_suspected_missing_outcome"] = int(suspect.sum())
    frame = frame.loc[~suspect]

    counts["episodes_final"] = len(frame)
    return frame.reset_index(drop=True), counts


def feature_columns(blocks: list[str] | None = None) -> list[str]:
    """Return the feature list for a given set of blocks, preserving order."""
    if blocks is None:
        return list(ALL_FEATURES)
    wanted: list[str] = []
    for block in blocks:
        for column in FEATURE_BLOCKS[block]:
            if column not in wanted:
                wanted.append(column)
    return wanted


def split_feature_types(columns: list[str]) -> tuple[list[str], list[str]]:
    """Split a feature list into (numeric, categorical) for the encoder."""
    categorical = [c for c in columns if c in CATEGORICAL_FEATURES]
    numeric = [c for c in columns if c not in CATEGORICAL_FEATURES]
    return numeric, categorical
