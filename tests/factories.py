"""Builders for synthetic Austin-shaped frames.

The point of these is that a test should spell out only the thing it is about. A
test about repeat visitors names two intake timestamps and nothing else; the
nine other columns the pipeline reads get plausible constants from here.

Constants rather than random values, deliberately. A test that fails should fail
for the reason written in its name, not because a draw came out badly.
"""

from __future__ import annotations

import pandas as pd

INTAKE_DEFAULTS: dict[str, object] = {
    "name": None,
    "found_location": "Austin (TX)",
    "intake_type": "Stray",
    "intake_condition": "Normal",
    "animal_type": "Dog",
    "sex_upon_intake": "Intact Male",
    "age_upon_intake": "1 year",
    "age_upon_intake_days": 365.25,
    "breed": "Labrador Retriever Mix",
    "color": "Black/White",
}

OUTCOME_DEFAULTS: dict[str, object] = {
    "outcome_subtype": None,
    "sex_upon_outcome": "Neutered Male",
    "animal_type": "Dog",
    "age_upon_outcome": "1 year",
    "age_upon_outcome_days": 365.25,
    "date_of_birth": pd.NaT,
    "breed": "Labrador Retriever Mix",
    "color": "Black/White",
    "name": None,
}


def _with_defaults(rows: list[dict], defaults: dict[str, object]) -> pd.DataFrame:
    """Fill in every column the caller did not name."""
    frame = pd.DataFrame(rows)
    for column, value in defaults.items():
        if column not in frame.columns:
            frame[column] = value
    return frame


def _empty(columns: list[str], datetime_columns: list[str]) -> pd.DataFrame:
    """An empty frame that still has the right columns and dtypes.

    ``merge_asof`` compares dtypes rather than checking for emptiness, so an
    empty outcome log has to be typed correctly or the join raises instead of
    returning zero matches.
    """
    frame = pd.DataFrame({name: pd.Series(dtype=object) for name in columns})
    for name in datetime_columns:
        frame[name] = pd.Series(dtype="datetime64[ns]")
    return frame


def make_intakes(rows: list[dict]) -> pd.DataFrame:
    """Build an intake frame shaped like the Austin export."""
    if not rows:
        return _empty(["animal_id", "intake_datetime", *INTAKE_DEFAULTS], ["intake_datetime"])
    frame = _with_defaults(rows, INTAKE_DEFAULTS)
    frame["intake_datetime"] = pd.to_datetime(frame["intake_datetime"])
    return frame


def make_outcomes(rows: list[dict]) -> pd.DataFrame:
    """Build an outcome frame shaped like the Austin export."""
    if not rows:
        return _empty(
            ["animal_id", "outcome_datetime", "outcome_type", *OUTCOME_DEFAULTS],
            ["outcome_datetime", "date_of_birth"],
        )
    frame = _with_defaults(rows, OUTCOME_DEFAULTS)
    frame["outcome_datetime"] = pd.to_datetime(frame["outcome_datetime"])
    frame["date_of_birth"] = pd.to_datetime(frame["date_of_birth"])
    return frame
