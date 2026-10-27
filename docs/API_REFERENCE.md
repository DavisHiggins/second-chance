# SecondChance API reference

What every major function does, how it works, and how to call it. This extends the
initial documentation (the model card, data dictionary and decision log in this
folder) down to the level of individual functions.

Every Python example below runs from the repository root on the committed sample
data in `data/sample/`, after `pip install -e .` (or with `src/` on `PYTHONPATH`).
The runnable end-to-end versions are in [`bin/`](../bin).

**Contents**

1. [Pipeline at a glance](#1-pipeline-at-a-glance)
2. [Episodes — `secondchance.episodes`](#2-episodes--secondchanceepisodes)
3. [Features — `secondchance.features`](#3-features--secondchancefeatures)
4. [Breed structuring — `secondchance.labeling`](#4-breed-structuring--secondchancelabeling)
5. [Modelling and evaluation — `secondchance.modeling`](#5-modelling-and-evaluation--secondchancemodeling)
6. [Survival analysis — `secondchance.survival`](#6-survival-analysis--secondchancesurvival)
7. [Drift monitoring — `secondchance.monitor.drift`](#7-drift-monitoring--secondchancemonitordrift)
8. [Data clients — `secondchance.ingest.clients`](#8-data-clients--secondchanceingestclients)
9. [Command line tool — `secondchance.cli`](#9-command-line-tool--secondchancecli)
10. [AWS handlers](#10-aws-handlers)
11. [Web app modules (TypeScript)](#11-web-app-modules-typescript)
12. [Conventions that hold everywhere](#12-conventions-that-hold-everywhere)

---

## 1. Pipeline at a glance

```
Austin intakes CSV ─┐
                    ├─ load_intakes / load_outcomes      parse timestamps and free-text ages
Austin outcomes CSV ┘
        │
        ▼
build_episodes            pair each arrival with the outcome that closed it  → episodes + EpisodeAudit
        │
        ▼
label_horizons            adopted_within_{7,14,30}d and long_stay_60d; censored rows stay NaN
        │
        ▼
build_features            58 intake-time columns (animal, arrival, calendar, shelter load, breed, weather)
        │
        ▼
build_cohort              cats and dogs on the adoption pathway, exclusions counted
        │
        ▼
DEFAULT_SPLIT.assign      train < 2019 · validate 2019 · test 2020 → Jan 2022 (temporal, never random)
        │
        ▼
make_model → fit_calibrated → evaluate_binary      LightGBM + isotonic calibration, held-out metrics
        │
        ├─ survival.*          time-to-adoption curves with competing risks
        └─ monitor.drift.*     PSI / KS checks before trusting the model on new data
```

The minimal version of the whole chain:

```python
import pandas as pd
from secondchance.episodes import load_intakes, load_outcomes, build_episodes, label_horizons
from secondchance.features import build_features, build_cohort, DEPLOYMENT_FEATURES
from secondchance.modeling import DEFAULT_SPLIT, make_model, fit_calibrated, evaluate_binary

cutoff = pd.Timestamp("2022-03-04 11:25:00")
episodes, audit = build_episodes(load_intakes("data/sample/aac_intakes_sample.csv"),
                                 load_outcomes("data/sample/aac_outcomes_sample.csv"), cutoff)
cohort, _ = build_cohort(build_features(label_horizons(episodes, data_cutoff=cutoff)))
cohort["block"] = DEFAULT_SPLIT.assign(cohort["intake_datetime"])

target = "adopted_within_30d"
data = cohort[cohort[target].notna()]
train, valid, test = (data[data.block == b] for b in ("train", "valid", "test"))
cols = [c for c in DEPLOYMENT_FEATURES if train[c].notna().any()]

_, model = fit_calibrated(make_model("lightgbm", cols),
                          train[cols], train[target].to_numpy(), valid[cols], valid[target].to_numpy())
print(evaluate_binary(test[target].to_numpy(), model.predict_proba(test[cols])[:, 1])["roc_auc"])
```

---

## 2. Episodes — `secondchance.episodes`

Austin publishes two event logs, not case files: "animal A712345 arrived" and
"animal A712345 left". Neither carries an episode key, and about one animal in
eleven arrives more than once. This module reconstructs the *episode* — one
arrival and the departure that closed it — and keeps an audit of every pairing
decision.

### `load_intakes(path) -> DataFrame`

Reads an Austin intakes CSV. Column names are normalised to `snake_case`, the
Socrata timestamp (`"01/03/2019 04:19:00 PM"`) is parsed into `intake_datetime`
(with a loose second pass for any row the strict format misses), and the
free-text age is converted to `age_upon_intake_days` with
[`parse_age_to_days`](#parse_age_to_daysraw---float).

### `load_outcomes(path) -> DataFrame`

The same for the outcomes CSV: `outcome_datetime`, `date_of_birth` and
`age_upon_outcome_days`.

### `parse_age_to_days(raw) -> float`

Converts `"2 years"`, `"11 months"`, `"4 weeks"`, `"1 day"` to days
(1 year = 365.25, 1 month = 30.4375). Returns `NaN` for anything unreadable,
including the negative ages produced by mistyped birth dates — a missing value
is carried into the model rather than an invented one.

```python
from secondchance.episodes import parse_age_to_days
parse_age_to_days("2 years")   # 730.5
parse_age_to_days("-1 years")  # nan
```

### `build_episodes(intakes, outcomes, data_cutoff) -> (DataFrame, EpisodeAudit)`

**How it works.** Within each animal ID, both logs are sorted by time. The k-th
intake is closed by the earliest outcome at or after it *and strictly before the
(k+1)-th intake*. This is done for all animals at once with
`pandas.merge_asof(..., by="animal_id", direction="forward")`, then any match
that lands on or after the animal's next arrival is invalidated (it belongs to
the next episode). An intake with no qualifying outcome was still in the
building at the cutoff and becomes a right-censored episode rather than a
dropped row.

It also:

- drops byte-identical duplicate rows (counted);
- drops negative durations (counted — a non-zero count means the pairing is wrong);
- flags species mismatches between the two sides (counted);
- flags **suspected missing outcomes**: open stays longer than the 99.5th
  percentile of observed stays are unfiled paperwork, not seven-year residents;
  their effective exit is set to that threshold so they do not inflate occupancy.

| Argument | Type | Meaning |
|---|---|---|
| `intakes` | `DataFrame` | output of `load_intakes` |
| `outcomes` | `DataFrame` | output of `load_outcomes` |
| `data_cutoff` | `pd.Timestamp` | the export time; open stays are censored here |

**Returns** the episode table (one row per arrival, with `episode_id`,
`length_of_stay_days`, `is_matched`, `is_adopted`, `event_code` 0 = censored /
1 = adopted / 2 = other exit, `prior_intake_count`, `suspected_missing_outcome`, …)
and an `EpisodeAudit` dataclass whose `as_dict()` gives every count quoted in the
paper's data section.

```python
episodes, audit = build_episodes(intakes, outcomes, pd.Timestamp("2022-03-04 11:25:00"))
audit.episodes_built, audit.episodes_open_at_cutoff, audit.suspected_missing_outcomes
```

### `label_horizons(episodes, horizons_days=(7, 14, 30), long_stay_days=60, data_cutoff=None) -> DataFrame`

Adds the binary targets `adopted_within_{H}d` and `long_stay_60d`.

**How it works.** A transfer on day 5 is a *negative* for "adopted within 30
days" — the adoption did not happen. An animal still in care at the cutoff after
only 12 days has *no answer yet*, so its label is `NaN` and training drops it for
that horizon only. Keeping censored and negative rows apart is what stops the
model looking better than it is.

### `summarise_episodes(episodes) -> DataFrame`

Per-species counts, adoptions, median and mean stay, open episodes and adoption
rate — the descriptive table in the paper.

---

## 3. Features — `secondchance.features`

The rule for every feature: **it must be knowable at the moment the animal
arrives.** Outcome-side fields such as `sex_upon_outcome` are leakage (Austin
sterilises on the way out, so "neutered at exit" almost means "adopted") and are
never used.

### `build_features(episodes, weather=None, breed_strategy="llm") -> DataFrame`

Assembles the modelling matrix — all 58 columns in `ALL_FEATURES` — in the five
blocks of `FEATURE_BLOCKS` (plus the two monotone time columns described below):

| Block (`FEATURE_BLOCKS` key) | Examples | Source |
|---|---|---|
| `animal` | `age_at_intake_days`, `age_band`, `is_sterilized_at_intake`, `has_name`, `name_is_shelter_assigned`, colour flags | intake record |
| `intake_context` | `intake_type`, `intake_condition`, `is_repeat_visitor`, `location_outside_austin_city`, `intake_month`, `intake_doy_sin/cos` (cyclic), `is_weekend_intake`, `season` | intake record and timestamp |
| `shelter_load` | `shelter_census_at_intake`, `intakes_prior_7d`, `intakes_prior_30d`, `adoptions_prior_30d` | other animals' events — see `add_shelter_context` |
| `breed_llm` | `breed_size_ordinal`, `breed_weight_lb`, `breed_bully_type`, `breed_is_mix`, … | `labeling` (strategy below) |
| `weather` | `weather_tmax_f`, `weather_prcp_7d_total`, … | optional daily weather file |

| Argument | Meaning |
|---|---|
| `episodes` | output of `label_horizons` |
| `weather` | optional frame with `date, tmax, tmin, prcp`; without it the weather columns are `NaN` and `has_weather = 0` |
| `breed_strategy` | `"llm"` structured reference (default), `"rules"` keyword baseline, `"none"` — the three settings the paper's ablation compares |

`DEPLOYMENT_FEATURES` is `ALL_FEATURES` minus the two monotone time features
(`intake_year`, `days_since_series_start`) that silently break drift detection
and do not extrapolate; it is the column list every deployed model uses.

### `add_shelter_context(episodes) -> DataFrame`

How full the building was when each animal arrived. Implemented as a linear
**sweep** over +1 arrival / −1 departure events sorted in time (a naive
"count overlapping stays per intake" is quadratic). Uses the corrected exit time
from `build_episodes`, so lost outcome forms do not accumulate into phantom
occupants.

### `add_weather(episodes, weather) -> DataFrame`

Joins daily Austin observations onto the intake date, plus a 7-day trailing
mean temperature and rainfall total.

### `build_cohort(features) -> (DataFrame, dict)`

The single modelling cohort shared by the CLI, the analysis scripts and the
ablations, so they cannot drift into reporting incomparable numbers. Removes,
and counts: non-dog/cat animals; off-pathway intakes (`Wildlife`,
`Euthanasia Request`); suspected missing outcomes. Returns the cohort and
`{"episodes_start", "excluded_…", "episodes_final"}`.

### `feature_columns(blocks=None) -> list[str]` · `split_feature_types(columns) -> (numeric, categorical)`

Column lists for a set of `FEATURE_BLOCKS` (used by the ablation study), and the
numeric/categorical split the encoder needs.

---

## 4. Breed structuring — `secondchance.labeling`

Austin's breed field is free text with 254 atomic tokens (`"Pit Bull/Labrador
Retriever Mix"`). These functions turn it into numeric features.

### `structure_breed(raw, reference=None) -> dict` (`labeling.breed_llm`)

Splits the string with `split_breed_string`, looks every token up in the
structured reference `data/reference/breed_attributes_llm.psv`, and returns the
breed features: primary group, size / weight / coat / grooming / energy ordinals,
and flags (`breed_bully_type`, `breed_brachycephalic`, `breed_guardian`,
`breed_bsl_risk`, `breed_purebred`). For a cross, size, weight, coat, grooming and
energy take the **maximum** over the listed breeds (adopters shop by the upper
bound of what they might get), the risk flags take the logical OR, and
`breed_purebred` is true only for a single recognised, non-mix token.

The reference was produced once, offline, by an LLM labeling pass and is
committed; **no model is called at scoring time.** `refresh_reference(tokens, …)`
regenerates it through Amazon Bedrock; `load_reference(path=None)` reads it.

```python
from secondchance.labeling.breed_llm import structure_breed
features = structure_breed("Pit Bull/Labrador Retriever Mix")
features["breed_size_ordinal"], features["breed_bully_type"]   # (3.0, 1)
```

### `split_breed_string(raw) -> (tokens, is_mix)`

`"Pit Bull/Labrador Retriever Mix"` → `(["Pit Bull", "Labrador Retriever"], True)`.

### `structure_breed_rules(raw) -> dict` (`labeling.rule_baseline`)

The keyword baseline with the same output keys, built from regular expressions.
It exists to measure what the structured reference adds (0.012 AUC on long-stay
risk; 0.0003 on 30-day adoption).

---

## 5. Modelling and evaluation — `secondchance.modeling`

Plain scikit-learn plus LightGBM. Three things matter more than the model
choice: the split is temporal, probabilities are calibrated on held-out data and
the calibration is measured, and headline numbers carry bootstrap intervals.

### `TemporalSplit` and `DEFAULT_SPLIT`

`DEFAULT_SPLIT.assign(timestamps)` labels each row `"train"` (before
2019-01-01), `"valid"` (2019) or `"test"` (2020-01-01 to 2022-01-03). The test
block deliberately spans the March 2020 break so the evaluation says something
about a world that moved. A random split would let the model learn from February
to predict January, which no deployed system can do.

### `make_model(name, feature_columns, scale_pos_weight=1.0)`

Returns an **unfitted** estimator by name:

| `name` | What it is |
|---|---|
| `"prior"` | predicts the training base rate — the bar to clear |
| `"logistic"`, `"logistic_simple"` | `build_preprocessor` + L2 logistic regression |
| `"lightgbm"` | `build_preprocessor` + `LGBMClassifier` (600 trees, lr 0.05, 48 leaves) — the production model |
| `"xgboost"` | `build_preprocessor` + `XGBClassifier` (hist) |

`build_preprocessor(feature_columns)` median-imputes (with missing indicators)
and scales numerics, and one-hot encodes categoricals (`min_frequency=25`,
unknown levels ignored). Every model shares it, so score differences come from
the model and not from preprocessing.

### `fit_calibrated(base_model, x_train, y_train, x_valid, y_valid) -> (base, calibrated)`

Fits the model on train, then fits an **isotonic** calibrator on the validation
block with the fitted model frozen (`FrozenEstimator`, or `cv="prefit"` on older
scikit-learn). Calibrating on the training data would hide overfitting. The
calibrated model is what turns a score of 0.2 into "about one in five".

### `evaluate_binary(y_true, y_prob, queue_sizes=(20, 50, 100)) -> dict`

The full metric set for one target on one block: `n`, `positive_rate`,
`roc_auc`, `pr_auc`, `brier`, `log_loss`, `ece`, `calibration_slope`,
`calibration_intercept`, and `precision_at_k` / `lift_at_k` for each queue size.

| Metric helper | How it works |
|---|---|
| `expected_calibration_error(y, p, bins=20)` | equal-frequency bins; size-weighted mean of \|mean predicted − observed rate\| |
| `calibration_slope_intercept(y, p)` | logistic regression of the label on logit(p); slope 1, intercept 0 is perfect |
| `precision_at_k(y, p, k)` | positive rate among the top-k scores — the hit rate of a k-animal queue |
| `lift_at_k(y, p, k)` | `precision_at_k / base rate` — how much better than picking at random |

### `bootstrap_metric(y, p, metric="roc_auc", n_boot=400)` · `delong_style_paired_bootstrap(y, p_a, p_b, n_boot=1000)`

Percentile bootstrap interval for one metric, and a *paired* bootstrap of the
AUC difference between two models scored on the same animals (with a two-sided
p-value).

### `subgroup_metrics(frame, y_true, y_prob, group_columns, min_size=200) -> DataFrame`

AUC, ECE and calibration gap per level of each attribute (species, life stage,
intake condition, …). Groups under `min_size` report their size but no metrics:
an AUC on forty animals is noise.

---

## 6. Survival analysis — `secondchance.survival`

Time to adoption is a survival problem with **competing risks**: an animal
transferred on day 3 can never be adopted from this shelter. Treating that
transfer as ordinary censoring overstates adoption — by 23.7 percentage points
at day 30 on the archive.

| Function | What it does |
|---|---|
| `to_survival_arrays(frame, max_days=365)` | durations, adoption indicator and event code (0/1/2), censored at one year |
| `kaplan_meier(arrays, timeline=None)` | cause-specific KM curve with confidence band (other exits censored) — for comparing groups |
| `cumulative_incidence(arrays, cause=1)` | **Aalen-Johansen** cumulative incidence — the honest "share adopted by day t" |
| `median_survival_days(arrays)` | median cause-specific time to adoption |
| `fit_cox(train, columns, penalizer=0.1)` · `concordance(durations, risk, events)` | penalised Cox model and Harrell's C |
| `expand_person_period(frame, columns, bin_edges)` | one row per episode per interval survived — turns survival into a classifier's job (discrete-time hazard) |
| `competing_risk_incidence(h_adopt, h_other)` · `survival_from_hazards(h)` · `expected_days(S, edges)` | rebuild incidence, survival and restricted mean stay from per-interval hazards |
| `integrated_brier_score(S, durations, events, edges)` | IPCW Brier score integrated over time |

```python
from secondchance.survival import to_survival_arrays, kaplan_meier, cumulative_incidence
arrays = to_survival_arrays(episodes[episodes.animal_type == "Dog"])
naive  = kaplan_meier(arrays)            # column adopted_cumulative
honest = cumulative_incidence(arrays)    # column cumulative_incidence
```

Runnable comparison: [`bin/survival_example.py`](../bin/survival_example.py).

---

## 7. Drift monitoring — `secondchance.monitor.drift`

| Function | How it works |
|---|---|
| `population_stability_index(ref, cur, bins=10)` | bins on reference quantiles; Σ (cur% − ref%) · ln(cur% / ref%), with a small floor so empty bins do not explode |
| `categorical_drift(ref, cur)` | PSI with one bin per category level |
| `ks_statistic(ref, cur)` | two-sample Kolmogorov-Smirnov statistic and p-value |
| `classify(value, warning, critical)` | `"OK"`, `"WARNING"` or `"CRITICAL"` |
| `feature_drift_report(ref, cur, numeric, categorical, thresholds=None)` | one row per feature, worst first |
| `performance_report(frame, label, score, period, baseline_auc, thresholds=None)` | AUC, Brier and calibration gap per period once labels mature |

`DriftThresholds` fixes the limits before anyone looks at the data: PSI 0.10
warning / 0.25 critical, AUC relative drop 3 % / 7 %, calibration gap 0.05 /
0.10, and at least 300 labelled rows before a performance verdict. The archive
study's lesson is built in: **calibration fails before discrimination**, so
both are watched. Runnable: [`bin/drift_example.py`](../bin/drift_example.py).

---

## 8. Data clients — `secondchance.ingest.clients`

All three share one `_request` helper: a project User-Agent, retries with
exponential backoff on 408/429/5xx, and a `FetchResult` that keeps the raw body,
URL, status and retrieval time so any pull can be reproduced.

| Client | Key methods |
|---|---|
| `SocrataClient(domain="data.austintexas.gov", app_token=None, page_size=50000)` | `fetch_all(dataset_id, since=None)` yields pages in stable `:id` order; `row_count(dataset_id)` verifies a pull |
| `NationalWeatherServiceClient(station_id="KATT")` | `observations(start, end)`; `to_daily(observations)` collapses hourly readings to daily max/min/precip, refusing days with too few hours |
| `RescueGroupsClient(api_key)` | `search_available(postal_code="78702", radius_miles=50)` — public adoptable listings; never used by the model |

---

## 9. Command line tool — `secondchance.cli`

Installed as the `secondchance` console script. Each command is a thin wrapper
over the library; `--json` on any command prints machine-readable output.

| Command | What it does | Exit code |
|---|---|---|
| `secondchance audit --intakes I --outcomes O` | pairing and data-quality counts | 0 |
| `secondchance build --intakes I --outcomes O --output F.parquet [--weather W] [--breed-strategy llm\|rules\|none]` | episodes + feature matrix | 1 if any negative duration or species mismatch, so a pipeline stops |
| `secondchance train --features F.parquet --target T --model M [--output B.joblib]` | cohort, temporal split, fit, calibrate, test metrics | 1 if a block is empty |
| `secondchance score --model B.joblib --features F.parquet --output P.parquet` | probabilities for every row; prints the use policy | 1 if columns are missing |
| `secondchance monitor --reference R.parquet --current C.parquet` | drift table | 2 critical · 1 warning · 0 stable |

Targets: `adopted_within_7d`, `adopted_within_14d`, `adopted_within_30d`,
`long_stay_60d`. Models: `prior`, `logistic`, `logistic_simple`, `lightgbm`,
`xgboost`. Runnable walkthrough: [`bin/quickstart_cli.sh`](../bin/quickstart_cli.sh).

---

## 10. AWS handlers

Lambda entry points for the deployed pipeline described in
[`02_AWS_SETUP_RUNBOOK.md`](02_AWS_SETUP_RUNBOOK.md) and `infra/template.yaml`.
None is needed to run anything above.

| Module | Handler(s) | Role |
|---|---|---|
| `ingest.handlers` | `ingest_austin_intakes`, `ingest_austin_outcomes`, `ingest_weather`, `ingest_rescuegroups` | incremental pulls to S3 with a watermark; alarm on a volume drop |
| `labeling.handlers` | `label_new_breeds`, `promote_pending_reference` | label unseen breed tokens into a *pending* reference a human promotes |
| `pipeline.handlers` | `rebuild_warehouse`, `start_training_job`, `evaluate_promotion`, `register_trained_model` | Redshift rebuild, SageMaker training, champion/challenger gate (≥ 0.005 AUC gain, ≤ 0.010 ECE regression, manual approval by default) |
| `monitor.handlers` | `run_monitoring_cycle` | drift and performance checks, CloudWatch metrics, alerts |
| `serve.handler` | `lambda_handler` | `/v1/health`, `/v1/predict`, `/v1/predict/batch`, `/v1/queue/needs-attention`, `/v1/animals/{id}` — validates input and attaches the use policy to every response |

---

## 11. Web app modules (TypeScript)

The live site at <https://secondc.vercel.app> re-implements the serving path in
TypeScript so the Next.js server can score open stays without a Python runtime. The model is
trained by `analysis/20_train_shelterbuddy.py` and exported to
`web/src/data/model/model.json`.

| Module | Main exports | How it works |
|---|---|---|
| `lib/austin/client.server.ts` | `fetchDataset(dataset, select, {where})`, `fetchDatasetMetadata` | paged Socrata reads in stable order, retries, request de-duplication; portal metadata gives `rowsUpdatedAt` |
| `lib/austin/schemas.ts` | `parseRows(schema, raw)` | zod validation; rejected rows are counted and reported, never silently dropped |
| `lib/austin/build-episodes.ts` | `buildShelterBuddyEpisodes(intakes, outcomes, {asOf})`, `openEpisodesAt(episodes, asOf)` | pairs each intake with the outcome that names it; near misses are marked ambiguous |
| `lib/austin/current-inventory.ts` | `buildCurrentInventory(build, asOf)`, `byLongestWait`, `lifeStageFor` | open stays as of one snapshot on Austin's clock, with data-quality counts |
| `lib/austin/metrics.ts` | `medianDaysToAdoption`, `adoptedWithinDays`, `observedLongStayRate`, `outcomeMix`, `monthlySeries` | every rate uses an eligible denominator (only arrivals that have had the full window) |
| `lib/austin/time.ts` | `sourceTimestampToUtcMs`, `austinNowFloating`, `hoursSinceUtc` | Austin's floating timestamps are America/Chicago wall time; converted before any comparison |
| `lib/austin/status.ts` | `buildDataStatus(input)`, `statusHeadline` | `live` / `delayed` / `unavailable` / `historical_demo` — no state lets stale data wear the live label |
| `lib/model/evaluator.ts` | `rawScore`, `predictProbability`, `applyCalibration`, `predictCalibrated` | walks the exported LightGBM trees, sums leaf values, applies the sigmoid, then the isotonic map |
| `lib/model/features.ts` | `buildEpisodeContext`, `deriveRow`, `buildFeatureVector`, `scoreability` | the same intake-time features as training, in the same order |
| `lib/model/registry.server.ts` | `loadScoringModel`, `scoreEpisodes`, `riskBand` | scores eligible open stays; golden vectors from the trainer are replayed in `tests/model-parity.test.ts` |
| `lib/metrics/registry.ts` | `metric(id)`, `allMetrics()` | one definition per figure (meaning, unit, formula, window, sample, limitation, source) |
| `lib/planner.ts` | `buildPlan`, `scenarioAdoptions`, `buildCsv`, `csvCell` | capacity-bounded outreach plan; uplift in percentage points capped at 100 %; CSV cells escaped against formula injection |
| `lib/shelter.server.ts` | `getShelterView`, `queueOrder`, `needsAttentionNow`, `toPublicStays` | the finished, cached view — the only module a page imports; `toPublicStays` strips every score field |

---

## 12. Conventions that hold everywhere

- **Intake-time only.** No feature uses information from after the animal arrived.
- **Temporal splits.** Train on the past, calibrate on a later block, test on a later one still.
- **Censored ≠ negative.** Unresolved labels are `NaN` and dropped per target.
- **Counted, not dropped.** Every exclusion and rejected row appears in an audit.
- **Seeded.** `RANDOM_SEED = 20260820` throughout.
- **The use policy travels with the scores.** A high predicted long-stay risk is a
  request for more help, not less; scores must never justify euthanasia, intake
  refusal or reduced care.
