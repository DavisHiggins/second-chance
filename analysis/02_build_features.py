"""Step two: attach weather, build the feature matrix, and sanity check it."""
import logging
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
from secondchance.features import ALL_FEATURES, build_features

episodes = pd.read_parquet(ROOT / "data/interim/episodes.parquet")
w = pd.read_csv(ROOT / "data/raw/austin_weather_USW00013958.csv")
w = w.rename(columns={w.columns[0]: "row_id", "Date": "date"})
w["date"] = pd.to_datetime(w["date"])
w = w[w.date >= "2013-01-01"][["date", "tmax", "tmin", "prcp"]]
for c in ["tmax", "tmin", "prcp"]:
    w[c] = pd.to_numeric(w[c], errors="coerce")
print("weather rows", len(w), "range", w.date.min().date(), "to", w.date.max().date())
print("weather missing:", w[["tmax","tmin","prcp"]].isna().sum().to_dict())

feat = build_features(episodes, weather=w, breed_strategy="llm")
print("\nfeature matrix:", feat.shape)
print("weather coverage:", round(float(feat.has_weather.mean()),4))
print("breed_resolved rate:", round(float(feat.breed_resolved.mean()),4))
print("\ncensus sanity (should be non-negative, plausible):")
print(feat.shelter_census_at_intake.describe().round(1).to_string())
print("\nmissingness of numeric features (top 12):")
na = feat[ALL_FEATURES].isna().mean().sort_values(ascending=False)
print((na[na>0]).round(4).to_string())
feat.to_parquet(ROOT / "data/interim/features.parquet", index=False)
print("\nsaved features.parquet")
