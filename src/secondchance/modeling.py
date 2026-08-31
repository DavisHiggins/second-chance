"""Model building, temporal splitting, calibration and evaluation.

Everything in here is deliberately plain scikit-learn plus LightGBM. The point of
the project is a working, monitored, explainable pipeline, not a leaderboard
score, and a gradient boosted tree on tabular shelter data is both the honest
choice and the one a shelter's IT volunteer can maintain after we graduate.

Three things in this file matter more than the model choice:

1. The split is temporal, never random. A random split lets the model learn from
   February to predict January, which no deployed system can do and which
   inflates every number.
2. Probabilities are calibrated on a held out block and the calibration is
   measured, not assumed. A ranked queue is useless if the shelter cannot read
   "0.2" as "about one in five".
3. Every headline number carries a bootstrap interval, because the differences
   between these models are small enough that a point estimate alone would be
   misleading.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .features import split_feature_types

log = logging.getLogger(__name__)

RANDOM_SEED = 20260820


@dataclass(frozen=True)
class TemporalSplit:
    """Date boundaries for the train, validation and test blocks.

    The defaults put the whole of 2020 and 2021 in the test block on purpose.
    Austin's shelter changed shape in March 2020, and a model that is only ever
    evaluated on data drawn from its own era will not tell you anything about
    what happens when the world moves. Testing across that break is the point.
    """

    train_end: pd.Timestamp
    valid_end: pd.Timestamp
    test_end: pd.Timestamp

    def assign(self, intake_datetime: pd.Series) -> pd.Series:
        """Label each intake timestamp with the block it belongs to.

        Boundaries are half open on the right, so an animal arriving at exactly
        midnight on ``train_end`` is the first row of the validation block rather
        than the last row of training.
        """
        block = pd.Series("excluded", index=intake_datetime.index, dtype=object)
        block[intake_datetime < self.train_end] = "train"
        block[(intake_datetime >= self.train_end) & (intake_datetime < self.valid_end)] = "valid"
        block[(intake_datetime >= self.valid_end) & (intake_datetime < self.test_end)] = "test"
        return block

    def as_dict(self) -> dict[str, str]:
        """Return the boundaries as ISO dates, for the model card and results file."""
        return {k: str(v.date()) for k, v in asdict(self).items()}


DEFAULT_SPLIT = TemporalSplit(
    train_end=pd.Timestamp("2019-01-01"),
    valid_end=pd.Timestamp("2020-01-01"),
    # Stop 60 days short of the 2022-03-04 export so that the 60 day long stay
    # label is observable for every test row rather than administratively
    # censored. The classification code drops unresolved labels anyway, but
    # ending the block here keeps the four targets on the same sample.
    test_end=pd.Timestamp("2022-01-03"),
)


def build_preprocessor(feature_columns: Sequence[str]) -> ColumnTransformer:
    """One hot the categoricals, median impute and scale the numerics.

    Scaling is pointless for trees and necessary for logistic regression, and
    running both through the same transformer keeps the comparison fair: any
    difference in scores comes from the model, not from a preprocessing quirk.
    """
    numeric, categorical = split_feature_types(list(feature_columns))
    return ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
                        ("scale", StandardScaler()),
                    ]
                ),
                numeric,
            ),
            (
                "categorical",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="constant", fill_value="missing")),
                        (
                            "encode",
                            OneHotEncoder(handle_unknown="ignore", min_frequency=25, sparse_output=False),
                        ),
                    ]
                ),
                categorical,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=True,
    )


def make_model(name: str, feature_columns: Sequence[str], scale_pos_weight: float = 1.0):
    """Return an unfitted estimator by short name.

    Args:
        name: one of "prior", "logistic", "logistic_simple", "lightgbm", "xgboost".
        feature_columns: the columns the preprocessor should expect.
        scale_pos_weight: positive class weight, used only by the boosted models
            on the heavily imbalanced long stay target.
    """
    if name == "prior":
        # Predicts the training base rate for every animal. This is the number a
        # shelter already has without us, so it is the bar to clear.
        return DummyClassifier(strategy="prior")

    if name in {"logistic", "logistic_simple"}:
        return Pipeline(
            [
                ("prep", build_preprocessor(feature_columns)),
                (
                    "clf",
                    LogisticRegression(
                        max_iter=2000,
                        C=1.0,
                        solver="lbfgs",
                        random_state=RANDOM_SEED,
                        class_weight=None,
                    ),
                ),
            ]
        )

    if name == "lightgbm":
        import lightgbm as lgb

        return Pipeline(
            [
                ("prep", build_preprocessor(feature_columns)),
                (
                    "clf",
                    lgb.LGBMClassifier(
                        n_estimators=600,
                        learning_rate=0.05,
                        num_leaves=48,
                        min_child_samples=60,
                        subsample=0.85,
                        subsample_freq=1,
                        colsample_bytree=0.8,
                        reg_lambda=1.0,
                        scale_pos_weight=scale_pos_weight,
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                        verbose=-1,
                    ),
                ),
            ]
        )

    if name == "xgboost":
        import xgboost as xgb

        return Pipeline(
            [
                ("prep", build_preprocessor(feature_columns)),
                (
                    "clf",
                    xgb.XGBClassifier(
                        n_estimators=600,
                        learning_rate=0.05,
                        max_depth=6,
                        min_child_weight=5,
                        subsample=0.85,
                        colsample_bytree=0.8,
                        reg_lambda=1.0,
                        scale_pos_weight=scale_pos_weight,
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                        tree_method="hist",
                        eval_metric="logloss",
                    ),
                ),
            ]
        )

    raise ValueError(f"Unknown model name {name!r}")


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, bins: int = 20) -> float:
    """Bin predictions and average the gap between predicted and observed rate.

    Equal frequency bins rather than equal width, so that the metric is not
    dominated by the empty region above 0.9 where a long stay model puts almost
    nothing.
    """
    order = np.argsort(y_prob)
    y_true, y_prob = y_true[order], y_prob[order]
    chunks = np.array_split(np.arange(len(y_prob)), bins)
    total = 0.0
    for chunk in chunks:
        if len(chunk) == 0:
            continue
        gap = abs(y_prob[chunk].mean() - y_true[chunk].mean())
        total += gap * len(chunk) / len(y_prob)
    return float(total)


def calibration_slope_intercept(y_true: np.ndarray, y_prob: np.ndarray) -> tuple[float, float]:
    """Regress outcomes on the predicted log odds.

    A perfectly calibrated model gives slope 1 and intercept 0. Slope below 1
    means the predictions are too extreme, which is the usual failure mode for a
    boosted tree, and is exactly what the isotonic step is there to fix.
    """
    eps = 1e-6
    clipped = np.clip(y_prob, eps, 1 - eps)
    logit = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    model = LogisticRegression(max_iter=1000)
    model.fit(logit, y_true)
    return float(model.coef_[0][0]), float(model.intercept_[0])


def precision_at_k(y_true: np.ndarray, y_prob: np.ndarray, k: int) -> float:
    """Share of true positives among the k highest scoring animals.

    This is the metric that maps onto the product. The shelter's marketing
    volunteer has time for maybe twenty animals a week, so what matters is
    whether the top twenty of the queue are genuinely the animals who need help,
    not the area under a curve nobody will ever look at.
    """
    if k <= 0 or k > len(y_prob):
        k = min(max(k, 1), len(y_prob))
    top = np.argsort(-y_prob)[:k]
    return float(y_true[top].mean())


def lift_at_k(y_true: np.ndarray, y_prob: np.ndarray, k: int) -> float:
    """Precision at k divided by the base rate."""
    base = y_true.mean()
    if base == 0:
        return float("nan")
    return float(precision_at_k(y_true, y_prob, k) / base)


def evaluate_binary(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    queue_sizes: Sequence[int] = (20, 50, 100),
) -> dict[str, float]:
    """The full metric set for one target on one block."""
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.asarray(y_prob, dtype=float)
    slope, intercept = calibration_slope_intercept(y_true, y_prob)
    metrics = {
        "n": len(y_true),
        "positive_rate": float(y_true.mean()),
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "pr_auc": float(average_precision_score(y_true, y_prob)),
        "brier": float(brier_score_loss(y_true, y_prob)),
        "log_loss": float(log_loss(y_true, np.clip(y_prob, 1e-9, 1 - 1e-9))),
        "ece": expected_calibration_error(y_true, y_prob),
        "calibration_slope": slope,
        "calibration_intercept": intercept,
    }
    for k in queue_sizes:
        metrics[f"precision_at_{k}"] = precision_at_k(y_true, y_prob, k)
        metrics[f"lift_at_{k}"] = lift_at_k(y_true, y_prob, k)
    return metrics


def bootstrap_metric(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    metric: str = "roc_auc",
    n_boot: int = 400,
    seed: int = RANDOM_SEED,
) -> tuple[float, float, float]:
    """Percentile bootstrap interval for one metric.

    Returns (point estimate, lower 2.5 percent, upper 97.5 percent).
    """
    rng = np.random.default_rng(seed)
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.asarray(y_prob, dtype=float)

    def compute(t: np.ndarray, p: np.ndarray) -> float:
        if metric == "roc_auc":
            return float(roc_auc_score(t, p))
        if metric == "pr_auc":
            return float(average_precision_score(t, p))
        if metric == "brier":
            return float(brier_score_loss(t, p))
        raise ValueError(metric)

    point = compute(y_true, y_prob)
    draws = np.empty(n_boot)
    n = len(y_true)
    for i in range(n_boot):
        idx = rng.integers(0, n, n)
        if y_true[idx].sum() in (0, len(idx)):
            draws[i] = np.nan
            continue
        draws[i] = compute(y_true[idx], y_prob[idx])
    valid = draws[~np.isnan(draws)]
    return point, float(np.percentile(valid, 2.5)), float(np.percentile(valid, 97.5))


def delong_style_paired_bootstrap(
    y_true: np.ndarray,
    prob_a: np.ndarray,
    prob_b: np.ndarray,
    n_boot: int = 1000,
    seed: int = RANDOM_SEED,
) -> dict[str, float]:
    """Paired bootstrap of the AUC difference between two models.

    Paired, because both models see the same animals. Resampling them
    independently would throw away that pairing and widen the interval for no
    reason.
    """
    rng = np.random.default_rng(seed)
    y_true = np.asarray(y_true, dtype=float)
    n = len(y_true)
    observed = roc_auc_score(y_true, prob_a) - roc_auc_score(y_true, prob_b)
    diffs = np.empty(n_boot)
    for i in range(n_boot):
        idx = rng.integers(0, n, n)
        if y_true[idx].sum() in (0, len(idx)):
            diffs[i] = np.nan
            continue
        diffs[i] = roc_auc_score(y_true[idx], prob_a[idx]) - roc_auc_score(y_true[idx], prob_b[idx])
    valid = diffs[~np.isnan(diffs)]
    return {
        "auc_difference": float(observed),
        "ci_low": float(np.percentile(valid, 2.5)),
        "ci_high": float(np.percentile(valid, 97.5)),
        # Two sided bootstrap p value: how often the resampled difference lands on
        # the other side of zero from the observed one.
        "p_value": float(2 * min((valid <= 0).mean(), (valid >= 0).mean())),
    }


def fit_calibrated(
    base_model,
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_valid: pd.DataFrame,
    y_valid: np.ndarray,
):
    """Fit on train, then fit an isotonic calibrator on the validation block.

    ``CalibratedClassifierCV`` with ``cv="prefit"`` is the right tool here: it
    leaves the already fitted model alone and learns only the monotone map from
    raw score to probability, using data the model has never seen. Calibrating on
    the training block instead would be a slow motion way of lying to ourselves.
    """
    base_model.fit(x_train, y_train)
    try:
        # scikit-learn 1.6 and later: wrap the fitted estimator so the calibrator
        # cannot refit it.
        from sklearn.frozen import FrozenEstimator

        calibrated = CalibratedClassifierCV(FrozenEstimator(base_model), method="isotonic")
    except ImportError:  # pragma: no cover - older scikit-learn
        calibrated = CalibratedClassifierCV(base_model, method="isotonic", cv="prefit")
    calibrated.fit(x_valid, y_valid)
    return base_model, calibrated


def subgroup_metrics(
    frame: pd.DataFrame,
    y_true: np.ndarray,
    y_prob: np.ndarray,
    group_columns: Sequence[str],
    min_size: int = 200,
) -> pd.DataFrame:
    """Per subgroup AUC, calibration and base rate.

    Groups smaller than ``min_size`` are reported with their size but without
    metrics, because an AUC computed on forty animals is noise dressed up as a
    finding.
    """
    rows: list[dict[str, Any]] = []
    frame = frame.loc[:, ~frame.columns.duplicated()].reset_index(drop=True)
    for column in dict.fromkeys(group_columns):
        values = frame[column]
        for level in values.dropna().unique():
            index = np.flatnonzero((values == level).to_numpy())
            t, p = y_true[index], y_prob[index]
            row: dict[str, Any] = {
                "attribute": column,
                "level": str(level),
                "n": len(t),
                "positive_rate": float(t.mean()) if len(t) else np.nan,
            }
            if len(t) >= min_size and 0 < t.sum() < len(t):
                row["roc_auc"] = float(roc_auc_score(t, p))
                row["mean_predicted"] = float(p.mean())
                row["ece"] = expected_calibration_error(t, p, bins=10)
                row["calibration_gap"] = float(p.mean() - t.mean())
            else:
                row["roc_auc"] = np.nan
                row["mean_predicted"] = float(p.mean()) if len(p) else np.nan
                row["ece"] = np.nan
                row["calibration_gap"] = np.nan
            rows.append(row)
    return pd.DataFrame(rows).sort_values(["attribute", "n"], ascending=[True, False])
