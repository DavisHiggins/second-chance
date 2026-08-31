"""Time to adoption as a survival problem, which is what it actually is.

A classifier that answers "adopted within 30 days, yes or no" throws away most of
the information in the data. It cannot tell a shelter that a dog is likely to go
home on day four rather than day twenty eight, and it has nowhere to put the
1,229 animals who were still in the building when Austin cut the export.

Survival analysis handles both. Two subtleties matter here and are handled
explicitly rather than assumed away:

Right censoring. An animal still in the shelter on the last day of the export has
not "failed to be adopted". We only know the adoption had not happened yet. Every
estimator below is given the censoring indicator rather than a fabricated label.

Competing risks. This is the one most shelter analyses get wrong. An animal
transferred to a rescue partner on day three can never be adopted from Austin
afterwards. Treating that transfer as ordinary censoring assumes the animal
remained "at risk" of adoption, which is false. The Kaplan-Meier estimate under
that assumption systematically overstates adoption, and by a lot in this data,
because transfers are 29 percent of exits. We therefore report both:

  * the cause-specific Kaplan-Meier curve, which answers "if transfers did not
    exist, how fast would adoption happen", useful for comparing groups, and
  * the Aalen-Johansen cumulative incidence function, which answers "what share
    of animals arriving today will actually be adopted from this shelter by day
    t", which is the number an operations manager needs.

The gap between the two is reported in the results, because it is a concrete
illustration of an easy mistake.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


@dataclass
class SurvivalArrays:
    """The three vectors every estimator here needs."""

    duration: np.ndarray  # days from intake to exit or to the export cutoff
    event_adoption: np.ndarray  # 1 if the exit was an adoption
    event_code: np.ndarray  # 0 censored, 1 adopted, 2 exited another way


def to_survival_arrays(frame: pd.DataFrame, max_days: float = 365.0) -> SurvivalArrays:
    """Extract durations and event indicators, administratively censored at max_days.

    Censoring the tail at one year is a modelling choice, not a data cleaning
    step. Beyond a year the sample is tiny, the animals are unlike the rest of the
    population, and the curve becomes a description of a handful of long term
    residents rather than of shelter operations. The choice is stated in the paper
    and the threshold is a parameter so a reviewer can move it.
    """
    duration = frame["length_of_stay_days"].to_numpy(dtype=float).copy()
    code = frame["event_code"].to_numpy(dtype=int).copy()

    beyond = duration > max_days
    duration[beyond] = max_days
    code[beyond] = 0  # anything still present at the horizon is censored there

    return SurvivalArrays(
        duration=duration,
        event_adoption=(code == 1).astype(int),
        event_code=code,
    )


def kaplan_meier(arrays: SurvivalArrays, timeline: np.ndarray | None = None) -> pd.DataFrame:
    """Cause-specific Kaplan-Meier estimate of remaining-in-shelter probability.

    Competing exits are treated as censored, which is the standard cause-specific
    formulation. See the module docstring for why that number must not be read as
    "probability of eventually being adopted".
    """
    from lifelines import KaplanMeierFitter

    fitter = KaplanMeierFitter()
    fitter.fit(arrays.duration, arrays.event_adoption, timeline=timeline)
    frame = fitter.survival_function_.copy()
    frame.columns = ["survival"]
    intervals = fitter.confidence_interval_
    frame["survival_lower"] = intervals.iloc[:, 0].to_numpy()
    frame["survival_upper"] = intervals.iloc[:, 1].to_numpy()
    frame["adopted_cumulative"] = 1 - frame["survival"]
    frame.index.name = "day"
    return frame.reset_index()


def cumulative_incidence(
    arrays: SurvivalArrays, cause: int = 1, with_variance: bool = False
) -> pd.DataFrame:
    """Aalen-Johansen cumulative incidence for one cause in the presence of the other.

    This is the honest answer to "what fraction of arrivals get adopted by day t".

    Variance estimation is off by default. lifelines computes it by jackknife,
    which is O(n squared) and takes hours on a hundred thousand episodes. We turn
    it on only for the headline overall curve, where the interval is worth the
    wait, and read the stratum curves as point estimates.
    """
    from lifelines import AalenJohansenFitter

    fitter = AalenJohansenFitter(calculate_variance=with_variance, seed=20260820)
    fitter.fit(arrays.duration, arrays.event_code, event_of_interest=cause)
    frame = fitter.cumulative_density_.copy()
    frame.columns = ["cumulative_incidence"]
    frame.index.name = "day"
    return frame.reset_index()


def median_survival_days(arrays: SurvivalArrays) -> float:
    """Median cause-specific time to adoption, or NaN if the curve never reaches 0.5."""
    from lifelines import KaplanMeierFitter
    from lifelines.utils import median_survival_times

    fitter = KaplanMeierFitter()
    fitter.fit(arrays.duration, arrays.event_adoption)
    value = median_survival_times(fitter.survival_function_)
    return float(value) if np.isfinite(value) else float("nan")


def fit_cox(
    train: pd.DataFrame,
    columns: list[str],
    duration_column: str = "duration",
    event_column: str = "event_adoption",
    penalizer: float = 0.1,
):
    """Fit a penalised Cox proportional hazards model.

    The penalty is there because several intake condition levels are rare enough
    that an unpenalised fit produces coefficients in the hundreds and a model that
    predicts nothing useful outside the training data.
    """
    from lifelines import CoxPHFitter

    fitter = CoxPHFitter(penalizer=penalizer)
    design = train[[*columns, duration_column, event_column]].dropna()
    fitter.fit(design, duration_col=duration_column, event_col=event_column, robust=False)
    return fitter


def concordance(
    durations: np.ndarray, risk_scores: np.ndarray, events: np.ndarray
) -> float:
    """Harrell's concordance index.

    Higher risk score should mean shorter time to adoption, so the score is
    negated before it goes in: lifelines expects a predicted *duration*.
    """
    from lifelines.utils import concordance_index

    return float(concordance_index(durations, -risk_scores, events))


def expand_person_period(
    frame: pd.DataFrame,
    feature_columns: list[str],
    bin_edges: np.ndarray,
    duration_column: str = "duration",
    event_column: str = "event_adoption",
) -> pd.DataFrame:
    """Expand each episode into one row per interval it survived into.

    This is the standard trick that turns survival estimation into ordinary binary
    classification. An animal adopted on day 12 with weekly bins contributes rows
    for weeks 1 and 2, with the hazard label 0, 1. An animal transferred on day 12
    contributes the same rows with labels 0, 0, and then stops being at risk. A
    gradient boosted tree fitted to that table estimates a discrete hazard, and the
    product of one minus the hazards gives back a full survival curve, with
    interactions and non-linearities that a Cox model would need to be told about
    by hand.

    Args:
        frame: episode level table, one row per animal visit.
        feature_columns: covariates to carry into every expanded row.
        bin_edges: interval boundaries in days, starting at 0.
        duration_column: column holding the observed time to exit, in days.
        event_column: column holding the adoption indicator, 1 for adopted.

    Returns:
        One row per (episode, interval at risk), carrying the covariates plus
        ``interval``, ``interval_start``, ``interval_width`` and ``hazard_label``.
    """
    durations = frame[duration_column].to_numpy(dtype=float)
    events = frame[event_column].to_numpy(dtype=int)

    # Which interval does each episode end in? searchsorted with side "left" puts
    # a duration exactly on an edge into the interval that closes at that edge.
    end_bin = np.searchsorted(bin_edges[1:], durations, side="left")
    end_bin = np.clip(end_bin, 0, len(bin_edges) - 2)

    repeats = end_bin + 1
    row_index = np.repeat(np.arange(len(frame)), repeats)
    interval = np.concatenate([np.arange(r) for r in repeats])

    expanded = frame.iloc[row_index][feature_columns].reset_index(drop=True)
    expanded["interval"] = interval
    expanded["interval_start"] = bin_edges[interval]
    expanded["interval_width"] = bin_edges[interval + 1] - bin_edges[interval]

    is_last = interval == np.repeat(end_bin, repeats)
    expanded["hazard_label"] = (is_last & (np.repeat(events, repeats) == 1)).astype(int)
    if "event_code_capped" in frame.columns:
        codes = frame["event_code_capped"].to_numpy(dtype=int)
        expanded["other_exit_label"] = (is_last & (np.repeat(codes, repeats) == 2)).astype(int)
    expanded["_episode_row"] = row_index
    return expanded


def competing_risk_incidence(
    hazard_adoption: np.ndarray, hazard_other: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Turn two cause-specific discrete hazards into a proper cumulative incidence.

    This is the piece that a naive survival model gets wrong, and getting it wrong
    is not a rounding error. If you model only the adoption hazard and report
    ``1 - prod(1 - h_adopt)``, you are answering "how fast would adoption happen in
    a world where transfers and returns to owner did not exist". In this data that
    overstates real adoption by a wide margin, because 46 percent of exits are
    something other than adoption.

    The correct discrete-time construction keeps both causes in the risk set:

        S(j)    = prod over k <= j of (1 - h_adopt(k) - h_other(k))
        CIF(j)  = sum over k <= j of S(k-1) * h_adopt(k)

    S(j) is the probability the animal is still in the shelter at the end of
    interval j, and CIF(j) is the probability it has been adopted by then. The two
    plus the other-exit incidence sum to one, which is the sanity check.

    Args:
        hazard_adoption: (n, j) adoption hazard per interval.
        hazard_other: (n, j) hazard of any other exit per interval.

    Returns:
        (still_present, adoption_incidence), both shape (n, j).
    """
    total = np.clip(hazard_adoption + hazard_other, 1e-9, 1 - 1e-9)
    stay = 1.0 - total
    still_present = np.cumprod(stay, axis=1)

    # Survival at the *start* of each interval: 1 for the first, then the running
    # product shifted right by one.
    start_of_interval = np.hstack(
        [np.ones((still_present.shape[0], 1)), still_present[:, :-1]]
    )
    adoption_incidence = np.cumsum(start_of_interval * hazard_adoption, axis=1)
    return still_present, adoption_incidence


