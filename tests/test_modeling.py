"""Tests for the evaluation metrics and the split.

These are the numbers that end up in the results table, so they are worth
checking against cases where the right answer can be worked out by hand rather
than trusted because the function returned something plausible.

The temporal split gets its own section because a leak there would not show up
as an error. It would show up as a better score, which is the most dangerous
kind of bug in a project like this.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression

from secondchance.modeling import (
    DEFAULT_SPLIT,
    RANDOM_SEED,
    TemporalSplit,
    bootstrap_metric,
    build_preprocessor,
    calibration_slope_intercept,
    delong_style_paired_bootstrap,
    evaluate_binary,
    expected_calibration_error,
    fit_calibrated,
    lift_at_k,
    make_model,
    precision_at_k,
    subgroup_metrics,
)

# --- the temporal split -------------------------------------------------------


def test_split_blocks_do_not_overlap_and_are_ordered():
    """Every animal lands in exactly one block, and the blocks are in time order.

    A random split would be the obvious mistake here and would be worth roughly
    a free 0.02 AUC, because the shelter's population is autocorrelated in time
    and neighbouring weeks look alike.
    """
    dates = pd.Series(pd.date_range("2013-10-01", "2022-03-01", freq="D"))
    block = DEFAULT_SPLIT.assign(dates)

    for name, (low, high) in {
        "train": (pd.Timestamp("2013-10-01"), DEFAULT_SPLIT.train_end),
        "valid": (DEFAULT_SPLIT.train_end, DEFAULT_SPLIT.valid_end),
        "test": (DEFAULT_SPLIT.valid_end, DEFAULT_SPLIT.test_end),
    }.items():
        selected = dates[block == name]
        assert selected.min() >= low, name
        assert selected.max() < high, name

    assert set(block.unique()) <= {"train", "valid", "test", "excluded"}
    assert (block == "excluded").sum() > 0, "the tail after test_end must be excluded"


def test_test_block_ends_sixty_days_before_the_export():
    """So that the 60-day long-stay label is observable for every test row.

    Without this the four targets would be evaluated on four different samples,
    and the comparison between them in the results table would not be a
    comparison at all.
    """
    export_cutoff = pd.Timestamp("2022-03-04")
    gap = (export_cutoff - DEFAULT_SPLIT.test_end).days
    assert gap >= 60, f"only {gap} days of slack for the 60-day label"


def test_split_boundaries_are_half_open_on_both_sides():
    """An animal arriving at midnight on the boundary belongs to exactly one block."""
    split = TemporalSplit(
        train_end=pd.Timestamp("2019-01-01"),
        valid_end=pd.Timestamp("2020-01-01"),
        test_end=pd.Timestamp("2021-01-01"),
    )
    edges = pd.Series(
        [
            pd.Timestamp("2018-12-31 23:59:59"),
            pd.Timestamp("2019-01-01 00:00:00"),
            pd.Timestamp("2019-12-31 23:59:59"),
            pd.Timestamp("2020-01-01 00:00:00"),
            pd.Timestamp("2020-12-31 23:59:59"),
            pd.Timestamp("2021-01-01 00:00:00"),
        ]
    )
    assert list(split.assign(edges)) == [
        "train", "valid", "valid", "test", "test", "excluded",
    ]


def test_split_serialises_to_plain_dates_for_the_model_card():
    as_dict = DEFAULT_SPLIT.as_dict()
    assert as_dict == {
        "train_end": "2019-01-01",
        "valid_end": "2020-01-01",
        "test_end": "2022-01-03",
    }


# --- metrics with answers that can be worked out by hand ----------------------


def test_precision_at_k_reads_the_top_of_the_ranking():
    y_true = np.array([1.0, 1.0, 0.0, 0.0, 0.0, 0.0])
    y_prob = np.array([0.9, 0.8, 0.7, 0.2, 0.1, 0.05])
    assert precision_at_k(y_true, y_prob, 2) == pytest.approx(1.0)
    assert precision_at_k(y_true, y_prob, 3) == pytest.approx(2 / 3)
    assert precision_at_k(y_true, y_prob, 6) == pytest.approx(2 / 6)


def test_lift_is_precision_over_the_base_rate():
    y_true = np.array([1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    y_prob = np.linspace(1.0, 0.0, 10)
    # Base rate 0.2, precision at 2 is 1.0, so lift is 5.
    assert lift_at_k(y_true, y_prob, 2) == pytest.approx(5.0)


def test_lift_is_nan_rather_than_infinite_when_nothing_is_positive():
    """A quarter with no positives should report "not measurable", not "perfect"."""
    y_true = np.zeros(50)
    assert np.isnan(lift_at_k(y_true, np.linspace(0, 1, 50), 10))


def test_k_larger_than_the_sample_is_clamped_not_an_error():
    y_true = np.array([1.0, 0.0, 1.0])
    y_prob = np.array([0.9, 0.5, 0.4])
    assert precision_at_k(y_true, y_prob, 100) == pytest.approx(2 / 3)


def test_expected_calibration_error_is_zero_for_a_perfect_model():
    """Constant prediction, matching constant outcome rate.

    Half the sample positive, every prediction exactly 0.5. Every equal-frequency
    bin then has predicted 0.5 and observed 0.5, so the gap is zero everywhere.
    """
    y_true = np.array([1.0, 0.0] * 500)
    y_prob = np.full(1000, 0.5)
    assert expected_calibration_error(y_true, y_prob) == pytest.approx(0.0, abs=1e-9)


def test_expected_calibration_error_catches_a_uniform_overconfidence():
    """Predicting 0.9 when the truth is 0.5 has to score 0.4."""
    y_true = np.array([1.0, 0.0] * 500)
    y_prob = np.full(1000, 0.9)
    assert expected_calibration_error(y_true, y_prob) == pytest.approx(0.4, abs=1e-9)


def test_calibration_error_is_small_on_a_genuinely_calibrated_sample(scored_sample):
    y_true, y_prob = scored_sample
    assert expected_calibration_error(y_true, y_prob) < 0.03


def test_calibration_slope_is_near_one_when_the_score_is_the_true_probability(scored_sample):
    """Slope 1, intercept 0 is the definition of calibrated in the logit sense."""
    y_true, y_prob = scored_sample
    slope, intercept = calibration_slope_intercept(y_true, y_prob)
    assert slope == pytest.approx(1.0, abs=0.15)
    assert intercept == pytest.approx(0.0, abs=0.15)


def test_calibration_slope_falls_below_one_for_overconfident_predictions():
    """The classic boosted tree failure, and the reason isotonic fitting is there."""
    rng = np.random.default_rng(RANDOM_SEED)
    probability = rng.beta(2.0, 2.0, size=4000)
    y_true = rng.binomial(1, probability).astype(float)
    # Push every prediction away from the middle, which is exactly what an
    # uncalibrated tree ensemble does.
    stretched = np.clip((probability - 0.5) * 2.2 + 0.5, 0.01, 0.99)
    slope, _ = calibration_slope_intercept(y_true, stretched)
    assert slope < 0.85


def test_evaluate_binary_returns_every_metric_the_results_table_needs(scored_sample):
    y_true, y_prob = scored_sample
    metrics = evaluate_binary(y_true, y_prob, queue_sizes=(20, 50))
    for key in [
        "n", "positive_rate", "roc_auc", "pr_auc", "brier", "log_loss", "ece",
        "calibration_slope", "calibration_intercept",
        "precision_at_20", "lift_at_20", "precision_at_50", "lift_at_50",
    ]:
        assert key in metrics, key
        assert np.isfinite(metrics[key]), key
    assert metrics["n"] == len(y_true)
    assert 0.0 <= metrics["roc_auc"] <= 1.0


# --- the uncertainty machinery ------------------------------------------------


def test_bootstrap_interval_brackets_the_point_estimate(scored_sample):
    y_true, y_prob = scored_sample
    point, low, high = bootstrap_metric(y_true, y_prob, n_boot=200)
    assert low < point < high
    assert high - low < 0.15, "the interval on 4000 rows should not be this wide"


def test_bootstrap_is_reproducible(scored_sample):
    """The paper quotes these intervals, so the same input must give the same one."""
    y_true, y_prob = scored_sample
    first = bootstrap_metric(y_true, y_prob, n_boot=100, seed=7)
    second = bootstrap_metric(y_true, y_prob, n_boot=100, seed=7)
    assert first == second


def test_paired_bootstrap_finds_no_difference_between_a_model_and_itself():
    """The null case. A p value near 1 and an interval that straddles zero."""
    rng = np.random.default_rng(RANDOM_SEED)
    probability = rng.beta(2.0, 4.0, size=1500)
    y_true = rng.binomial(1, probability).astype(float)
    result = delong_style_paired_bootstrap(y_true, probability, probability, n_boot=200)
    assert result["auc_difference"] == pytest.approx(0.0)
    assert result["ci_low"] <= 0 <= result["ci_high"]
    assert result["p_value"] > 0.5


def test_paired_bootstrap_detects_a_real_difference():
    """A score with noise added has to lose to the clean one, decisively."""
    rng = np.random.default_rng(RANDOM_SEED)
    probability = rng.beta(2.0, 4.0, size=3000)
    y_true = rng.binomial(1, probability).astype(float)
    degraded = np.clip(probability + rng.normal(0, 0.25, size=3000), 0.001, 0.999)
    result = delong_style_paired_bootstrap(y_true, probability, degraded, n_boot=300)
    assert result["auc_difference"] > 0.02
    assert result["ci_low"] > 0
    assert result["p_value"] < 0.05


# --- calibration fitting ------------------------------------------------------


def test_calibrator_is_fitted_on_validation_and_leaves_the_base_model_alone():
    """The base model must come back with the coefficients it was trained with.

    If the calibration wrapper refits it on the validation block, the "held out"
    calibration set has been trained on and the reported ECE is optimistic.
    """
    rng = np.random.default_rng(RANDOM_SEED)
    x_train = pd.DataFrame(rng.normal(size=(600, 3)), columns=["a", "b", "c"])
    y_train = (x_train["a"] + rng.normal(0, 0.5, 600) > 0).astype(int).to_numpy()
    x_valid = pd.DataFrame(rng.normal(size=(400, 3)), columns=["a", "b", "c"])
    y_valid = (x_valid["a"] + rng.normal(0, 0.5, 400) > 0).astype(int).to_numpy()

    model = LogisticRegression(max_iter=500)
    base, calibrated = fit_calibrated(model, x_train, y_train, x_valid, y_valid)

    reference = LogisticRegression(max_iter=500).fit(x_train, y_train)
    np.testing.assert_allclose(base.coef_, reference.coef_, rtol=1e-6)

    probabilities = calibrated.predict_proba(x_valid)[:, 1]
    assert probabilities.min() >= 0.0
    assert probabilities.max() <= 1.0


def test_calibration_fixes_an_overconfident_tree_ensemble():
    """The reason the isotonic step exists at all.

    A deep boosted ensemble on a small sample memorises the training block and
    comes back with probabilities pushed toward 0 and 1. It can still rank
    animals perfectly well while being badly wrong about how likely each one is,
    and it is the second number that appears on a shelter's screen.
    """
    import lightgbm as lgb

    rng = np.random.default_rng(RANDOM_SEED)

    def draw(n: int) -> tuple[pd.DataFrame, np.ndarray]:
        x = pd.DataFrame(rng.normal(size=(n, 4)), columns=list("abcd"))
        p = 1.0 / (1.0 + np.exp(-x["a"].to_numpy()))
        return x, rng.binomial(1, p).astype(float)

    x_train, y_train = draw(800)
    x_valid, y_valid = draw(800)
    x_test, y_test = draw(4000)

    overconfident = lgb.LGBMClassifier(
        n_estimators=400, num_leaves=63, min_child_samples=2,
        learning_rate=0.2, verbose=-1, random_state=RANDOM_SEED,
    )
    base, calibrated = fit_calibrated(overconfident, x_train, y_train, x_valid, y_valid)

    raw = base.predict_proba(x_test)[:, 1]
    cooked = calibrated.predict_proba(x_test)[:, 1]

    raw_ece = expected_calibration_error(y_test, raw)
    cooked_ece = expected_calibration_error(y_test, cooked)
    assert cooked_ece < raw_ece, f"calibration made it worse: {raw_ece:.4f} to {cooked_ece:.4f}"

    # And it must not have destroyed the ranking while fixing the numbers.
    from sklearn.metrics import roc_auc_score

    assert roc_auc_score(y_test, cooked) > roc_auc_score(y_test, raw) - 0.02


# --- model construction -------------------------------------------------------


@pytest.mark.parametrize("name", ["prior", "logistic", "logistic_simple", "lightgbm", "xgboost"])
def test_every_named_model_builds_and_fits(name):
    rng = np.random.default_rng(RANDOM_SEED)
    columns = ["age_at_intake_days", "animal_type"]
    frame = pd.DataFrame(
        {
            "age_at_intake_days": rng.normal(500, 200, 400),
            "animal_type": rng.choice(["Dog", "Cat"], 400),
        }
    )
    y = rng.binomial(1, 0.3, 400)
    model = make_model(name, columns)
    model.fit(frame, y)
    probabilities = model.predict_proba(frame)[:, 1]
    assert probabilities.shape == (400,)
    assert np.all((probabilities >= 0) & (probabilities <= 1))


def test_an_unknown_model_name_is_refused():
    with pytest.raises(ValueError):
        make_model("random_forest_of_hope", ["age_at_intake_days"])


def test_preprocessor_survives_a_category_it_has_never_seen():
    """Austin adds intake condition codes over time; a new one must not crash serving."""
    columns = ["age_at_intake_days", "intake_condition"]
    train = pd.DataFrame(
        {"age_at_intake_days": [10.0, 200.0, 900.0] * 20, "intake_condition": ["Normal"] * 60}
    )
    preprocessor = build_preprocessor(columns).fit(train)
    unseen = pd.DataFrame({"age_at_intake_days": [400.0], "intake_condition": ["Panleuk"]})
    transformed = preprocessor.transform(unseen)
    assert transformed.shape[0] == 1
    assert np.isfinite(transformed).all()


def test_preprocessor_imputes_a_missing_number_rather_than_failing():
    columns = ["age_at_intake_days", "intake_condition"]
    train = pd.DataFrame(
        {"age_at_intake_days": [10.0, 200.0, 900.0] * 20, "intake_condition": ["Normal"] * 60}
    )
    preprocessor = build_preprocessor(columns).fit(train)
    missing = pd.DataFrame({"age_at_intake_days": [np.nan], "intake_condition": ["Normal"]})
    transformed = preprocessor.transform(missing)
    assert np.isfinite(transformed).all(), "a missing age must be imputed, not propagated"


# --- subgroup reporting -------------------------------------------------------


def test_small_subgroups_report_their_size_but_not_a_metric():
    """An AUC on forty animals is noise dressed up as a finding.

    The fairness section of the paper is built on this table, so a group that is
    too small to measure has to say so rather than contribute a wild number.
    """
    rng = np.random.default_rng(RANDOM_SEED)
    n = 900
    frame = pd.DataFrame(
        {"animal_type": ["Dog"] * 850 + ["Bird"] * 50}
    )
    probability = rng.beta(2, 3, n)
    y_true = rng.binomial(1, probability).astype(float)

    table = subgroup_metrics(frame, y_true, probability, ["animal_type"], min_size=200)
    by_level = table.set_index("level")
    assert by_level.loc["Bird", "n"] == 50
    assert np.isnan(by_level.loc["Bird", "roc_auc"])
    assert np.isfinite(by_level.loc["Dog", "roc_auc"])


def test_subgroup_metrics_tolerates_a_repeated_group_column():
    """Because the calling script builds that list by concatenation.

    A duplicated name used to make pandas hand back a DataFrame where a Series
    was expected, and the error it raised named neither the column nor the cause.
    """
    rng = np.random.default_rng(RANDOM_SEED)
    frame = pd.DataFrame({"animal_type": rng.choice(["Dog", "Cat"], 800)})
    probability = rng.beta(2, 3, 800)
    y_true = rng.binomial(1, probability).astype(float)
    table = subgroup_metrics(frame, y_true, probability, ["animal_type", "animal_type"])
    assert len(table) == 2
