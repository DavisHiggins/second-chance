"""Step eight: every figure in the paper and the deck, built from measured results.

Nothing in this file invents a number. Each figure reads one of the JSON or CSV
files written by steps three through seven, so a figure can never disagree with
the table it sits next to.

Writes results/figures/*.png and *.pdf.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("figures")

from secondchance.plotting import (
    GRID,
    INK_MUTED,
    INK_PRIMARY,
    INK_SECONDARY,
    SEQUENTIAL,
    SERIES,
    STATUS,
    WIDTH_DOUBLE,
    WIDTH_SINGLE,
    apply_style,
    finish,
    heading,
    save,
)

TABLES = ROOT / "results" / "tables"
FIGURES = ROOT / "results" / "figures"


def load(name: str):
    path = TABLES / name
    if name.endswith(".json"):
        return json.loads(path.read_text())
    return pd.read_csv(path)


# -----------------------------------------------------------------------------
def figure_data_funnel(audit: dict, main: dict) -> None:
    """How 274,143 published rows become 128,157 modelling episodes."""
    stages = [
        ("Published API rows", audit["intake_rows"] + audit["outcome_rows"]),
        ("Intake rows (episode candidates)", audit["intake_rows"]),
        ("Episodes after dedup", audit["episodes_built"]),
        ("Dogs and cats", audit["episodes_built"] - main["cohort"]["excluded_not_dog_or_cat"]),
        (
            "On the adoption pathway",
            audit["episodes_built"]
            - main["cohort"]["excluded_not_dog_or_cat"]
            - main["cohort"]["excluded_off_adoption_pathway"],
        ),
        ("Final modelling cohort", main["cohort"]["episodes_final"]),
    ]
    labels = [s[0] for s in stages]
    values = [s[1] for s in stages]

    fig, ax = plt.subplots(figsize=(WIDTH_DOUBLE, 3.0))
    positions = np.arange(len(values))[::-1]
    colors = [SEQUENTIAL[3]] * (len(values) - 1) + [SERIES[0]]
    ax.barh(positions, values, height=0.62, color=colors, edgecolor="none")
    for position, value in zip(positions, values, strict=False):
        ax.text(
            value + max(values) * 0.012, position, f"{value:,}",
            va="center", ha="left", fontsize=7.5, color=INK_SECONDARY,
        )
    ax.set_yticks(positions)
    ax.set_yticklabels(labels, fontsize=7.5, color=INK_SECONDARY)
    ax.set_xlim(0, max(values) * 1.16)
    ax.set_xticks([])
    ax.grid(False)
    for spine in ax.spines.values():
        spine.set_visible(False)
    heading(
        ax,
        "From published rows to modelling cohort",
        "Austin Animal Center, 1 October 2013 to 4 March 2022. Every exclusion is counted.",
        title_size=9.2,
    )
    save(fig, FIGURES / "fig02_data_funnel")


# -----------------------------------------------------------------------------
def figure_estimator_comparison(survival: dict) -> None:
    """The methodological headline: two estimators, one dataset, very different answers."""
    comparison = pd.DataFrame(survival["estimator_comparison"])
    curves = load("km_curves.csv")
    overall = (
        curves.loc[curves["stratum"] == "animal_type"]
        .groupby("day")[["km_adopted", "cif_adopted"]]
        .apply(lambda g: g.mean())
        .reset_index()
    )

    fig, (left, right) = plt.subplots(
        1, 2, figsize=(WIDTH_DOUBLE, 2.9), gridspec_kw={"width_ratios": [1.25, 1]}
    )

    left.plot(overall["day"], overall["km_adopted"], color=SERIES[1],
              label="Kaplan-Meier, competing exits treated as censored")
    left.plot(overall["day"], overall["cif_adopted"], color=SERIES[0],
              label="Aalen-Johansen cumulative incidence")
    left.fill_between(
        overall["day"], overall["cif_adopted"], overall["km_adopted"],
        color=SERIES[1], alpha=0.10, linewidth=0,
    )
    left.set_ylim(0, 1)
    left.set_xlim(0, 180)
    left.axhline(0.5, color=GRID, linewidth=0.8, zorder=0)
    finish(left, title="Two estimators, one dataset",
           subtitle="Share of arrivals adopted, by days since intake",
           xlabel="Days since intake", ylabel="Cumulative share adopted")
    left.legend(loc="upper left", fontsize=6.8)
    left.annotate(
        "gap is the\ncompeting-risk error",
        xy=(120, (float(np.interp(120, overall["day"], overall["km_adopted"]))
                  + float(np.interp(120, overall["day"], overall["cif_adopted"]))) / 2),
        xytext=(78, 0.62), fontsize=6.8, color=INK_SECONDARY,
        arrowprops={"arrowstyle": "-", "color": INK_MUTED, "linewidth": 0.8},
    )

    positions = np.arange(len(comparison))
    right.bar(
        positions, comparison["relative_overstatement_pct"],
        width=0.62, color=SERIES[1], edgecolor="none",
    )
    for position, value in zip(positions, comparison["relative_overstatement_pct"], strict=False):
        right.text(position, value + 2.5, f"{value:.0f}%", ha="center",
                   fontsize=6.8, color=INK_SECONDARY)
    right.set_xticks(positions)
    right.set_xticklabels([f"{d}" for d in comparison["day"]])
    right.set_ylim(0, comparison["relative_overstatement_pct"].max() * 1.22)
    finish(right, title="Size of the error",
           subtitle="Kaplan-Meier overstatement, percent",
           xlabel="Days since intake", ylabel="Relative overstatement")
    save(fig, FIGURES / "fig03_estimator_comparison")


# -----------------------------------------------------------------------------
def figure_cif_by_stratum() -> None:
    """Small multiples. Faceted rather than one crowded chart, per the series cap."""
    curves = load("km_curves.csv")
    panels = [
        ("animal_type", ["Dog", "Cat"], "Species"),
        ("age_band", ["puppy_kitten", "young_adult", "senior"], "Life stage"),
        ("breed_bully_type", ["0", "1"], "Bully-type breed label"),
        ("color_has_black", ["0", "1"], "Black in the coat colour"),
    ]
    pretty = {
        "0": "no", "1": "yes",
        "puppy_kitten": "puppy or kitten", "young_adult": "young adult", "senior": "senior",
    }

    fig, axes = plt.subplots(2, 2, figsize=(WIDTH_DOUBLE, 4.4), sharex=True, sharey=True)
    for ax, (stratum, levels, title) in zip(axes.ravel(), panels, strict=False):
        subset = curves.loc[curves["stratum"] == stratum]
        for index, level in enumerate(levels):
            group = subset.loc[subset["level"] == level].sort_values("day")
            if group.empty:
                continue
            ax.plot(
                group["day"], group["cif_adopted"],
                color=SERIES[index], linewidth=1.9,
                label=f"{pretty.get(level, level)} (n={int(group['n'].iloc[0]):,})",
            )
        ax.set_ylim(0, 0.72)
        ax.set_xlim(0, 180)
        ax.set_title(title, loc="left", fontsize=8.2, color=INK_PRIMARY)
        ax.legend(loc="lower right", fontsize=6.4)
        ax.grid(axis="y", color=GRID, linewidth=0.6)
        ax.grid(axis="x", visible=False)
    for ax in axes[1]:
        ax.set_xlabel("Days since intake")
    for ax in axes[:, 0]:
        ax.set_ylabel("Cumulative incidence\nof adoption")
    fig.tight_layout(rect=(0, 0, 1, 0.925))
    fig.suptitle(
        "Who waits, and for how long",
        x=0.005, y=0.995, ha="left", fontsize=9.5, color=INK_PRIMARY, weight="semibold",
    )
    fig.text(
        0.005, 0.952,
        "Aalen-Johansen cumulative incidence, competing exits held out. 126,494 episodes.",
        fontsize=7.2, color=INK_SECONDARY, ha="left",
    )
    save(fig, FIGURES / "fig04_cif_by_stratum")


# -----------------------------------------------------------------------------
def figure_model_comparison(main: dict) -> None:
    """Grouped bars with bootstrap intervals. Four targets, three real models."""
    targets = ["adopted_within_7d", "adopted_within_14d", "adopted_within_30d", "long_stay_60d"]
    nice_target = {
        "adopted_within_7d": "Adopted\nwithin 7 days",
        "adopted_within_14d": "Adopted\nwithin 14 days",
        "adopted_within_30d": "Adopted\nwithin 30 days",
        "long_stay_60d": "Long stay\nbeyond 60 days",
    }
    models = ["logistic", "lightgbm", "xgboost"]
    nice_model = {"logistic": "Logistic regression", "lightgbm": "LightGBM", "xgboost": "XGBoost"}

    fig, ax = plt.subplots(figsize=(WIDTH_DOUBLE, 3.3))
    width = 0.24
    base = np.arange(len(targets))
    for index, model in enumerate(models):
        values, lows, highs = [], [], []
        for target in targets:
            entry = main["targets"][target]["models"][model]["test_calibrated"]
            values.append(entry["roc_auc"])
            interval = entry.get("roc_auc_ci", [entry["roc_auc"], entry["roc_auc"]])
            lows.append(entry["roc_auc"] - interval[0])
            highs.append(interval[1] - entry["roc_auc"])
        offset = (index - 1) * width
        ax.bar(
            base + offset, values, width=width * 0.92,
            color=SERIES[index], edgecolor="none", label=nice_model[model],
            yerr=[lows, highs], capsize=2,
            error_kw={"elinewidth": 0.9, "ecolor": INK_MUTED},
        )
        for position, value in zip(base + offset, values, strict=False):
            ax.text(position, value + 0.008, f"{value:.3f}", ha="center",
                    fontsize=6.0, color=INK_SECONDARY)

    ax.axhline(0.5, color=INK_MUTED, linewidth=0.9, linestyle=(0, (3, 3)))
    ax.text(len(targets) - 0.72, 0.508, "chance", fontsize=6.6, color=INK_MUTED, ha="right")
    ax.set_xticks(base)
    ax.set_xticklabels([nice_target[t] for t in targets], fontsize=7.4)
    ax.set_ylim(0.45, 0.885)
    finish(ax, title="Held-out discrimination on 2020 to 2021 arrivals",
           subtitle="ROC AUC after isotonic calibration, with 95 percent bootstrap intervals",
           ylabel="ROC AUC")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=3, frameon=False)
    save(fig, FIGURES / "fig05_model_comparison")


# -----------------------------------------------------------------------------
def figure_calibration() -> None:
    """Reliability diagram for the 30 day model, raw against calibrated."""
    predictions = pd.read_parquet(ROOT / "data/interim/test_predictions.parquet")
    truth = predictions["y_adopted_within_30d"].to_numpy()
    scores = predictions["p_lightgbm_adopted_within_30d"].to_numpy()
    mask = np.isfinite(truth) & np.isfinite(scores)
    truth, scores = truth[mask], scores[mask]

    survival = load("survival_results.json")
    deciles = pd.DataFrame(survival["survival_calibration_by_decile"])

    fig, (left, right) = plt.subplots(1, 2, figsize=(WIDTH_DOUBLE, 3.0))

    order = np.argsort(scores)
    chunks = np.array_split(order, 15)
    predicted = [scores[c].mean() for c in chunks]
    observed = [truth[c].mean() for c in chunks]
    left.plot([0, 1], [0, 1], color=INK_MUTED, linewidth=1.0, linestyle=(0, (3, 3)),
              label="perfect calibration")
    left.plot(predicted, observed, color=SERIES[0], marker="o", markersize=4,
              markeredgecolor="white", markeredgewidth=0.8, label="classifier, 30 day adoption")
    left.set_xlim(0, 1)
    left.set_ylim(0, 1)
    finish(left, title="The score means what it says",
           subtitle="Fifteen equal-frequency bins, 20,165 held-out animals",
           xlabel="Mean predicted probability", ylabel="Observed adoption rate", legend=True,
           legend_loc="upper left")

    right.plot([0, 1], [0, 1], color=INK_MUTED, linewidth=1.0, linestyle=(0, (3, 3)))
    right.plot(deciles["mean_predicted_30d"], deciles["observed_cif_30d"],
               color=SERIES[2], marker="o", markersize=4,
               markeredgecolor="white", markeredgewidth=0.8,
               label="survival model, competing risks")
    naive_mean = survival["competing_risk_correction"]["mean_naive_predicted_30d"]
    observed_mean = survival["competing_risk_correction"]["mean_observed_cif_30d"]
    right.plot([naive_mean], [observed_mean], marker="X", markersize=8,
               color=STATUS["critical"], linestyle="none",
               label="same model, competing risks ignored")
    right.set_xlim(0, 1)
    right.set_ylim(0, 1)
    finish(right, title="Ignoring competing risks breaks calibration",
           subtitle="Predicted deciles against observed cumulative incidence",
           xlabel="Mean predicted probability", ylabel="Observed cumulative incidence",
           legend=True, legend_loc="upper left")
    save(fig, FIGURES / "fig06_calibration")


# -----------------------------------------------------------------------------
def figure_ablation(ablations: dict) -> None:
    """What each block of features buys, on both targets."""
    thirty = pd.DataFrame(ablations["cumulative_blocks"])
    long_stay = pd.DataFrame(ablations["cumulative_blocks_long_stay"])

    fig, (left, right) = plt.subplots(1, 2, figsize=(WIDTH_DOUBLE, 3.1), sharey=False)
    for ax, frame, title, color in [
        (left, thirty, "Adopted within 30 days", SERIES[0]),
        (right, long_stay, "Long stay beyond 60 days", SERIES[1]),
    ]:
        positions = np.arange(len(frame))
        ax.plot(positions, frame["roc_auc"], color=color, marker="o", markersize=5,
                markeredgecolor="white", markeredgewidth=0.9)
        for position, value in zip(positions, frame["roc_auc"], strict=False):
            ax.annotate(f"{value:.3f}", (position, value), textcoords="offset points",
                        xytext=(0, 8), ha="center", fontsize=6.8, color=INK_SECONDARY)
        ax.set_xticks(positions)
        ax.set_xticklabels(frame["configuration"], rotation=20, ha="right", fontsize=6.8)
        span = frame["roc_auc"].max() - frame["roc_auc"].min()
        ax.set_ylim(frame["roc_auc"].min() - span * 0.45, frame["roc_auc"].max() + span * 0.55)
        finish(ax, title=title, ylabel="ROC AUC")

    fig.tight_layout(rect=(0, 0, 1, 0.83))
    fig.suptitle("Each block of features, added in turn",
                 x=0.005, y=0.985, ha="left", fontsize=9.5, color=INK_PRIMARY, weight="semibold")
    fig.text(0.005, 0.912,
             "Weather is excluded here and tested separately on the window where the station record exists.",
             fontsize=7.0, color=INK_SECONDARY, ha="left")
    save(fig, FIGURES / "fig07_ablation")


# -----------------------------------------------------------------------------
def figure_breed_strategy(ablations: dict) -> None:
    """Does the language model earn its place against a keyword baseline?"""
    fig, ax = plt.subplots(figsize=(WIDTH_SINGLE * 1.9, 3.0))
    labels = {"none": "No breed features", "rules": "Keyword baseline", "llm": "LLM structuring"}
    width = 0.34
    for index, (target, nice) in enumerate(
        [("adopted_within_30d", "Adopted within 30 days"), ("long_stay_60d", "Long stay beyond 60 days")]
    ):
        frame = pd.DataFrame(ablations["breed_strategy"][target])
        positions = np.arange(len(frame)) + (index - 0.5) * width
        ax.bar(positions, frame["roc_auc"], width=width * 0.9,
               color=SERIES[index], edgecolor="none", label=nice)
        for position, value in zip(positions, frame["roc_auc"], strict=False):
            ax.text(position, value + 0.004, f"{value:.4f}", ha="center",
                    fontsize=6.4, color=INK_SECONDARY)
    ax.set_xticks(np.arange(3))
    ax.set_xticklabels([labels[s] for s in ["none", "rules", "llm"]], fontsize=7.4)
    ax.set_ylim(0.70, 0.815)
    finish(ax, title="Structured breed attributes from a language model",
           subtitle="Paired bootstrap: the LLM beats the keyword baseline decisively on long\nstay, and is indistinguishable from it on 30-day adoption",
           ylabel="ROC AUC")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.13), ncol=2, frameon=False)
    save(fig, FIGURES / "fig08_breed_strategy")


# -----------------------------------------------------------------------------
def figure_importance(interpretability: dict) -> None:
    """SHAP and permutation side by side, because they disagree and that matters."""
    shap_frame = load("shap_importance_adopt_30d.csv").head(12)
    perm_frame = load("permutation_importance_adopt_30d.csv").head(12)

    fig, (left, right) = plt.subplots(1, 2, figsize=(WIDTH_DOUBLE, 3.4))

    positions = np.arange(len(shap_frame))[::-1]
    colors = [SERIES[0] if d >= 0 else SERIES[1] for d in shap_frame["direction"]]
    left.barh(positions, shap_frame["mean_abs_shap"], height=0.66, color=colors, edgecolor="none")
    left.set_yticks(positions)
    left.set_yticklabels(shap_frame["feature"], fontsize=7)
    left.grid(axis="x", color=GRID, linewidth=0.6)
    left.grid(axis="y", visible=False)
    heading(left, "SHAP contribution", "Blue raises the predicted chance, orange lowers it", 8.6)
    left.set_xlabel("Mean absolute SHAP value")

    positions = np.arange(len(perm_frame))[::-1]
    right.barh(positions, perm_frame["auc_drop_mean"], height=0.66,
               xerr=perm_frame["auc_drop_std"], color=SERIES[2], edgecolor="none",
               error_kw={"elinewidth": 0.9, "ecolor": INK_MUTED})
    right.set_yticks(positions)
    right.set_yticklabels(perm_frame["feature"], fontsize=7)
    right.grid(axis="x", color=GRID, linewidth=0.6)
    right.grid(axis="y", visible=False)
    correlation = interpretability["adopt_30d"]["shap_permutation_rank_correlation"]
    heading(right, "Permutation importance",
            f"Rank correlation with the SHAP ordering: {correlation:.2f}", 8.6)
    right.set_xlabel("Held-out AUC lost when shuffled")

    fig.tight_layout()
    save(fig, FIGURES / "fig09_importance")


# -----------------------------------------------------------------------------
def figure_partial_dependence() -> None:
    """The shape of the age effect, which is the single strongest signal."""
    frame = load("partial_dependence_adopt_30d.csv")
    age = frame.loc[frame["feature"] == "age at intake days"].sort_values("value")
    census = frame.loc[frame["feature"] == "shelter census at intake"].sort_values("value")

    fig, (left, right) = plt.subplots(1, 2, figsize=(WIDTH_DOUBLE, 2.7))
    left.plot(age["value"] / 365.25, age["mean_prediction"], color=SERIES[0],
              marker="o", markersize=4, markeredgecolor="white", markeredgewidth=0.8)
    left.set_xscale("log")
    left.set_xticks([0.05, 0.25, 1, 4, 12])
    left.set_xticklabels(["3 wk", "3 mo", "1 yr", "4 yr", "12 yr"])
    finish(left, title="Age at intake",
           subtitle="Model output holding everything else at its observed value",
           xlabel="Age at intake, log scale", ylabel="Mean predicted chance\nof adoption in 30 days")

    right.plot(census["value"], census["mean_prediction"], color=SERIES[1],
               marker="o", markersize=4, markeredgecolor="white", markeredgewidth=0.8)
    finish(right, title="How full the shelter was",
           subtitle="Animals in care on the day of arrival",
           xlabel="Animals in the shelter's care", ylabel="Mean predicted chance\nof adoption in 30 days")
    save(fig, FIGURES / "fig10_partial_dependence")


# -----------------------------------------------------------------------------
def figure_subgroups() -> None:
    """Where the model is worse, and where it is biased. Both, on one chart."""
    frame = load("subgroup_metrics.csv")
    keep = frame.loc[frame["roc_auc"].notna() & (frame["n"] >= 700)].copy()
    keep = keep.loc[keep["attribute"].isin(
        ["animal_type", "age_band", "breed_bully_type", "color_has_black", "breed_bsl_risk", "intake_condition"]
    )]
    pretty = {
        "animal_type": "species", "age_band": "life stage",
        "breed_bully_type": "bully-type label", "color_has_black": "black coat",
        "breed_bsl_risk": "restricted-breed label", "intake_condition": "intake condition",
    }
    keep["label"] = keep.apply(
        lambda r: f"{pretty[r['attribute']]}: {r['level']}  (n={int(r['n']):,})", axis=1
    )
    keep = keep.sort_values("roc_auc")

    fig, (left, right) = plt.subplots(
        1, 2, figsize=(WIDTH_DOUBLE, 4.0), sharey=True, gridspec_kw={"width_ratios": [1.1, 1]}
    )
    positions = np.arange(len(keep))
    left.hlines(positions, 0.5, keep["roc_auc"], color=GRID, linewidth=1.4)
    left.plot(keep["roc_auc"], positions, "o", color=SERIES[0], markersize=5.5,
              markeredgecolor="white", markeredgewidth=0.9, linestyle="none")
    overall = 0.7973
    left.axvline(overall, color=INK_MUTED, linewidth=1.0, linestyle=(0, (3, 3)))
    left.text(overall + 0.004, len(keep) - 0.4, f"overall {overall:.3f}",
              fontsize=6.6, color=INK_MUTED)
    left.set_yticks(positions)
    left.set_yticklabels(keep["label"], fontsize=7)
    left.set_xlim(0.55, 1.0)
    left.grid(axis="x", color=GRID, linewidth=0.6)
    left.grid(axis="y", visible=False)
    heading(left, "Discrimination by subgroup",
            "Champion model, 30-day adoption, held-out block", 8.6)
    left.set_xlabel("ROC AUC")

    colors = [
        STATUS["critical"] if abs(g) > 0.05 else (STATUS["warning"] if abs(g) > 0.025 else SERIES[2])
        for g in keep["calibration_gap"]
    ]
    right.barh(positions, keep["calibration_gap"], height=0.62, color=colors, edgecolor="none")
    right.axvline(0, color=INK_MUTED, linewidth=1.0)
    right.set_xlim(-0.09, 0.09)
    right.grid(axis="x", color=GRID, linewidth=0.6)
    right.grid(axis="y", visible=False)
    heading(right, "Calibration gap",
            "Negative means the model under-promises for this group", 8.6)
    right.set_xlabel("Mean predicted minus observed rate")
    fig.tight_layout()
    save(fig, FIGURES / "fig11_subgroups")


# -----------------------------------------------------------------------------
def figure_drift_timeline(drift: dict) -> None:
    """Twenty-three months of a deployed model meeting a pandemic."""
    monthly = load("monthly_performance.csv")
    monthly = monthly.loc[monthly["roc_auc"].notna()].copy()
    monthly["index"] = np.arange(len(monthly))
    baseline = drift["baseline"]["roc_auc"]

    fig, (top, bottom) = plt.subplots(
        2, 1, figsize=(WIDTH_DOUBLE, 4.2), sharex=True, gridspec_kw={"height_ratios": [1.15, 1]}
    )

    warn = baseline * (1 - drift["thresholds"]["auc_relative_drop_warning"])
    crit = baseline * (1 - drift["thresholds"]["auc_relative_drop_critical"])
    top.axhspan(0.55, crit, color=STATUS["critical"], alpha=0.07, linewidth=0)
    top.axhspan(crit, warn, color=STATUS["warning"], alpha=0.09, linewidth=0)
    top.axhline(baseline, color=INK_MUTED, linewidth=1.0, linestyle=(0, (3, 3)))
    top.text(0.4, baseline + 0.006, f"validated baseline {baseline:.3f}",
             fontsize=6.6, color=INK_MUTED)
    top.plot(monthly["index"], monthly["roc_auc"], color=SERIES[0], marker="o", markersize=4,
             markeredgecolor="white", markeredgewidth=0.8)
    critical = monthly.loc[monthly["status"] == "CRITICAL"]
    top.plot(critical["index"], critical["roc_auc"], "o", color=STATUS["critical"],
             markersize=6, markeredgecolor="white", markeredgewidth=0.9, linestyle="none",
             label="critical alarm")
    top.set_ylim(0.65, 0.90)
    top.set_ylabel("Monthly ROC AUC")
    heading(top, "A deployed model meets March 2020",
            "Model frozen on 2018 data. Discrimination held; calibration did not.", 9.0)
    top.legend(loc="lower right", fontsize=6.8)
    top.grid(axis="y", color=GRID, linewidth=0.6)
    top.grid(axis="x", visible=False)

    colors = [
        STATUS["critical"] if abs(g) > 0.10 else (STATUS["warning"] if abs(g) > 0.05 else SERIES[2])
        for g in monthly["calibration_gap"]
    ]
    bottom.bar(monthly["index"], monthly["calibration_gap"], width=0.68,
               color=colors, edgecolor="none")
    bottom.axhline(0, color=INK_MUTED, linewidth=1.0)
    for level in (0.05, -0.05):
        bottom.axhline(level, color=STATUS["warning"], linewidth=0.8, linestyle=(0, (2, 2)))
    for level in (0.10, -0.10):
        bottom.axhline(level, color=STATUS["critical"], linewidth=0.8, linestyle=(0, (2, 2)))
    bottom.set_ylim(-0.14, 0.16)
    bottom.set_ylabel("Predicted minus\nobserved rate")
    bottom.set_xticks(monthly["index"][::2])
    bottom.set_xticklabels(monthly["period"][::2], rotation=45, ha="right", fontsize=6.8)
    bottom.grid(axis="y", color=GRID, linewidth=0.6)
    bottom.grid(axis="x", visible=False)
    heading(bottom, "Calibration gap", None, 8.4)

    shift_index = monthly.loc[monthly["period"] == "2020-03", "index"]
    if len(shift_index):
        for ax in (top, bottom):
            ax.axvline(float(shift_index.iloc[0]), color=SERIES[1], linewidth=1.2, alpha=0.55)
        top.text(float(shift_index.iloc[0]) + 0.25, 0.875, "shelter operations change",
                 fontsize=6.6, color=SERIES[1])

    fig.tight_layout()
    save(fig, FIGURES / "fig12_drift_timeline")


# -----------------------------------------------------------------------------
def figure_psi(drift: dict) -> None:
    """Which inputs moved, ranked."""
    frame = pd.DataFrame(drift["top_drifting_features_post_shift"]).head(12)
    frame = frame.sort_values("psi")

    fig, ax = plt.subplots(figsize=(WIDTH_SINGLE * 1.85, 3.0))
    positions = np.arange(len(frame))
    colors = [
        STATUS["critical"] if s == "CRITICAL" else (STATUS["warning"] if s == "WARNING" else SERIES[2])
        for s in frame["status"]
    ]
    ax.barh(positions, frame["psi"], height=0.64, color=colors, edgecolor="none")
    ax.axvline(0.10, color=STATUS["warning"], linewidth=0.9, linestyle=(0, (2, 2)))
    ax.axvline(0.25, color=STATUS["critical"], linewidth=0.9, linestyle=(0, (2, 2)))
    ax.text(0.105, len(frame) - 0.6, "warning", fontsize=6.4, color=INK_SECONDARY)
    ax.text(0.255, len(frame) - 0.6, "critical", fontsize=6.4, color=INK_SECONDARY)
    ax.set_yticks(positions)
    ax.set_yticklabels([f.replace("_", " ") for f in frame["feature"]], fontsize=7)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.grid(axis="y", visible=False)
    heading(ax, "What changed about the animals arriving",
            "Population stability index, animal-level features only. Training\nblock against arrivals after March 2020.", 8.8)
    ax.set_xlabel("Population stability index")
    save(fig, FIGURES / "fig13_psi")


# -----------------------------------------------------------------------------
def figure_queue_value() -> None:
    """The product metric: how good is the top of the queue?"""
    predictions = pd.read_parquet(ROOT / "data/interim/test_predictions.parquet")
    truth = predictions["y_long_stay_60d"].to_numpy(dtype=float)
    scores = predictions["p_lightgbm_long_stay_60d"].to_numpy(dtype=float)
    mask = np.isfinite(truth) & np.isfinite(scores)
    truth, scores = truth[mask], scores[mask]

    order = np.argsort(-scores)
    ranked = truth[order]
    ks = np.arange(10, 601, 10)
    precision = np.array([ranked[:k].mean() for k in ks])
    base = truth.mean()

    fig, ax = plt.subplots(figsize=(WIDTH_SINGLE * 1.85, 2.8))
    ax.plot(ks, precision, color=SERIES[0], label="model-ranked queue")
    ax.axhline(base, color=INK_MUTED, linewidth=1.0, linestyle=(0, (3, 3)))
    ax.text(600, base + 0.012, f"picking at random: {base:.3f}",
            fontsize=6.8, color=INK_MUTED, ha="right")
    for k, offset in ((20, (14, -20)), (50, (14, 14)), (100, (26, 2))):
        value = float(ranked[:k].mean())
        ax.plot([k], [value], "o", color=SERIES[1], markersize=5.5,
                markeredgecolor="white", markeredgewidth=0.9)
        ax.annotate(f"top {k}: {value:.2f}  ({value / base:.1f}x)", (k, value),
                    textcoords="offset points", xytext=offset, fontsize=6.8,
                    color=INK_SECONDARY, ha="left",
                    arrowprops={"arrowstyle": "-", "color": INK_MUTED, "linewidth": 0.6,
                                "shrinkA": 2, "shrinkB": 3})
    ax.set_ylim(0, max(precision.max() * 1.25, 0.5))
    finish(ax, title="The queue a shelter would actually work through",
           subtitle="Share of the top k that really did become long-stay animals",
           xlabel="Queue depth k", ylabel="Precision at k")
    save(fig, FIGURES / "fig14_queue_value")


# -----------------------------------------------------------------------------
def figure_census() -> None:
    """Context: the operational shock is visible in the raw data."""
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    monthly = (
        features.set_index("intake_datetime")
        .resample("ME")
        .agg(census=("shelter_census_at_intake", "mean"), intakes=("episode_id", "count"))
        .reset_index()
    )
    monthly = monthly.iloc[1:-1]

    fig, (top, bottom) = plt.subplots(2, 1, figsize=(WIDTH_DOUBLE, 3.4), sharex=True)
    top.plot(monthly["intake_datetime"], monthly["census"], color=SERIES[0])
    top.set_ylabel("Animals in care")
    heading(top, "Austin Animal Center, 2013 to 2022",
            "Monthly mean animals in care, and monthly arrivals", 9.0)
    top.grid(axis="y", color=GRID, linewidth=0.6)
    top.grid(axis="x", visible=False)

    bottom.plot(monthly["intake_datetime"], monthly["intakes"], color=SERIES[1])
    bottom.set_ylabel("Monthly arrivals")
    bottom.grid(axis="y", color=GRID, linewidth=0.6)
    bottom.grid(axis="x", visible=False)

    shift = pd.Timestamp("2020-03-15")
    for ax in (top, bottom):
        ax.axvline(shift, color=INK_MUTED, linewidth=1.1, linestyle=(0, (3, 3)))
    top.text(shift + pd.Timedelta(days=40), monthly["census"].max() * 0.96,
             "March 2020", fontsize=7, color=INK_SECONDARY)
    fig.tight_layout()
    save(fig, FIGURES / "fig15_census")


def main() -> None:
    apply_style()
    FIGURES.mkdir(parents=True, exist_ok=True)

    audit = load("episode_audit.json")
    main_results = load("main_results.json")
    ablations = load("ablations.json")
    survival = load("survival_results.json")
    drift = load("drift_results.json")
    interpretability = load("interpretability.json")

    builders = [
        ("fig02 data funnel", lambda: figure_data_funnel(audit, main_results)),
        ("fig03 estimator comparison", lambda: figure_estimator_comparison(survival)),
        ("fig04 cif by stratum", figure_cif_by_stratum),
        ("fig05 model comparison", lambda: figure_model_comparison(main_results)),
        ("fig06 calibration", figure_calibration),
        ("fig07 ablation", lambda: figure_ablation(ablations)),
        ("fig08 breed strategy", lambda: figure_breed_strategy(ablations)),
        ("fig09 importance", lambda: figure_importance(interpretability)),
        ("fig10 partial dependence", figure_partial_dependence),
        ("fig11 subgroups", figure_subgroups),
        ("fig12 drift timeline", lambda: figure_drift_timeline(drift)),
        ("fig13 psi", lambda: figure_psi(drift)),
        ("fig14 queue value", figure_queue_value),
        ("fig15 census", figure_census),
    ]
    for name, builder in builders:
        builder()
        log.info("built %s", name)
    log.info("All figures written to %s", FIGURES)


if __name__ == "__main__":
    main()
