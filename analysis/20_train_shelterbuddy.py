"""Train and export a scoring model for the current ShelterBuddy feeds.

Austin replaced its shelter system in May 2025. The model documented in
``docs/01_MODEL_CARD.md`` was trained on the legacy schema, on episodes ending
in March 2022, and it cannot be applied to the new feed: the field names, the
category vocabularies, the operating period and the shelter itself all moved.
No serialised artefact of it survives in this repository either.

So this script trains a new one, on the source system that is actually live,
and exports it in a form the web application can evaluate without any
inference infrastructure: a JSON tree dump plus the isotonic calibration
fitted on a held-out validation block. ``web/src/lib/model/evaluator.ts`` walks
that dump directly, so there is no Python at request time and the model that
ships is a file a reviewer can read.

Two disciplines carried over from the original pipeline, because they are what
made it trustworthy:

* Labels are NaN when they are not yet observable, never 0. An animal who
  arrived a week ago has not "failed" to be adopted within 30 days.
* The split is temporal, never random. A model evaluated on its own era tells
  you nothing about what happens when the world moves.

Run it with the repository virtual environment::

    .venv/Scripts/python.exe analysis/20_train_shelterbuddy.py
"""

from __future__ import annotations

import bisect
import json
import math
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier, early_stopping
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_PATH = REPO_ROOT / "web" / "src" / "data" / "model" / "model.json"
GOLDEN_PATH = REPO_ROOT / "web" / "tests" / "fixtures" / "model-golden.json"

SOCRATA_DOMAIN = "data.austintexas.gov"
CURRENT_INTAKES_ID = "pyqf-r2dc"
CURRENT_OUTCOMES_ID = "gsvs-ypi7"
SHELTERBUDDY_CUTOVER = datetime(2025, 5, 5)

RANDOM_SEED = 20260902
TRANSFORM_VERSION = "sb-features-1"
SCHEMA_VERSION = 1

# Kept in step with web/src/lib/austin/build-episodes.ts.
TOLERANCE_HOURS = 36

INTAKE_COLUMNS = [
    "id",
    "animal_id",
    "source_date",
    "type",
    "source_name",
    "sex",
    "ispreviouslyspayedneutered",
    "primary_breed",
    "primary_color",
    "secondary_color",
    "intake_health_condition",
    "date_of_birth",
    "name_at_intake",
    "timestamp",
]

OUTCOME_COLUMNS = [
    "id",
    "animal_id",
    "intake_date",
    "outcome_date",
    "outcome_status",
    "type",
    "name",
    "days_in_shelter",
    "timestamp",
]

# How many levels of each categorical column become indicator features. Long
# tails are folded into "other" rather than given a column of their own, which
# keeps the exported tree small and stops a breed seen twice from being
# treated as a signal.
TOP_LEVELS = {
    "intakeReason": 12,
    "condition": 10,
    "breed": 25,
    "sex": 5,
    "rawType": 6,
}


# --------------------------------------------------------------------------- #
# Source access
# --------------------------------------------------------------------------- #


def fetch_dataset(dataset_id: str, columns: list[str]) -> list[dict[str, Any]]:
    """Page a Socrata dataset in full, ordered stably so nothing is missed."""
    rows: list[dict[str, Any]] = []
    page_size = 50_000
    offset = 0

    while True:
        query = urllib.parse.urlencode(
            {
                "$select": ",".join(columns),
                "$order": "id",
                "$limit": page_size,
                "$offset": offset,
            }
        )
        url = f"https://{SOCRATA_DOMAIN}/resource/{dataset_id}.json?{query}"
        request = urllib.request.Request(url, headers={"Accept": "application/json"})

        with urllib.request.urlopen(request, timeout=180) as response:
            page = json.loads(response.read().decode("utf-8"))

        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    return rows


def parse_ts(value: Any) -> datetime | None:
    """Parse a Socrata floating timestamp, keeping the clock reading as-is.

    These are Austin local times published without a zone. Attaching UTC would
    shift every reading by five or six hours and move some intakes onto a
    different day, so they are parsed naive and only compared with each other.
    """
    if value is None or not isinstance(value, str) or not value:
        return None
    text = value.replace(" ", "T")
    if text.endswith("Z"):
        text = text[:-1]
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# Episode construction, mirroring build-episodes.ts
# --------------------------------------------------------------------------- #


