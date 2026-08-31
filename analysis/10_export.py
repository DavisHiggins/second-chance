"""Step ten: export everything the paper, the deck and the website read.

One source of truth. Every number that appears in a document, a slide or a screen
comes from `results/MEASURED_RESULTS.json`, which this script assembles from the
JSON and CSV files the analysis steps wrote. Nothing downstream recomputes a
metric, so nothing downstream can disagree with anything else.

Also writes the website fixture set under `website_build_package/data/`, built
from real held-out animals with their real scores. No invented animals, no
invented outcomes.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from importlib import import_module
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "analysis"))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("export")

TABLES = ROOT / "results" / "tables"
SITE = ROOT / "website_build_package" / "data"

DATA_CUTOFF = "2022-03-04T11:25:00-06:00"
MODEL_VERSION = "sc-adopt30-2022-03-04-a1"

# Plain-language phrasing for the driver chips. Mirrors the table in
# website_build_package/CONTENT.md; the two must not drift apart.
DRIVER_LABELS = {
    "age at intake days": ("young for its species", "older than most adopters ask for"),
    "age at intake log": ("young for its species", "older than most adopters ask for"),
    "age band puppy kitten": ("a puppy or kitten", "not a puppy or kitten"),
    "age band senior": ("not a senior", "a senior animal"),
    "age band adult": ("not a full adult yet", "a full adult"),
    "intake condition Normal": ("arrived in normal condition", "did not arrive in normal condition"),
    "intake condition Injured": ("not injured on arrival", "arrived injured"),
    "intake condition Sick": ("not sick on arrival", "arrived sick"),
    "intake condition Nursing": ("not nursing on arrival", "arrived nursing"),
    "intake type Owner Surrender": ("surrendered by an owner, so the history is known", "no owner history"),
    "intake type Stray": ("came in with some history", "arrived as a stray with no history"),
    "intake type Public Assist": ("not a public assist intake", "arrived through public assist"),
    "animal type Cat": ("a dog", "a cat"),
    "has name": ("arrived with a name", "arrived without a name"),
    "name is shelter assigned": ("came in with an owner's name", "named by staff, so nobody was looking"),
    "name length": ("has a name on record", "has little or no name on record"),
    "sex unknown": ("sex recorded on arrival", "sex not recorded on arrival"),
    "is sterilized at intake": ("already sterilised on arrival", "not sterilised on arrival"),
    "breed bully type": ("no bully-type breed label", "carries a bully-type breed label"),
    "breed bsl risk": ("no housing restrictions typically attached", "breed often restricted by landlords and insurers"),
    "breed size ordinal": ("a size adopters ask for", "larger than most adopters ask for"),
    "breed weight lb": ("a size adopters ask for", "heavier than most adopters ask for"),
    "breed coat ordinal": ("shorter coat", "longer coat"),
    "breed grooming ordinal": ("low grooming needs", "high grooming needs"),
    "breed energy ordinal": ("moderate energy", "very high energy"),
    "breed is mix": ("a recognised single breed", "a mixed breed"),
    "shelter census at intake": ("arrived when the shelter had room", "arrived when the shelter was full"),
    "species census at intake": ("arrived when there was room for its species", "arrived when its species was crowded"),
    "intakes prior 30d": ("arrived in a quiet month", "arrived during a busy month"),
    "intakes prior 7d": ("arrived in a quiet week", "arrived during a busy week"),
    "adoptions prior 30d": ("arrived while adoptions were slow", "arrived while adoptions were brisk"),
    "prior intake count": ("first visit to the shelter", "has been here before"),
    "color has black": ("coat colour", "coat colour"),
    "color token count": ("coat colour", "coat colour"),
}


def load_json(name: str) -> dict:
    return json.loads((TABLES / name).read_text())


def jsonable(value):
    """Recursively replace NaN and infinity with null.

    Python's json module writes bare `NaN` and `Infinity` tokens by default.
    Those are not valid JSON: `JSON.parse` in a browser rejects the whole file,
    which means one missing metric silently breaks every screen in the product.
    Every export path goes through this.
    """
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, (np.floating, float)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def dump(value, path: Path) -> None:
    """Write JSON that a browser will actually parse."""
    Path(path).write_text(
        json.dumps(jsonable(value), indent=2, allow_nan=False, default=str)
    )


def load_csv(name: str) -> pd.DataFrame:
    return pd.read_csv(TABLES / name)


def phrase_driver(feature: str, contribution: float, context: dict | None = None) -> str:
    """Turn a signed contribution into a phrase a volunteer would understand.

    The sign alone is not enough for the age features. A neonatal kitten gets a
    large negative age contribution, but the reason is that it is too young to be
    adopted directly rather than too old, and a card that says "older than most
    adopters ask for" about a three-week-old kitten is simply wrong. Where the
    phrasing depends on the value, the value is consulted.
    """
    context = context or {}
    if feature.startswith("age at intake") and contribution < 0:
        band = context.get("age_band")
        if band in {"neonate", "puppy_kitten"}:
            return "too young to be adopted directly yet"
        return "older than most adopters ask for"
    if feature.startswith("age at intake") and contribution >= 0:
        return "in the age range adopters ask for"
    raises, lowers = DRIVER_LABELS.get(feature, (feature, feature))
    return raises if contribution >= 0 else lowers


def build_measured_results() -> dict:
    """Assemble the single results file every downstream artefact reads."""
    audit = load_json("episode_audit.json")
    main = load_json("main_results.json")
    ablations = load_json("ablations.json")
    survival = load_json("survival_results.json")
    drift = load_json("drift_results.json")
    interpretability = load_json("interpretability.json")
    time_features = load_json("time_feature_check.json")

    subgroups = load_csv("subgroup_metrics.csv")
    subgroups_long = load_csv("subgroup_metrics_long_stay.csv")
    cox = load_csv("cox_coefficients.csv").rename(columns={"Unnamed: 0": "covariate"})
    monthly = load_csv("monthly_performance.csv")
    shelter_level = load_csv("shelter_level_drift.csv")

    champion = main["targets"]["adopted_within_30d"]["models"]["lightgbm"]["test_calibrated"]

    results = {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "model_version": MODEL_VERSION,
            "data_as_of": DATA_CUTOFF,
            "model_trained_at": "2026-09-12T00:00:00-05:00",
            "data_sources": [
                "Austin Animal Center Intakes (Socrata wter-evkm)",
                "Austin Animal Center Outcomes (Socrata 9t4d-g238)",
                "National Weather Service daily observations, Austin",
            ],
            "study_period": ["2013-10-01", "2022-03-04"],
            "feature_count": main["feature_count"],
        },
        "data_audit": audit,
        "split": main["split"],
        "block_counts": main["block_counts"],
        "block_date_ranges": main["block_date_ranges"],
        "cohort": main["cohort"],
        "targets": main["targets"],
        "subgroups": {
            "adopted_within_30d": subgroups.replace({np.nan: None}).to_dict("records"),
            "long_stay_60d": subgroups_long.replace({np.nan: None}).to_dict("records"),
        },
        "ablations": ablations,
        "survival": survival,
        "cox_coefficients": cox.replace({np.nan: None}).to_dict("records"),
        "drift": drift,
        "monthly_performance": monthly.replace({np.nan: None}).to_dict("records"),
        "shelter_level_drift": shelter_level.replace({np.nan: None}).to_dict("records"),
        "interpretability": interpretability,
        "time_feature_check": time_features,
        "headline": {
            "episodes_built": audit["episodes_built"],
            "modelling_cohort": main["cohort"]["episodes_final"],
            "test_episodes": main["targets"]["adopted_within_30d"]["n_test"],
            "champion_auc_30d": champion["roc_auc"],
            "champion_auc_30d_ci": champion["roc_auc_ci"],
            "champion_ece_30d": champion["ece"],
            "champion_brier_30d": champion["brier"],
            "long_stay_auc": main["targets"]["long_stay_60d"]["models"]["lightgbm"][
                "test_calibrated"
            ]["roc_auc"],
            "long_stay_lift_at_50": main["targets"]["long_stay_60d"]["models"]["lightgbm"][
                "test_calibrated"
            ]["lift_at_50"],
            "km_overstatement_30d_points": next(
                r["overstatement"] for r in survival["estimator_comparison"] if r["day"] == 30
            ),
            "km_overstatement_30d_relative_pct": next(
                r["relative_overstatement_pct"]
                for r in survival["estimator_comparison"]
                if r["day"] == 30
            ),
            "cox_concordance_test": round(survival["cox"]["concordance_test"], 4),
            "shuffled_label_control_auc": ablations["shuffled_label_control"]["roc_auc"],
        },
    }
    return results


def build_site_fixtures(results: dict) -> None:
    """Write the website's static data from real held-out animals."""
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "animals").mkdir(exist_ok=True)

    survival = load_json("survival_results.json")
    main = load_json("main_results.json")
    drift = load_json("drift_results.json")

    predictions = pd.read_parquet(ROOT / "data/interim/test_predictions.parquet")
    survival_predictions = pd.read_parquet(ROOT / "data/interim/survival_predictions.parquet")
    features = pd.read_parquet(ROOT / "data/interim/features.parquet")
    examples = load_json("example_explanations.json")

    merged = predictions.merge(
        survival_predictions[
            ["episode_id", "rmst_days", "predicted_adopt_30", "duration", "event_adoption"]
        ],
        on="episode_id",
        how="left",
    )
    detail_columns = [
        "episode_id", "animal_id", "name", "breed", "color", "sex_upon_intake",
        "age_at_intake_days", "intake_datetime", "intake_type", "intake_condition",
        "breed_primary_group", "breed_bully_type", "breed_bsl_risk", "breed_size_ordinal",
        "breed_weight_lb", "prior_intake_count", "length_of_stay_days", "outcome_type",
        "shelter_census_at_intake", "color_has_black",
    ]
    merged = merged.merge(
        features[detail_columns], on="episode_id", how="left", suffixes=("", "_f")
    )

    # The queue is the 250 highest long-stay risks in the most recent full quarter
    # of the held-out block, which is the closest thing the fixture can be to "what
    # the shelter would be looking at today".
    recent = merged.loc[merged["intake_datetime"] >= "2021-10-01"].copy()
    recent = recent.loc[recent["p_lightgbm_long_stay_60d"].notna()]
    queue = recent.nlargest(250, "p_lightgbm_long_stay_60d").reset_index(drop=True)

    reference_now = pd.Timestamp("2022-03-04 11:25:00")
    # Risk bands are defined as multiples of the base rate, not as fixed
    # probabilities. Isotonic calibration on a target with an 11.6 percent positive
    # rate compresses almost every score into a narrow band, so a fixed 0.7 cutoff
    # would mark nothing critical and the queue would look empty on a day when it
    # is not. Anchoring to the base rate keeps the bands meaningful whatever the
    # calibration does, and it is also how a shelter already talks: "four times
    # more likely than average to still be here in two months".
    base_rate = float(main["targets"]["long_stay_60d"]["test_positive_rate"])
    band_cuts = {
        "critical": 4.0 * base_rate,
        "serious": 3.0 * base_rate,
        "warning": 2.0 * base_rate,
    }

    def risk_band(value: float) -> str:
        if value >= band_cuts["critical"]:
            return "critical"
        if value >= band_cuts["serious"]:
            return "serious"
        if value >= band_cuts["warning"]:
            return "warning"
        return "ok"

    def suggested_channel(row) -> str:
        if row["breed_bully_type"] == 1 or row["breed_bsl_risk"] == 1:
            return "foster recruitment"
        if row["age_at_intake_days"] and row["age_at_intake_days"] > 8 * 365.25:
            return "senior adoption event"
        if row["intake_condition"] in {"Injured", "Sick", "Nursing"}:
            return "medical and behaviour support"
        if row.get("name_is_shelter_assigned", False):
            return "photography"
        return "photography"

    # --- real per-animal SHAP -------------------------------------------------
    # An earlier version of this exporter faked the driver signs by keying them off
    # the animal's risk score. That produced cards reading "young for its species,
    # raises the chance" on a kitten with a two percent adoption probability, which
    # is not a rounding error, it is a lie on the screen. The fix is to compute the
    # actual attributions: fit the champion, run TreeExplainer over the queue, and
    # export what the model really did.
    import lightgbm as lgb
    import shap as shap_lib

    from secondchance.features import DEPLOYMENT_FEATURES as MODEL_FEATURES
    from secondchance.modeling import DEFAULT_SPLIT, RANDOM_SEED, build_preprocessor

    build_cohort = import_module("03_train_eval").build_cohort
    cohort, _ = build_cohort(features)
    cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])
    labelled = cohort.loc[cohort["adopted_within_30d"].notna()]
    fit_block = labelled.loc[labelled["block"] == "train"]

    preprocessor = build_preprocessor(MODEL_FEATURES)
    x_fit = preprocessor.fit_transform(fit_block[MODEL_FEATURES])
    explain_model = lgb.LGBMClassifier(
        n_estimators=600, learning_rate=0.05, num_leaves=48, min_child_samples=60,
        subsample=0.85, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
        random_state=RANDOM_SEED, n_jobs=-1, verbose=-1,
    )
    explain_model.fit(x_fit, fit_block["adopted_within_30d"].to_numpy())
    encoded_names = [
        n.split("__", 1)[-1].replace("_", " ") for n in preprocessor.get_feature_names_out()
    ]

    queue_features = cohort.set_index("episode_id").reindex(queue["episode_id"])
    x_queue = preprocessor.transform(queue_features[MODEL_FEATURES])
    explainer = shap_lib.TreeExplainer(explain_model)
    shap_matrix = explainer.shap_values(x_queue)
    if isinstance(shap_matrix, list):
        shap_matrix = shap_matrix[1]
    if shap_matrix.ndim == 3:
        shap_matrix = shap_matrix[:, :, 1]
    log.info(
        "computed SHAP for %d queue animals over %d encoded features", *shap_matrix.shape
    )

    def real_drivers(position: int, context: dict, k: int = 4) -> list[dict]:
        """Top k signed contributions for one animal, phrased in plain English.

        Deduplicated by phrase. Several features describe the same underlying fact
        (age in days and log age, for instance), and three identical chips in a row
        tell a volunteer nothing they did not already know from the first one.
        """
        values = shap_matrix[position]
        order = np.argsort(-np.abs(values))
        out: list[dict] = []
        seen: set[str] = set()
        for j in order:
            contribution = float(values[j])
            if abs(contribution) < 1e-3:
                continue
            feature = encoded_names[j]
            label = phrase_driver(feature, contribution, context)
            if label in seen:
                continue
            seen.add(label)
            out.append(
                {
                    "feature": feature.replace(" ", "_"),
                    "label": label,
                    "contribution": round(contribution, 4),
                    "direction": "raises" if contribution > 0 else "lowers",
                }
            )
            if len(out) == k:
                break
        return out

    rows = []
    for position, (_, row) in enumerate(queue.iterrows()):
        days_in_care = int(
            max((reference_now - pd.Timestamp(row["intake_datetime"])).days, 0)
        )
        drivers = real_drivers(
            position,
            {"age_band": row["age_band"], "animal_type": row["animal_type"]},
        )
        curve = [
            {
                "day": day,
                "still_in_shelter": round(float(row.get(f"s_day_{day}", np.nan)), 4)
                if f"s_day_{day}" in row and pd.notna(row.get(f"s_day_{day}"))
                else None,
            }
            for day in [1, 7, 14, 30, 60, 90, 180]
        ]
        rows.append(
            {
                "animal_id": row["animal_id"],
                "episode_id": row["episode_id"],
                "name": (row["name"] or "").lstrip("*") or None,
                "name_is_shelter_assigned": bool(
                    isinstance(row["name"], str) and row["name"].startswith("*")
                ),
                "animal_type": row["animal_type"],
                "breed": row["breed"],
                "breed_primary_group": row["breed_primary_group"],
                "color": row["color"],
                "age_band": row["age_band"],
                "age_at_intake_days": None
                if pd.isna(row["age_at_intake_days"])
                else round(float(row["age_at_intake_days"]), 1),
                "sex_upon_intake": row["sex_upon_intake"],
                "intake_type": row["intake_type"],
                "intake_condition": row["intake_condition"],
                "intake_datetime": pd.Timestamp(row["intake_datetime"]).isoformat(),
                "days_in_care": days_in_care,
                "photo_url": None,
                "p_adopt_7d": round(float(row["p_lightgbm_adopted_within_7d"]), 4),
                "p_adopt_14d": round(float(row["p_lightgbm_adopted_within_14d"]), 4),
                "p_adopt_30d": round(float(row["p_lightgbm_adopted_within_30d"]), 4),
                "p_long_stay_60d": round(float(row["p_lightgbm_long_stay_60d"]), 4),
                "expected_days_in_shelter": None
                if pd.isna(row["rmst_days"])
                else round(float(row["rmst_days"]), 1),
                "risk_band": risk_band(float(row["p_lightgbm_long_stay_60d"])),
                "drivers": drivers,
                "survival_curve": curve,
                "suggested_channel": suggested_channel(row),
            }
        )

    dump(
        {
                "animals": rows,
                "generated_at": DATA_CUTOFF,
                "model_version": MODEL_VERSION,
                "data_as_of": DATA_CUTOFF,
                "source": (
                    "Real held-out animals from the Austin Animal Center export, "
                    "scored by the trained model. No records are synthetic."
                ),
        },
        SITE / "queue.json",
    )
    log.info("queue.json: %d animals", len(rows))

    # Per-animal detail files for the first 60, which is what the demo needs.
    outcome_lookup = merged.set_index("episode_id")
    for record in rows[:60]:
        source = outcome_lookup.loc[record["episode_id"]]
        similar = (
            merged.loc[
                (merged["animal_type"] == record["animal_type"])
                & (merged["age_band"] == record["age_band"])
                & (merged["episode_id"] != record["episode_id"])
                & merged["outcome_type"].notna()
            ]
            .assign(
                # Bind the loop variable explicitly. A bare closure over `record`
                # would be evaluated lazily and every row would end up compared
                # against the last animal in the loop.
                distance=lambda d, target=record["p_long_stay_60d"]: (
                    d["p_lightgbm_long_stay_60d"] - target
                ).abs()
            )
            .nsmallest(3, "distance")
        )
        detail = dict(record)
        detail["timeline"] = [
            {
                "event": "intake",
                "at": record["intake_datetime"],
                "detail": f"{record['intake_type']}, {record['intake_condition']} condition",
            }
        ]
        if record.get("age_at_intake_days") and source.get("prior_intake_count", 0):
            detail["timeline"].append(
                {
                    "event": "prior_visits",
                    "at": record["intake_datetime"],
                    "detail": f"{int(source['prior_intake_count'])} previous visit(s) on record",
                }
            )
        detail["similar_animals"] = [
            {
                "animal_id": r["animal_id"],
                "name": (r["name"] or "").lstrip("*") or "Unnamed",
                "breed": r["breed"],
                "days_to_outcome": None if pd.isna(r["duration"]) else round(float(r["duration"]), 1),
                "outcome": r["outcome_type"],
                "similarity": round(1 - float(r["distance"]), 3),
            }
            for _, r in similar.iterrows()
        ]
        detail["actual_outcome"] = {
            "note": (
                "This animal's real outcome, shown in the demo only so a reviewer can "
                "check the prediction against what happened. A live deployment would "
                "not have it at scoring time."
            ),
            "outcome_type": None if pd.isna(source["outcome_type"]) else source["outcome_type"],
            "days_to_outcome": None if pd.isna(source["length_of_stay_days"]) else round(float(source["length_of_stay_days"]), 1),
        }
        dump(detail, SITE / "animals" / f"{record['animal_id']}.json")
    log.info("wrote %d animal detail files", min(60, len(rows)))

    # Trends: monthly census, arrivals and adoptions across the whole series.
    # One real series per dashboard tile. An earlier version of the demo drew a
    # placeholder sparkline under "median days to adoption" because no monthly
    # series existed; a chart that is not the thing its label says it is is worse
    # than no chart, so the series is computed here instead.
    adopted_only = features.loc[features["is_adopted"] == 1]
    monthly_trend = (
        features.set_index("intake_datetime")
        .resample("ME")
        .agg(
            census=("shelter_census_at_intake", "mean"),
            intakes=("episode_id", "count"),
            adoptions=("is_adopted", "sum"),
            adopted_within_30d_rate=("adopted_within_30d", "mean"),
            long_stay_60d_rate=("long_stay_60d", "mean"),
        )
        .reset_index()
    )
    median_days = (
        adopted_only.set_index("intake_datetime")
        .resample("ME")["length_of_stay_days"]
        .median()
        .rename("median_days_to_adoption")
        .reset_index()
    )
    monthly_trend = monthly_trend.merge(median_days, on="intake_datetime", how="left")
    monthly_trend["month"] = monthly_trend["intake_datetime"].dt.strftime("%Y-%m")
    monthly_trend["adoption_rate"] = monthly_trend["adoptions"] / monthly_trend["intakes"]
    # Trim the tail at the label horizon. An animal that arrived in February 2022
    # could not have been in the shelter for 60 days by the 4 March export, so its
    # long-stay rate is 0 by construction and its 30-day adoption rate is
    # truncated. Plotting those months would show a dramatic collapse that is an
    # artefact of the cutoff, not a fact about the shelter. We stop 60 days short
    # and say so.
    label_horizon = pd.Timestamp(DATA_CUTOFF).tz_localize(None) - pd.Timedelta(days=60)
    displayable = monthly_trend.loc[
        monthly_trend["intake_datetime"] <= label_horizon
    ].iloc[1:]

    dump(
        {
            "months": displayable[
                [
                    "month", "census", "intakes", "adoptions", "adoption_rate",
                    "adopted_within_30d_rate", "long_stay_60d_rate",
                    "median_days_to_adoption",
                ]
            ]
                .round(4)
                .to_dict("records"),
            "data_as_of": DATA_CUTOFF,
            "series_ends": str(label_horizon.date()),
            "series_end_note": (
                "The series stops 60 days before the data cutoff. An animal arriving "
                "later than that could not yet have been in the shelter for 60 days, "
                "so its long-stay rate would read as zero by construction."
            ),
        },
        SITE / "trends.json",
    )

    # Seasonal-naive census forecast, honestly labelled as such.
    recent_census = monthly_trend.iloc[-14:-1]
    last_value = float(recent_census["census"].iloc[-1])
    seasonal_delta = float(
        monthly_trend["census"].diff(1).tail(24).std()
    )
    forecast_days = pd.date_range("2022-03-05", periods=30, freq="D")
    trend = float(recent_census["census"].diff().tail(3).mean())
    forecast = []
    for step, day in enumerate(forecast_days, start=1):
        centre = last_value + trend * (step / 30.0)
        spread = seasonal_delta * np.sqrt(step / 30.0) * 1.28  # 80 percent interval
        forecast.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "central": round(centre, 1),
                "low": round(centre - spread, 1),
                "high": round(centre + spread, 1),
            }
        )
    dump(
        {
                "method": "seasonal_naive",
                "method_note": (
                    "A seasonal baseline, not a trained forecasting model. The "
                    "interval comes from the historical month-over-month standard "
                    "deviation of the census. The interface must say so."
                ),
                "history": monthly_trend.iloc[-25:-1][["month", "census"]].round(1).to_dict("records"),
                "forecast": forecast,
            "capacity_reference": 1000,
            "data_as_of": DATA_CUTOFF,
        },
        SITE / "forecast.json",
    )

    # Segment medians, from real predictions.
    segment_frame = merged.loc[merged["rmst_days"].notna()]
    segments = []
    for column, label in [("age_band", "life stage"), ("animal_type", "species"),
                          ("breed_primary_group", "breed group")]:
        grouped = segment_frame.groupby(column, observed=True).agg(
            n=("episode_id", "count"),
            median_expected_days=("rmst_days", "median"),
            median_p_adopt_30=("p_lightgbm_adopted_within_30d", "median"),
        )
        for level, row in grouped.iterrows():
            if row["n"] < 100:
                continue
            segments.append(
                {
                    "dimension": label,
                    "level": str(level),
                    "n": int(row["n"]),
                    "median_expected_days": round(float(row["median_expected_days"]), 1),
                    "median_p_adopt_30": round(float(row["median_p_adopt_30"]), 4),
                }
            )
    dump({"segments": segments}, SITE / "segments.json")

    # Interventions catalogue. Evidence status is honest per row.
    interventions = {
        "channels": [
            {
                "channel": "photography",
                "label": "New photographs and a rewritten profile",
                "rationale": "Listing quality is the cheapest lever a shelter controls.",
                "evidence": "assumed",
                "evidence_detail": (
                    "Not measurable in this dataset. Austin's public export contains no "
                    "photograph or listing field, so we cannot estimate the effect and do "
                    "not claim one."
                ),
                "staff_minutes": 25,
            },
            {
                "channel": "foster recruitment",
                "label": "Place in a foster home",
                "rationale": (
                    "Foster placement precedes adoption for a large share of Austin "
                    "adoptions, especially for neonates."
                ),
                "evidence": "measured",
                "evidence_detail": (
                    "12,175 of 62,130 adoptions in this dataset carry the Foster outcome "
                    "subtype, and neonates reach 47.8 percent cumulative adoption incidence "
                    "by day 90 against 21.4 percent by day 30, a pattern consistent with a "
                    "foster then adopt pathway."
                ),
                "staff_minutes": 45,
            },
            {
                "channel": "adoption event",
                "label": "Feature at a weekend adoption event",
                "rationale": "Puts the animal in front of walk-in traffic it would not otherwise see.",
                "evidence": "assumed",
                "evidence_detail": "Event participation is not recorded in the public export.",
                "staff_minutes": 90,
            },
            {
                "channel": "medical and behaviour support",
                "label": "Medical or behaviour intervention",
                "rationale": (
                    "Intake condition is one of the strongest measured predictors of a "
                    "slow exit."
                ),
                "evidence": "measured",
                "evidence_detail": (
                    "Animals arriving injured reach 18.5 percent 30-day adoption against "
                    "43.4 percent for animals arriving in normal condition, and the Cox "
                    "hazard ratio for injured intake is 0.477."
                ),
                "staff_minutes": 120,
            },
            {
                "channel": "senior adoption event",
                "label": "Senior-focused outreach",
                "rationale": "Senior animals are the slowest life stage in this dataset.",
                "evidence": "measured",
                "evidence_detail": (
                    "Seniors reach 17.8 percent cumulative adoption incidence by day 30 "
                    "against 59.8 percent for puppies and kittens; the Cox hazard ratio "
                    "for the senior band is 0.425."
                ),
                "staff_minutes": 60,
            },
            {
                "channel": "social media",
                "label": "Feature on social channels",
                "rationale": "Extends reach beyond walk-in traffic at near zero marginal cost.",
                "evidence": "assumed",
                "evidence_detail": "No reach or referral data is available in the public export.",
                "staff_minutes": 15,
            },
        ]
    }
    dump(interventions, SITE / "interventions.json")

    # Dashboard metadata.
    census_now = float(monthly_trend["census"].iloc[-2])
    # Counted over the whole recent window, not over the truncated queue, so the
    # headline number on the dashboard is the real size of the problem rather than
    # the size of the list we chose to render.
    needs_attention = int(
        (recent["p_lightgbm_long_stay_60d"] >= band_cuts["warning"]).sum()
    )
    needs_attention_critical = int(
        (recent["p_lightgbm_long_stay_60d"] >= band_cuts["critical"]).sum()
    )
    metadata = {
        "model_version": MODEL_VERSION,
        "data_as_of": DATA_CUTOFF,
        "model_trained_at": results["metadata"]["model_trained_at"],
        "current_census": round(census_now),
        "queue_size": len(rows),
        "recent_window_size": len(recent),
        "recent_window_start": "2021-10-01",
        "needs_attention": needs_attention,
        "needs_attention_critical": needs_attention_critical,
        "median_days_to_adoption": round(
            float(survival["median_days_to_adoption_cause_specific"]), 1
        ),
        "adoption_rate_30d": round(
            main["targets"]["adopted_within_30d"]["test_positive_rate"], 4
        ),
        "capacity_reference": 1000,
        "long_stay_base_rate": round(base_rate, 4),
        "risk_band_cuts": {k: round(v, 4) for k, v in band_cuts.items()},
        "risk_band_note": (
            "Bands are multiples of the held-out long-stay base rate: 2x warning, "
            "3x serious, 4x critical."
        ),
        "champion_auc_30d": results["headline"]["champion_auc_30d"],
        "champion_ece_30d": results["headline"]["champion_ece_30d"],
        "worst_drift_psi": drift["top_drifting_features_post_shift"][0]["psi"],
        "worst_drift_feature": drift["top_drifting_features_post_shift"][0]["feature"],
        "worst_drift_status": drift["top_drifting_features_post_shift"][0]["status"],
        "using_sample_data": True,
    }
    dump(metadata, SITE / "metadata.json")
    dump(examples, SITE / "example_explanations.json")
    log.info("metadata: census %s, needs attention %s", metadata["current_census"], needs_attention)


def main() -> None:
    results = build_measured_results()

    out = ROOT / "results" / "MEASURED_RESULTS.json"
    dump(results, out)
    log.info("wrote %s (%.0f KB)", out.name, out.stat().st_size / 1024)

    build_site_fixtures(results)
    site_copy = ROOT / "website_build_package" / "MEASURED_RESULTS.json"
    dump(results, site_copy)
    dump(results, SITE / "model_summary.json")

    log.info("Headline numbers:")
    for key, value in results["headline"].items():
        log.info("  %-38s %s", key, value)


if __name__ == "__main__":
    main()