def survival_from_hazards(hazard_matrix: np.ndarray) -> np.ndarray:
    """Turn a matrix of per interval hazards into cumulative survival.

    Args:
        hazard_matrix: shape (n_episodes, n_intervals), each entry the probability
            of being adopted during that interval given still present at its start.

    Returns:
        Array of the same shape holding P(still in shelter at the end of interval j).
    """
    survival: np.ndarray = np.cumprod(1.0 - np.clip(hazard_matrix, 1e-9, 1 - 1e-9), axis=1)
    return survival


def expected_days(survival_matrix: np.ndarray, bin_edges: np.ndarray) -> np.ndarray:
    """Restricted mean time in shelter, integrating the survival curve.

    "Restricted" because the curve stops at the last bin edge. For animals whose
    predicted survival is still high at the horizon this is a lower bound on the
    true expected stay, and the paper says so rather than quoting it as a point
    prediction.
    """
    widths = np.diff(bin_edges)
    # Trapezoid between the start and end of each interval. Survival at the start
    # of the first interval is 1 by definition, so that column is prepended.
    left = np.hstack([np.ones((survival_matrix.shape[0], 1)), survival_matrix[:, :-1]])
    area: np.ndarray = ((left + survival_matrix) / 2.0 * widths).sum(axis=1)
    return area