@dataclass
class Episode:
    episode_id: str
    animal_id: str
    intake_at: datetime
    species: str
    raw_type: str | None
    sex: str | None
    altered_at_intake: bool | None
    breed: str | None
    color: str | None
    intake_reason: str | None
    condition: str | None
    age_at_intake_days: float | None
    outcome_at: datetime | None
    outcome_type: str | None
    closed_days_in_care: float | None
    join_status: str


SPECIES_BY_RAW_TYPE = {
    "cat": "Cat",
    "kitten": "Cat",
    "dog": "Dog",
    "puppy": "Dog",
}


def normalize_species(raw_type: Any) -> str:
    if not raw_type or not isinstance(raw_type, str):
        return "Other"
    return SPECIES_BY_RAW_TYPE.get(raw_type.strip().lower(), "Other")


def is_adoption(outcome_type: Any) -> bool:
    if not outcome_type or not isinstance(outcome_type, str):
        return False
    value = outcome_type.strip().lower()
    return value.startswith("adopted") or value in {"adoption", "rto-adopt"}


def build_episodes(
    intakes: list[dict[str, Any]], outcomes: list[dict[str, Any]]
) -> tuple[list[Episode], dict[str, int]]:
    """Join intakes to the outcomes that name them.

    Every outcome row in this feed carries ``intake_date``, and it matches the
    ``source_date`` of the intake it closes for the same animal, so the join is
    a key lookup rather than a guess. That is what makes repeat visitors safe:
    an animal with three stays has three episodes, and an outcome can never
    close the wrong one.
    """
    outcomes_by_key: dict[tuple[str, datetime], list[dict[str, Any]]] = {}
    outcomes_by_animal: dict[str, list[dict[str, Any]]] = {}

    for row in outcomes:
        row["_used"] = False
        row["_outcome_at"] = parse_ts(row.get("outcome_date"))
        row["_claimed_intake"] = parse_ts(row.get("intake_date"))

        if row["_claimed_intake"] is not None:
            key = (row["animal_id"], row["_claimed_intake"])
            outcomes_by_key.setdefault(key, []).append(row)
        outcomes_by_animal.setdefault(row["animal_id"], []).append(row)

    ordered = sorted(intakes, key=lambda r: parse_ts(r.get("source_date")) or datetime.min)

    episodes: list[Episode] = []
    seen_keys: set[tuple[str, datetime]] = set()
    counts = {"duplicate_intake_keys": 0, "tolerance_matched": 0, "orphan_outcomes": 0}

    for row in ordered:
        intake_at = parse_ts(row.get("source_date"))
        if intake_at is None:
            continue

        key = (row["animal_id"], intake_at)
        if key in seen_keys:
            counts["duplicate_intake_keys"] += 1
            continue
        seen_keys.add(key)

        match = next((o for o in outcomes_by_key.get(key, []) if not o["_used"]), None)
        join_status = "matched" if match else "open"

        if match is None:
            candidates = [
                o
                for o in outcomes_by_animal.get(row["animal_id"], [])
                if not o["_used"]
                and o["_outcome_at"] is not None
                and o["_outcome_at"] >= intake_at
                and o["_claimed_intake"] is not None
                and abs((o["_claimed_intake"] - intake_at).total_seconds())
                <= TOLERANCE_HOURS * 3600
            ]
            if candidates:
                candidates.sort(key=lambda o: o["_outcome_at"])
                match = candidates[0]
                join_status = "ambiguous"
                counts["tolerance_matched"] += 1

        if match is not None:
            match["_used"] = True

        outcome_at = match["_outcome_at"] if match else None
        closed_days = None
        if outcome_at is not None:
            delta = (outcome_at - intake_at).total_seconds() / 86_400
            closed_days = delta if delta >= 0 else None

        dob = parse_ts(row.get("date_of_birth"))
        age_days = None
        if dob is not None:
            raw_age = (intake_at - dob).total_seconds() / 86_400
            age_days = math.floor(raw_age) if raw_age >= 0 else None

        primary = row.get("primary_color")
        secondary = row.get("secondary_color")
        color = "/".join([c for c in (primary, secondary) if c]) or None

        altered = row.get("ispreviouslyspayedneutered")
        if isinstance(altered, str):
            altered = altered.lower() == "true"

        episodes.append(
            Episode(
                episode_id=f"sb:{row['animal_id']}:{row['source_date']}",
                animal_id=row["animal_id"],
                intake_at=intake_at,
                species=normalize_species(row.get("type")),
                raw_type=row.get("type"),
                sex=row.get("sex"),
                altered_at_intake=altered if isinstance(altered, bool) else None,
                breed=row.get("primary_breed"),
                color=color,
                intake_reason=row.get("source_name"),
                condition=row.get("intake_health_condition"),
                age_at_intake_days=age_days,
                outcome_at=outcome_at,
                outcome_type=match.get("outcome_status") if match else None,
                closed_days_in_care=closed_days,
                join_status=join_status,
            )
        )

    counts["orphan_outcomes"] = sum(
        1 for bucket in outcomes_by_animal.values() for o in bucket if not o["_used"]
    )
    return episodes, counts


