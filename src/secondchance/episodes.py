"""Turn raw Austin Animal Center intake and outcome rows into shelter episodes.

The two Austin Animal Center feeds are event logs, not a case file. Intakes says
"animal A712345 arrived on this date"; Outcomes says "animal A712345 left on this
date." Neither carries an episode key, and roughly one animal in eleven comes
through the door more than once. So the first real job in this project is
reconstructing the episode: the interval between one arrival and the departure
that closed it.

Getting this wrong is the single fastest way to poison every downstream number,
so this module keeps a running audit of how each pairing was made and refuses to
silently drop rows.

Reference for the source feeds:
    City of Austin Open Data Portal, Austin Animal Center Intakes (wter-evkm)
    City of Austin Open Data Portal, Austin Animal Center Outcomes (9t4d-g238)
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

# The Socrata CSV export writes timestamps like "01/03/2019 04:19:00 PM".
AAC_TIMESTAMP_FORMAT = "%m/%d/%Y %I:%M:%S %p"

# Outcome codes that mean a member of the public took the animal home.
# "Rto-Adopt" is Austin's code for the case where an animal was on the return to
# owner track and the finder adopted it instead. It is an adoption from the
# shelter's point of view and from the animal's.
ADOPTION_OUTCOMES = frozenset({"Adoption", "Rto-Adopt"})

# Outcomes that end the episode without an adoption. These are competing risks,
# not censoring in the usual sense, and the survival code treats them as such.
COMPETING_OUTCOMES = frozenset(
    {"Transfer", "Return to Owner", "Euthanasia", "Died", "Disposal", "Missing", "Relocate"}
)

# Age strings look like "2 years", "11 months", "4 weeks", "1 day". A handful are
# negative, which is a data entry error we flag rather than keep.
_AGE_UNIT_DAYS = {
    "day": 1.0,
    "days": 1.0,
    "week": 7.0,
    "weeks": 7.0,
    "month": 30.4375,
    "months": 30.4375,
    "year": 365.25,
    "years": 365.25,
}
_AGE_PATTERN = re.compile(r"^\s*(-?\d+)\s+([a-z]+)\s*$", re.IGNORECASE)


@dataclass
class EpisodeAudit:
    """Every count we need to defend the join in the paper.

    We report these numbers in the methods section rather than burying them,
    because "we joined on animal ID" is not a reproducible statement on its own.
    """

    intake_rows: int = 0
    outcome_rows: int = 0
    intake_rows_unparseable_time: int = 0
    outcome_rows_unparseable_time: int = 0
    duplicate_intake_rows_dropped: int = 0
    duplicate_outcome_rows_dropped: int = 0
    episodes_built: int = 0
    episodes_matched: int = 0
    episodes_open_at_cutoff: int = 0
    outcomes_before_first_intake: int = 0
    outcomes_unmatched: int = 0
    negative_duration_dropped: int = 0
    same_timestamp_episodes: int = 0
    species_mismatch_flagged: int = 0
    suspected_missing_outcomes: int = 0
    missing_outcome_threshold_days: float = 0.0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        """Return the counts as a plain dict, for the JSON results file."""
        return asdict(self)


def parse_age_to_days(raw: Any) -> float:
    """Convert Austin's free text age string into days.

    Returns NaN for anything we cannot read, including the negative ages that
    show up when a date of birth was typed in wrong. We would rather carry an
    explicit missing value into the model than invent an age.
    """
    if not isinstance(raw, str):
        return np.nan
    match = _AGE_PATTERN.match(raw)
    if match is None:
        return np.nan
    magnitude, unit = match.groups()
    factor = _AGE_UNIT_DAYS.get(unit.lower())
    if factor is None:
        return np.nan
    days = float(magnitude) * factor
    return days if days >= 0 else np.nan


def _parse_timestamps(frame: pd.DataFrame, column: str = "DateTime") -> pd.Series:
    """Parse the Socrata timestamp column, falling back to a loose parse.

    The strict format handles every row we have seen, but shelters revise their
    exports and a loose second pass costs nothing.
    """
    strict = pd.to_datetime(frame[column], format=AAC_TIMESTAMP_FORMAT, errors="coerce")
    if strict.isna().any():
        loose = pd.to_datetime(frame.loc[strict.isna(), column], errors="coerce")
        strict = strict.fillna(loose)
    return strict


def _normalise_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Lower snake case column names so downstream code stops guessing."""
    renamed = {c: c.strip().lower().replace(" ", "_") for c in frame.columns}
    return frame.rename(columns=renamed)