def integrated_brier_score(
    survival_matrix: np.ndarray,
    durations: np.ndarray,
    events: np.ndarray,
    bin_edges: np.ndarray,
) -> float:
    """Inverse probability of censoring weighted Brier score, integrated over time.

    Uses a Kaplan-Meier estimate of the censoring distribution for the weights,
    which is the standard Graf et al. construction. Without the weighting, a model
    that simply predicts everyone stays forever scores well on a heavily censored
    sample, which would be a good way to fool ourselves.
    """
    from lifelines import KaplanMeierFitter

    censoring = KaplanMeierFitter()
    censoring.fit(durations, 1 - events)  # the "event" for the censoring curve is being censored

    # Evaluate the censoring curve once on its own grid and interpolate from
    # there. Calling lifelines' predict inside the loop is correct but does a
    # fresh lookup per element, which turns an O(n) step into minutes on a test
    # block of twenty thousand episodes.
    curve_times = censoring.survival_function_.index.to_numpy(dtype=float)
    curve_values = censoring.survival_function_.iloc[:, 0].to_numpy(dtype=float)

    def g(values: np.ndarray | float) -> np.ndarray:
        interpolated = np.interp(
            values, curve_times, curve_values, left=1.0, right=curve_values[-1]
        )
        floored: np.ndarray = np.maximum(interpolated, 1e-3)
        return floored

    weight_at_event = 1.0 / g(durations)
    times = bin_edges[1:]
    scores = []
    for j, t in enumerate(times):
        predicted_survival = survival_matrix[:, j]
        # Case 1: the event already happened by t, so true survival is 0.
        died = (durations <= t) & (events == 1)
        # Case 2: still present at t, so true survival is 1.
        alive = durations > t
        # Anything censored before t contributes nothing, which is the whole point
        # of the inverse probability of censoring weighting.
        weights = np.zeros(len(durations))
        weights[died] = weight_at_event[died]
        weights[alive] = 1.0 / float(g(t))
        residual = np.zeros(len(durations))
        residual[died] = predicted_survival[died] ** 2
        residual[alive] = (1.0 - predicted_survival[alive]) ** 2
        scores.append(float((weights * residual).sum() / len(durations)))

    widths = np.diff(bin_edges)
    return float(np.sum(np.array(scores) * widths) / widths.sum())