# --------------------------------------------------------------------------- #
# Feature derivation, mirroring features.ts
# --------------------------------------------------------------------------- #


def clean_category(value: Any) -> str:
    if value is None or not isinstance(value, str) or not value.strip():
        return "__missing__"
    return value.strip()


def derive_rows(episodes: list[Episode]) -> pd.DataFrame:
    """Build the flat intermediate frame the feature spec reads.

    The contextual columns (how full the shelter was, how busy the week had
    been, whether the animal had been in before) are computed over the whole
    episode set, because they describe the shelter rather than the row.
    """
    events: list[tuple[datetime, int]] = []
    for episode in episodes:
        events.append((episode.intake_at, 1))
        if episode.outcome_at is not None:
            events.append((episode.outcome_at, -1))
    # Departures settle before arrivals at the same instant, matching the
    # tie-break in the TypeScript sweep.
    events.sort(key=lambda e: (e[0], e[1]))

    occupancy_times: list[datetime] = []
    occupancy_values: list[int] = []
    running = 0
    for at, delta in events:
        running += delta
        occupancy_times.append(at)
        occupancy_values.append(running)

    def census_at(at: datetime) -> int:
        index = bisect.bisect_right(occupancy_times, at) - 1
        return occupancy_values[index] if index >= 0 else 0

    intake_times = sorted(e.intake_at for e in episodes)

    def intakes_in_window(at: datetime, days: int) -> int:
        start = bisect.bisect_left(intake_times, at - timedelta(days=days))
        end = bisect.bisect_left(intake_times, at)
        return end - start

    by_animal: dict[str, list[datetime]] = {}
    for episode in episodes:
        by_animal.setdefault(episode.animal_id, []).append(episode.intake_at)
    for times in by_animal.values():
        times.sort()

    records = []
    for episode in episodes:
        at = episode.intake_at
        month = at.month
        breed = clean_category(episode.breed)
        color = clean_category(episode.color)
        prior = by_animal.get(episode.animal_id, [])

        records.append(
            {
                "episodeId": episode.episode_id,
                "ageAtIntakeDays": episode.age_at_intake_days,
                "ageKnown": 0 if episode.age_at_intake_days is None else 1,
                "species": episode.species,
                "rawType": clean_category(episode.raw_type),
                "alteredAtIntake": (
                    None if episode.altered_at_intake is None else int(episode.altered_at_intake)
                ),
                "sex": clean_category(episode.sex),
                "intakeMonth": month,
                # JavaScript weeks start on Sunday; Python on Monday.
                "intakeDayOfWeek": (at.weekday() + 1) % 7,
                "intakeHour": at.hour,
                "monthSin": math.sin(2 * math.pi * month / 12),
                "monthCos": math.cos(2 * math.pi * month / 12),
                "intakeReason": clean_category(episode.intake_reason),
                "condition": clean_category(episode.condition),
                "breed": breed,
                "breedIsMixed": 1 if ("mix" in breed.lower() or "/" in breed) else 0,
                "colorIsBlack": 1 if "black" in color.lower() else 0,
                "censusAtIntake": census_at(at),
                "intakesLast7d": intakes_in_window(at, 7),
                "priorIntakes": bisect.bisect_left(prior, at),
            }
        )

    return pd.DataFrame.from_records(records)