def load_intakes(path: str) -> pd.DataFrame:
    """Read the intakes export and attach a parsed timestamp and age."""
    frame = _normalise_columns(pd.read_csv(path, dtype=str))
    frame["intake_datetime"] = _parse_timestamps(frame, "datetime")
    frame["age_upon_intake_days"] = frame["age_upon_intake"].map(parse_age_to_days)
    frame = frame.drop(columns=["datetime", "monthyear"], errors="ignore")
    return frame


def load_outcomes(path: str) -> pd.DataFrame:
    """Read the outcomes export and attach a parsed timestamp and date of birth."""
    frame = _normalise_columns(pd.read_csv(path, dtype=str))
    frame["outcome_datetime"] = _parse_timestamps(frame, "datetime")
    frame["date_of_birth"] = pd.to_datetime(
        frame["date_of_birth"], format="%m/%d/%Y", errors="coerce"
    )
    frame["age_upon_outcome_days"] = frame["age_upon_outcome"].map(parse_age_to_days)
    frame = frame.drop(columns=["datetime", "monthyear"], errors="ignore")
    return frame


def build_episodes(
    intakes: pd.DataFrame,
    outcomes: pd.DataFrame,
    data_cutoff: pd.Timestamp,
) -> tuple[pd.DataFrame, EpisodeAudit]:
    """Pair each intake with the outcome that closed it.

    The rule is deliberately simple and checkable. Within one animal ID, sort
    both event logs by time. The k-th intake is closed by the earliest outcome
    that happens at or after it and strictly before the (k+1)-th intake. If no
    such outcome exists, the episode was still open when Austin cut the export,
    and it becomes a right censored observation rather than a discarded row.

    Args:
        intakes: output of :func:`load_intakes`.
        outcomes: output of :func:`load_outcomes`.
        data_cutoff: the last timestamp present in the export. Open episodes are
            censored here.

    Returns:
        A tuple of the episode table and the audit counts.
    """
    audit = EpisodeAudit()
    audit.intake_rows = len(intakes)
    audit.outcome_rows = len(outcomes)
    audit.intake_rows_unparseable_time = int(intakes["intake_datetime"].isna().sum())
    audit.outcome_rows_unparseable_time = int(outcomes["outcome_datetime"].isna().sum())

    intakes = intakes.dropna(subset=["intake_datetime", "animal_id"]).copy()
    outcomes = outcomes.dropna(subset=["outcome_datetime", "animal_id"]).copy()

    # Austin occasionally publishes a byte identical duplicate row. Keeping it
    # would create a phantom zero day episode, so we collapse exact duplicates on
    # the animal and timestamp pair.
    before = len(intakes)
    intakes = intakes.drop_duplicates(subset=["animal_id", "intake_datetime"], keep="first")
    audit.duplicate_intake_rows_dropped = before - len(intakes)

    before = len(outcomes)
    outcomes = outcomes.drop_duplicates(subset=["animal_id", "outcome_datetime"], keep="first")
    audit.duplicate_outcome_rows_dropped = before - len(outcomes)

    intakes = intakes.sort_values(["animal_id", "intake_datetime"]).reset_index(drop=True)
    outcomes = outcomes.sort_values(["animal_id", "outcome_datetime"]).reset_index(drop=True)

    # Episode number within the animal, and the timestamp of the animal's next
    # arrival. The next arrival is the hard boundary for the search window.
    intakes["episode_number"] = intakes.groupby("animal_id").cumcount() + 1
    intakes["next_intake_datetime"] = intakes.groupby("animal_id")["intake_datetime"].shift(-1)
    intakes["prior_intake_count"] = intakes["episode_number"] - 1

    # merge_asof with direction "forward" gives, for each intake, the first
    # outcome at or after it. Doing it on the whole frame at once is far faster
    # than a Python loop over 122k animals and is exactly equivalent because we
    # pass the animal ID as the join key.
    outcome_cols = [
        "animal_id",
        "outcome_datetime",
        "outcome_type",
        "outcome_subtype",
        "sex_upon_outcome",
        "age_upon_outcome_days",
        "date_of_birth",
        "animal_type",
    ]
    right = outcomes[outcome_cols].rename(columns={"animal_type": "animal_type_outcome"})

    merged = pd.merge_asof(
        intakes.sort_values("intake_datetime"),
        right.sort_values("outcome_datetime"),
        left_on="intake_datetime",
        right_on="outcome_datetime",
        by="animal_id",
        direction="forward",
        allow_exact_matches=True,
    )

    # Invalidate any match that lands at or after the animal's next arrival. That
    # outcome belongs to the following episode, not this one.
    lands_after_next_intake = (
        merged["next_intake_datetime"].notna()
        & merged["outcome_datetime"].notna()
        & (merged["outcome_datetime"] >= merged["next_intake_datetime"])
    )
    for column in [
        "outcome_datetime",
        "outcome_type",
        "outcome_subtype",
        "sex_upon_outcome",
        "age_upon_outcome_days",
        "date_of_birth",
        "animal_type_outcome",
    ]:
        merged.loc[lands_after_next_intake, column] = pd.NA
    merged["outcome_datetime"] = pd.to_datetime(merged["outcome_datetime"])

    audit.notes.append(
        f"{int(lands_after_next_intake.sum())} candidate matches were rejected because the "
        "outcome fell on or after the animal's next arrival."
    )

    # Duration and censoring.
    merged["is_matched"] = merged["outcome_datetime"].notna()
    merged["censor_datetime"] = merged["outcome_datetime"].fillna(data_cutoff)
    merged["length_of_stay_days"] = (
        merged["censor_datetime"] - merged["intake_datetime"]
    ).dt.total_seconds() / 86400.0

    negative = merged["length_of_stay_days"] < 0
    audit.negative_duration_dropped = int(negative.sum())
    merged = merged.loc[~negative].copy()

    audit.same_timestamp_episodes = int((merged["length_of_stay_days"] == 0).sum())

    # An animal recorded as a Dog on the way in and a Cat on the way out means the
    # join is suspect. We flag rather than drop so the count is reportable.
    mismatch = (
        merged["animal_type_outcome"].notna()
        & (merged["animal_type_outcome"] != merged["animal_type"])
    )
    merged["species_mismatch_flag"] = mismatch
    audit.species_mismatch_flagged = int(mismatch.sum())

    # Event indicators.
    merged["outcome_type"] = merged["outcome_type"].astype("object")
    merged["is_adopted"] = merged["outcome_type"].isin(ADOPTION_OUTCOMES).astype(int)
    merged["is_competing_exit"] = merged["outcome_type"].isin(COMPETING_OUTCOMES).astype(int)
    merged["is_open_at_cutoff"] = (~merged["is_matched"]).astype(int)

    # Competing risk event code: 0 censored, 1 adoption, 2 any other exit.
    merged["event_code"] = np.where(
        merged["is_adopted"] == 1, 1, np.where(merged["is_matched"], 2, 0)
    )

    # Data quality flag for episodes that never closed.
    #
    # 1,229 episodes have no outcome row. Most of those are recent arrivals that
    # were genuinely still in the building when Austin cut the export, and those
    # are honest right censored observations. But some are old: an intake in 2015
    # with no outcome by 2022 does not describe an animal that lived at the
    # shelter for seven years, it describes an outcome row that was never filed.
    # Treating the two the same way would quietly corrupt both the survival curves
    # and the shelter census feature.
    #
    # The rule is to compare the open duration against the 99.5th percentile of
    # *observed* stays. Anything longer than the longest 0.5 percent of real stays
    # is flagged as a suspected missing outcome. The threshold is derived from the
    # data rather than picked by hand, and the flag is reported rather than acted
    # on silently.
    closed_stays = merged.loc[merged["is_matched"], "length_of_stay_days"]
    threshold = float(closed_stays.quantile(0.995)) if len(closed_stays) else float("inf")
    merged["suspected_missing_outcome"] = (
        (~merged["is_matched"]) & (merged["length_of_stay_days"] > threshold)
    ).astype(int)
    audit.missing_outcome_threshold_days = round(threshold, 2)
    audit.suspected_missing_outcomes = int(merged["suspected_missing_outcome"].sum())

    # The occupancy feature needs a departure time for every episode. For a
    # flagged episode we assume the animal actually left around the threshold and
    # the paperwork was lost, rather than letting one unfiled form add a phantom
    # occupant to every subsequent day in the series.
    merged["effective_exit_datetime"] = merged["censor_datetime"]
    flagged = merged["suspected_missing_outcome"] == 1
    # np.isfinite guards the degenerate case where nothing closed at all, which
    # makes the threshold infinite. Nothing can then be flagged, and adding an
    # infinite timedelta to a timestamp raises rather than doing nothing.
    if np.isfinite(threshold) and bool(flagged.any()):
        merged.loc[flagged, "effective_exit_datetime"] = merged.loc[
            flagged, "intake_datetime"
        ] + pd.to_timedelta(threshold, unit="D")

    audit.episodes_built = len(merged)
    audit.episodes_matched = int(merged["is_matched"].sum())
    audit.episodes_open_at_cutoff = int((~merged["is_matched"]).sum())

    # How many outcome rows never got claimed by an episode? Mostly animals whose
    # arrival predates the start of the intakes feed in October 2013.
    claimed = merged.loc[merged["is_matched"], ["animal_id", "outcome_datetime"]]
    claimed_keys = set(map(tuple, claimed.itertuples(index=False, name=None)))
    all_keys = set(map(tuple, outcomes[["animal_id", "outcome_datetime"]].itertuples(index=False, name=None)))
    unmatched_outcomes = all_keys - claimed_keys
    audit.outcomes_unmatched = len(unmatched_outcomes)

    first_intake = intakes.groupby("animal_id")["intake_datetime"].min()
    before_first = 0
    for animal_id, outcome_dt in unmatched_outcomes:
        first = first_intake.get(animal_id)
        if first is None or outcome_dt < first:
            before_first += 1
    audit.outcomes_before_first_intake = before_first

    merged = merged.sort_values(["animal_id", "intake_datetime"]).reset_index(drop=True)
    merged["episode_id"] = (
        merged["animal_id"].astype(str) + "-" + merged["episode_number"].astype(str)
    )

    log.info(
        "Built %d episodes (%d closed, %d open at cutoff)",
        audit.episodes_built,
        audit.episodes_matched,
        audit.episodes_open_at_cutoff,
    )
    return merged, audit


