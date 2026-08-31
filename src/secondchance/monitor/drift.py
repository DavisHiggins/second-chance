"""Drift detection: is the world still the world the model was trained on?

The course brief asks for a pipeline that notices "when data looks too different
from the training data, or when the model's performance drops too low". This
module implements both halves, plus the part people forget: a rule for what
counts as too much, agreed before you look at the answer.

Three signals, because they fail at different times:

  Input drift        the animals arriving have changed. Detected by population
                     stability index and a two sample Kolmogorov-Smirnov test.
                     Fires early, often for harmless reasons.
  Prediction drift   the score distribution has moved. Available immediately,
                     before any outcome is known, which is its whole value.
  Performance drift  the model is actually worse. The signal that matters, and
                     the one you cannot see for 30 to 60 days because that is how
                     long it takes the label to exist.

The lag on the third is the reason the first two are worth having. In this data
the Austin shelter changed shape in March 2020, and the input signal moves weeks
before the performance signal can possibly confirm it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

# Conventional PSI reading, from the credit scoring literature where the metric
# comes from. Stated here so the thresholds are a decision, not a magic number
# buried in a comparison.
PSI_MINOR = 0.10
PSI_MAJOR = 0.25


def population_stability_index(
    reference: np.ndarray, current: np.ndarray, bins: int = 10
) -> float:
    """PSI between a reference and a current sample.

    Bin edges come from the reference quantiles so that the reference is uniform
    across bins by construction and any imbalance is genuinely the current
    sample's doing. Empty bins get a floor rather than producing an infinite
    logarithm.
    """
    reference = np.asarray(reference, dtype=float)
    current = np.asarray(current, dtype=float)
    reference = reference[np.isfinite(reference)]
    current = current[np.isfinite(current)]
    if len(reference) < 20 or len(current) < 20:
        return float("nan")

    edges = np.unique(np.quantile(reference, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf

    reference_share = np.histogram(reference, bins=edges)[0] / len(reference)
    current_share = np.histogram(current, bins=edges)[0] / len(current)
    floor = 1e-4
    reference_share = np.clip(reference_share, floor, None)
    current_share = np.clip(current_share, floor, None)
    return float(np.sum((current_share - reference_share) * np.log(current_share / reference_share)))


def categorical_drift(reference: pd.Series, current: pd.Series) -> float:
    """PSI for a categorical column, treating each level as its own bin."""
    reference_share = reference.value_counts(normalize=True)
    current_share = current.value_counts(normalize=True)
    levels = reference_share.index.union(current_share.index)
    floor = 1e-4
    r = reference_share.reindex(levels).fillna(0).clip(lower=floor)
    c = current_share.reindex(levels).fillna(0).clip(lower=floor)
    return float(np.sum((c - r) * np.log(c / r)))


def ks_statistic(reference: np.ndarray, current: np.ndarray) -> tuple[float, float]:
    """Two sample Kolmogorov-Smirnov statistic and p value."""
    from scipy import stats

    reference = np.asarray(reference, dtype=float)
    current = np.asarray(current, dtype=float)
    reference = reference[np.isfinite(reference)]
    current = current[np.isfinite(current)]
    if len(reference) < 20 or len(current) < 20:
        return float("nan"), float("nan")
    result = stats.ks_2samp(reference, current)
    return float(result.statistic), float(result.pvalue)


@dataclass
class DriftThresholds:
    """What we agreed counts as a problem, written down before we looked.

    The performance rule is deliberately relative rather than absolute. An AUC
    floor of, say, 0.75 sounds decisive until the shelter's population shifts and
    0.75 becomes an unreachable ceiling for reasons that have nothing to do with
    the model. A drop from the model's own validated baseline is the thing that
    should wake someone up.
    """

    psi_warning: float = PSI_MINOR
    psi_critical: float = PSI_MAJOR
    auc_relative_drop_warning: float = 0.03
    auc_relative_drop_critical: float = 0.07
    calibration_gap_warning: float = 0.05
    calibration_gap_critical: float = 0.10
    min_rows_to_evaluate: int = 300


def classify(value: float, warning: float, critical: float) -> str:
    """Map a number to OK, WARNING or CRITICAL."""
    if not np.isfinite(value):
        return "INSUFFICIENT_DATA"
    if value >= critical:
        return "CRITICAL"
    if value >= warning:
        return "WARNING"
    return "OK"


def feature_drift_report(
    reference: pd.DataFrame,
    current: pd.DataFrame,
    numeric_columns: list[str],
    categorical_columns: list[str],
    thresholds: DriftThresholds | None = None,
) -> pd.DataFrame:
    """PSI and KS for every monitored column, sorted worst first."""
    thresholds = thresholds or DriftThresholds()
    rows = []
    for column in numeric_columns:
        psi = population_stability_index(reference[column].to_numpy(), current[column].to_numpy())
        statistic, p_value = ks_statistic(reference[column].to_numpy(), current[column].to_numpy())
        rows.append(
            {
                "feature": column,
                "kind": "numeric",
                "psi": psi,
                "ks_statistic": statistic,
                "ks_p_value": p_value,
                "status": classify(psi, thresholds.psi_warning, thresholds.psi_critical),
                "reference_mean": float(np.nanmean(reference[column].to_numpy(dtype=float))),
                "current_mean": float(np.nanmean(current[column].to_numpy(dtype=float))),
            }
        )
    for column in categorical_columns:
        psi = categorical_drift(reference[column], current[column])
        rows.append(
            {
                "feature": column,
                "kind": "categorical",
                "psi": psi,
                "ks_statistic": np.nan,
                "ks_p_value": np.nan,
                "status": classify(psi, thresholds.psi_warning, thresholds.psi_critical),
                "reference_mean": np.nan,
                "current_mean": np.nan,
            }
        )
    return pd.DataFrame(rows).sort_values("psi", ascending=False).reset_index(drop=True)


def performance_report(
    frame: pd.DataFrame,
    label_column: str,
    score_column: str,
    period_column: str,
    baseline_auc: float,
    thresholds: DriftThresholds | None = None,
) -> pd.DataFrame:
    """Per period AUC, Brier and calibration gap, with a status per period."""
    from sklearn.metrics import brier_score_loss, roc_auc_score

    thresholds = thresholds or DriftThresholds()
    rows = []
    for period, group in frame.groupby(period_column, observed=True):
        labels = group[label_column].to_numpy(dtype=float)
        scores = group[score_column].to_numpy(dtype=float)
        row: dict = {"period": str(period), "n": len(group)}
        if len(group) < thresholds.min_rows_to_evaluate or labels.sum() in (0, len(labels)):
            row.update(
                {
                    "roc_auc": np.nan,
                    "brier": np.nan,
                    "observed_rate": float(labels.mean()) if len(labels) else np.nan,
                    "mean_predicted": float(scores.mean()) if len(scores) else np.nan,
                    "calibration_gap": np.nan,
                    "auc_relative_drop": np.nan,
                    "status": "INSUFFICIENT_DATA",
                }
            )
            rows.append(row)
            continue

        auc = float(roc_auc_score(labels, scores))
        gap = float(scores.mean() - labels.mean())
        relative_drop = (baseline_auc - auc) / baseline_auc
        auc_status = classify(
            relative_drop, thresholds.auc_relative_drop_warning, thresholds.auc_relative_drop_critical
        )
        calibration_status = classify(
            abs(gap), thresholds.calibration_gap_warning, thresholds.calibration_gap_critical
        )
        severity = {"OK": 0, "WARNING": 1, "CRITICAL": 2, "INSUFFICIENT_DATA": 0}
        overall = max([auc_status, calibration_status], key=lambda s: severity[s])
        row.update(
            {
                "roc_auc": auc,
                "brier": float(brier_score_loss(labels, scores)),
                "observed_rate": float(labels.mean()),
                "mean_predicted": float(scores.mean()),
                "calibration_gap": gap,
                "auc_relative_drop": float(relative_drop),
                "auc_status": auc_status,
                "calibration_status": calibration_status,
                "status": overall,
            }
        )
        rows.append(row)
    return pd.DataFrame(rows).sort_values("period").reset_index(drop=True)