def build_feature_spec(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Decide the exported columns, in the order the model will see them."""
    specs: list[dict[str, Any]] = [
        {"name": "age_at_intake_days", "kind": "numeric", "source": "ageAtIntakeDays"},
        {"name": "age_known", "kind": "numeric", "source": "ageKnown"},
        {"name": "altered_at_intake", "kind": "numeric", "source": "alteredAtIntake"},
        {"name": "intake_month", "kind": "numeric", "source": "intakeMonth"},
        {"name": "intake_day_of_week", "kind": "numeric", "source": "intakeDayOfWeek"},
        {"name": "intake_hour", "kind": "numeric", "source": "intakeHour"},
        {"name": "month_sin", "kind": "numeric", "source": "monthSin"},
        {"name": "month_cos", "kind": "numeric", "source": "monthCos"},
        {"name": "breed_is_mixed", "kind": "numeric", "source": "breedIsMixed"},
        {"name": "color_is_black", "kind": "numeric", "source": "colorIsBlack"},
        {"name": "census_at_intake", "kind": "numeric", "source": "censusAtIntake"},
        {"name": "intakes_last_7d", "kind": "numeric", "source": "intakesLast7d"},
        {"name": "prior_intakes", "kind": "numeric", "source": "priorIntakes"},
        {"name": "species_dog", "kind": "indicator", "source": "species", "equals": "Dog"},
        {"name": "species_cat", "kind": "indicator", "source": "species", "equals": "Cat"},
    ]

    for column, limit in TOP_LEVELS.items():
        levels = frame[column].value_counts().head(limit).index.tolist()
        for level in levels:
            slug = "".join(ch if ch.isalnum() else "_" for ch in str(level)).strip("_").lower()
            specs.append(
                {
                    "name": f"{column.lower()}__{slug}",
                    "kind": "indicator",
                    "source": column,
                    "equals": str(level),
                }
            )

    return specs


def materialise(frame: pd.DataFrame, specs: list[dict[str, Any]]) -> np.ndarray:
    """Turn the intermediate frame into the model matrix.

    Missing numerics stay NaN. LightGBM learned a direction for them, and
    filling a zero would send the row down the wrong branch while looking like
    a genuine measurement.
    """
    columns = []
    for spec in specs:
        series = frame[spec["source"]]
        if spec["kind"] == "indicator":
            columns.append((series.astype("object").astype(str) == spec["equals"]).astype(float))
        else:
            columns.append(pd.to_numeric(series, errors="coerce").astype(float))
    return np.column_stack([c.to_numpy() for c in columns])


# --------------------------------------------------------------------------- #
# Labels
# --------------------------------------------------------------------------- #


def build_labels(episodes: list[Episode], observed_through: datetime) -> pd.DataFrame:
    """Compute the two targets, leaving them NaN where not yet observable.

    ``long_stay_60d`` asks whether the animal was still in the shelter after 60
    days. ``adopted_within_30d`` asks whether an adoption happened inside 30.
    Both are only answerable once enough time has passed, and an unanswerable
    row is excluded rather than counted as a negative.
    """
    records = []
    for episode in episodes:
        elapsed = (observed_through - episode.intake_at).total_seconds() / 86_400
        duration = episode.closed_days_in_care
        adopted = is_adoption(episode.outcome_type)

        if duration is not None:
            long_stay = 1.0 if duration > 60 else 0.0
        elif elapsed > 60:
            long_stay = 1.0  # still open past the threshold
        else:
            long_stay = np.nan

        if duration is not None and adopted and duration <= 30:
            adopt_30 = 1.0
        elif duration is not None and duration <= 30:
            adopt_30 = 0.0  # left within 30 days by another route
        elif elapsed >= 30:
            adopt_30 = 0.0  # 30 days passed with no adoption inside them
        else:
            adopt_30 = np.nan

        records.append(
            {
                "episodeId": episode.episode_id,
                "intakeAt": episode.intake_at,
                "species": episode.species,
                "joinStatus": episode.join_status,
                "long_stay_60d": long_stay,
                "adopted_within_30d": adopt_30,
            }
        )
    return pd.DataFrame.from_records(records)


# --------------------------------------------------------------------------- #
# Evaluation
# --------------------------------------------------------------------------- #


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = 0.0
    for i in range(bins):
        mask = (y_prob >= edges[i]) & (y_prob < edges[i + 1] if i < bins - 1 else y_prob <= 1.0)
        if not mask.any():
            continue
        total += mask.mean() * abs(y_true[mask].mean() - y_prob[mask].mean())
    return float(total)


def calibration_line(y_true: np.ndarray, y_prob: np.ndarray) -> tuple[float | None, float | None]:
    """Slope and intercept of observed rate against predicted, by decile."""
    if len(y_true) < 20:
        return None, None
    order = np.argsort(y_prob)
    chunks = np.array_split(order, 10)
    xs, ys = [], []
    for chunk in chunks:
        if len(chunk) == 0:
            continue
        xs.append(float(y_prob[chunk].mean()))
        ys.append(float(y_true[chunk].mean()))
    if len(xs) < 3:
        return None, None
    slope, intercept = np.polyfit(np.array(xs), np.array(ys), 1)
    return float(slope), float(intercept)


def metrics_for(y_true: np.ndarray, y_prob: np.ndarray) -> dict[str, Any]:
    n = len(y_true)
    result: dict[str, Any] = {
        "n": n,
        "positiveRate": float(y_true.mean()) if n else 0.0,
        "rocAuc": None,
        "prAuc": None,
        "brier": None,
        "logLoss": None,
        "ece": None,
        "calibrationSlope": None,
        "calibrationIntercept": None,
        "precisionAt50": None,
        "liftAt50": None,
    }
    if n == 0 or len(np.unique(y_true)) < 2:
        return result

    result["rocAuc"] = float(roc_auc_score(y_true, y_prob))
    result["prAuc"] = float(average_precision_score(y_true, y_prob))
    result["brier"] = float(brier_score_loss(y_true, y_prob))
    result["logLoss"] = float(log_loss(y_true, np.clip(y_prob, 1e-9, 1 - 1e-9)))
    result["ece"] = expected_calibration_error(y_true, y_prob)

    slope, intercept = calibration_line(y_true, y_prob)
    result["calibrationSlope"] = slope
    result["calibrationIntercept"] = intercept

    k = min(50, n)
    top = np.argsort(-y_prob)[:k]
    precision = float(y_true[top].mean())
    result["precisionAt50"] = precision
    base = float(y_true.mean())
    result["liftAt50"] = float(precision / base) if base > 0 else None
    return result


def subgroup_metrics(
    frame: pd.DataFrame, y_true: np.ndarray, y_prob: np.ndarray
) -> list[dict[str, Any]]:
    """Performance by group.

    A model that works on average can fail badly for one kind of animal, and
    that is the failure that matters. Reporting it is not optional.
    """
    rows: list[dict[str, Any]] = []
    frame = frame.copy()
    frame["_y"] = y_true
    frame["_p"] = y_prob

    def age_band(days: Any) -> str:
        if days is None or (isinstance(days, float) and math.isnan(days)):
            return "unknown"
        if days < 365:
            return "juvenile"
        if days >= 2920:
            return "senior"
        return "adult"

    frame["_ageBand"] = frame["ageAtIntakeDays"].map(age_band)
    frame["_mixed"] = frame["breedIsMixed"].map({1: "mixed breed", 0: "single breed"})
    frame["_black"] = frame["colorIsBlack"].map({1: "black in coat", 0: "no black in coat"})

    for attribute, column in [
        ("species", "species"),
        ("life stage", "_ageBand"),
        ("intake condition", "condition"),
        ("breed structure", "_mixed"),
        ("coat colour", "_black"),
    ]:
        for level, group in frame.groupby(column):
            if len(group) < 30:
                continue
            gy = group["_y"].to_numpy()
            gp = group["_p"].to_numpy()
            auc = (
                float(roc_auc_score(gy, gp))
                if len(np.unique(gy)) > 1
                else None
            )
            rows.append(
                {
                    "attribute": attribute,
                    "level": str(level),
                    "n": len(group),
                    "positiveRate": float(gy.mean()),
                    "rocAuc": auc,
                    "meanPredicted": float(gp.mean()),
                    "calibrationGap": float(gp.mean() - gy.mean()),
                }
            )
    return rows


# --------------------------------------------------------------------------- #
# Training
# --------------------------------------------------------------------------- #


@dataclass
class Split:
    train_end: datetime
    valid_end: datetime


def train_target(
    target: str,
    features: np.ndarray,
    labels: pd.DataFrame,
    derived: pd.DataFrame,
    split: Split,
    feature_names: list[str],
) -> dict[str, Any]:
    """Fit, calibrate on validation, evaluate on a later block."""
    observable = labels[target].notna().to_numpy()
    intake = labels["intakeAt"]

    is_train = observable & (intake <= split.train_end).to_numpy()
    is_valid = observable & (intake > split.train_end).to_numpy() & (
        intake <= split.valid_end
    ).to_numpy()
    is_test = observable & (intake > split.valid_end).to_numpy()

    y = labels[target].to_numpy()

    # Small trees and early stopping, chosen together. The validation block is
    # the later-in-time one the calibrator also uses, so the number of trees is
    # picked against data the model has not seen rather than against its own
    # training loss, and the exported artefact stays a file a person can open.
    model = LGBMClassifier(
        n_estimators=600,
        learning_rate=0.04,
        num_leaves=15,
        max_depth=6,
        min_child_samples=60,
        subsample=0.85,
        subsample_freq=1,
        colsample_bytree=0.7,
        reg_lambda=5.0,
        random_state=RANDOM_SEED,
        n_jobs=1,
        verbose=-1,
    )
    model.fit(
        features[is_train],
        y[is_train],
        eval_X=features[is_valid],
        eval_y=y[is_valid],
        eval_metric="auc",
        feature_name=feature_names,
        callbacks=[early_stopping(stopping_rounds=40, verbose=False)],
    )

    raw_valid = model.predict_proba(features[is_valid])[:, 1]
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(raw_valid, y[is_valid])

    raw_test = model.predict_proba(features[is_test])[:, 1]
    cal_test = calibrator.predict(raw_test)

    gains = model.booster_.feature_importance(importance_type="gain")
    importance = sorted(
        ({"feature": name, "gain": float(gain)} for name, gain in zip(feature_names, gains, strict=True)),
        key=lambda item: item["gain"],
        reverse=True,
    )[:15]

    test_metrics = metrics_for(y[is_test], cal_test)
    print(
        f"  {target}: train={is_train.sum()} valid={is_valid.sum()} test={is_test.sum()} "
        f"trees={model.booster_.num_trees()} "
        f"AUC={test_metrics['rocAuc']:.4f} ECE={test_metrics['ece']:.4f} "
        f"Brier={test_metrics['brier']:.4f}"
    )

    return {
        "booster": model.booster_.dump_model(),
        "calibration": {
            "x": [float(v) for v in calibrator.X_thresholds_],
            "y": [float(v) for v in calibrator.y_thresholds_],
        },
        "test": metrics_for(y[is_test], cal_test),
        "validation": metrics_for(y[is_valid], calibrator.predict(raw_valid)),
        "subgroups": subgroup_metrics(derived[is_test], y[is_test], cal_test),
        "featureImportance": importance,
        "_masks": {"train": is_train, "valid": is_valid, "test": is_test},
        "_model": model,
        "_calibrator": calibrator,
    }


def strip_booster(dump: dict[str, Any]) -> dict[str, Any]:
    """Keep only what the TypeScript evaluator reads.

    A full LightGBM dump carries per-node statistics, counts and gains that are
    useful for debugging and useless at inference. Dropping them cuts the
    committed artefact by roughly two thirds.
    """

    def clean_node(node: dict[str, Any]) -> dict[str, Any]:
        if "leaf_value" in node:
            return {"leaf_value": node["leaf_value"]}
        return {
            "split_feature": node["split_feature"],
            "threshold": node["threshold"],
            "decision_type": node["decision_type"],
            "default_left": node["default_left"],
            "missing_type": node.get("missing_type", "None"),
            "left_child": clean_node(node["left_child"]),
            "right_child": clean_node(node["right_child"]),
        }

    return {
        "objective": dump["objective"],
        "feature_names": dump["feature_names"],
        "tree_info": [{"tree_structure": clean_node(t["tree_structure"])} for t in dump["tree_info"]],
    }


def main() -> None:
    print("Fetching current Austin feeds...")
    intakes = fetch_dataset(CURRENT_INTAKES_ID, INTAKE_COLUMNS)
    outcomes = fetch_dataset(CURRENT_OUTCOMES_ID, OUTCOME_COLUMNS)
    retrieved_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    print(f"  intakes={len(intakes)} outcomes={len(outcomes)}")

    episodes, join_counts = build_episodes(intakes, outcomes)
    print(f"  episodes={len(episodes)} {join_counts}")

    # Cats and dogs only. The feed also carries bats, goats and reptiles; they
    # are genuine intakes but they are not what this model is about, and
    # training on them would blur every signal it has.
    episodes = [e for e in episodes if e.species in {"Dog", "Cat"}]
    print(f"  companion episodes={len(episodes)}")

    observed_through = max(
        (e.outcome_at for e in episodes if e.outcome_at is not None),
        default=datetime.now(),
    )

    derived = derive_rows(episodes)
    labels = build_labels(episodes, observed_through)

    # Ambiguous joins are excluded from training as well as from the product.
    confident = (labels["joinStatus"] != "ambiguous").to_numpy()
    derived = derived[confident].reset_index(drop=True)
    labels = labels[confident].reset_index(drop=True)

    specs = build_feature_spec(derived)
    features = materialise(derived, specs)
    feature_names = [s["name"] for s in specs]
    print(f"  features={len(feature_names)} rows={features.shape[0]}")

    latest_intake = labels["intakeAt"].max()
    split = Split(
        train_end=latest_intake - timedelta(days=185),
        valid_end=latest_intake - timedelta(days=95),
    )
    print(f"  split train<= {split.train_end.date()}  valid<= {split.valid_end.date()}")

    results = {}
    for target in ("long_stay_60d", "adopted_within_30d"):
        print(f"Training {target}...")
        results[target] = train_target(target, features, labels, derived, split, feature_names)

    # Golden vectors: real rows plus the probabilities this script computed for
    # them. The web test suite replays these through the TypeScript evaluator
    # and fails if the two implementations disagree.
    rng = np.random.default_rng(RANDOM_SEED)
    sample_idx = rng.choice(features.shape[0], size=min(200, features.shape[0]), replace=False)
    golden = []
    for idx in sample_idx:
        row = features[idx]
        expected = {}
        for target, result in results.items():
            raw = result["_model"].predict_proba(row.reshape(1, -1))[:, 1]
            expected[target] = float(result["_calibrator"].predict(raw)[0])
        golden.append(
            {
                "features": [None if math.isnan(v) else float(v) for v in row],
                "expected": expected,
            }
        )

    version = f"sc-sb-{latest_intake.date().isoformat()}-v1"
    trained_at = datetime.now(UTC).replace(microsecond=0).isoformat()

    artifact = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "ready",
        "version": version,
        "trainedAt": trained_at,
        "note": None,
        "trainingWindow": {
            "trainStart": labels["intakeAt"].min().isoformat(),
            "trainEnd": split.train_end.isoformat(),
            "validStart": (split.train_end + timedelta(seconds=1)).isoformat(),
            "validEnd": split.valid_end.isoformat(),
            "testStart": (split.valid_end + timedelta(seconds=1)).isoformat(),
            "testEnd": latest_intake.isoformat(),
            "trainRows": int(results["long_stay_60d"]["_masks"]["train"].sum()),
            "validRows": int(results["long_stay_60d"]["_masks"]["valid"].sum()),
            "testRows": int(results["long_stay_60d"]["_masks"]["test"].sum()),
        },
        "features": specs,
        "targets": {
            target: {
                "booster": strip_booster(result["booster"]),
                "calibration": result["calibration"],
                "test": result["test"],
                "validation": result["validation"],
                "subgroups": result["subgroups"],
                "featureImportance": result["featureImportance"],
            }
            for target, result in results.items()
        },
        "provenance": {
            "sourceDatasetIds": [CURRENT_INTAKES_ID, CURRENT_OUTCOMES_ID],
            "sourceSystem": "shelterbuddy",
            "intakeRows": len(intakes),
            "outcomeRows": len(outcomes),
            "retrievedAt": retrieved_at,
            "schemaVersion": SCHEMA_VERSION,
            "transformVersion": TRANSFORM_VERSION,
            "librarySeed": RANDOM_SEED,
        },
        "goldenVectors": golden[:25],
    }

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=1), encoding="utf-8")

    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN_PATH.write_text(
        json.dumps({"version": version, "features": specs, "vectors": golden}, indent=1),
        encoding="utf-8",
    )

    size_mb = ARTIFACT_PATH.stat().st_size / 1_048_576
    print(f"\nWrote {ARTIFACT_PATH.relative_to(REPO_ROOT)} ({size_mb:.2f} MB), version {version}")
    print(f"Wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} with {len(golden)} golden vectors")


if __name__ == "__main__":
    main()