def label_horizons(
    episodes: pd.DataFrame,
    horizons_days: tuple[int, ...] = (7, 14, 30),
    long_stay_days: int = 60,
    data_cutoff: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Attach the binary targets, respecting administrative censoring.

    For a horizon of H days the question is "was this animal adopted from the
    shelter within H days of arriving." An animal that was transferred on day 5
    answers no: the adoption did not happen. An animal that was still in the
    shelter when the export was cut, having been there fewer than H days, does
    not have an answer at all, so its label is missing and the training code
    drops it for that horizon. That is the difference between a censored row and
    a negative row, and conflating the two is the classic way to make a shelter
    model look better than it is.
    """
    frame = episodes.copy()
    cutoff = data_cutoff if data_cutoff is not None else frame["censor_datetime"].max()

    observed_window = (cutoff - frame["intake_datetime"]).dt.total_seconds() / 86400.0
    frame["observed_window_days"] = observed_window

    for horizon in horizons_days:
        adopted_in_window = (frame["is_adopted"] == 1) & (
            frame["length_of_stay_days"] <= horizon
        )
        resolved = frame["is_matched"] | (observed_window >= horizon)
        label = np.where(adopted_in_window, 1.0, 0.0)
        frame[f"adopted_within_{horizon}d"] = np.where(resolved, label, np.nan)

    # Long stay: still in the shelter on day 60. Known for any episode that either
    # closed after day 60, or was observed for at least 60 days.
    still_present_at_threshold = frame["length_of_stay_days"] >= long_stay_days
    resolved_long = frame["is_matched"] | (observed_window >= long_stay_days)
    frame[f"long_stay_{long_stay_days}d"] = np.where(
        resolved_long, still_present_at_threshold.astype(float), np.nan
    )

    return frame


def summarise_episodes(episodes: pd.DataFrame) -> pd.DataFrame:
    """Small helper used by the notebooks and the paper's descriptive table."""
    grouped = episodes.groupby("animal_type").agg(
        episodes=("episode_id", "count"),
        adopted=("is_adopted", "sum"),
        median_stay_days=("length_of_stay_days", "median"),
        mean_stay_days=("length_of_stay_days", "mean"),
        open_at_cutoff=("is_open_at_cutoff", "sum"),
    )
    grouped["adoption_rate"] = grouped["adopted"] / grouped["episodes"]
    return grouped.sort_values("episodes", ascending=False)
