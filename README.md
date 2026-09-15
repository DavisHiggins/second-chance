# SecondChance

Forecasting how long an animal will wait for adoption at the Austin Animal
Center, so that limited staff attention goes where it changes an outcome.

Nine years of records. 136,898 shelter episodes. Every number below was measured
on 20,165 animals the model never saw, and every one of them is reproducible from
this repository with `make all`.

**The one rule this system is built around:** a low predicted adoption probability
is a request for more help, not less. Nothing here ranks animals by how little
they are worth spending time on, no screen surfaces an animal for removal, and the
use policy ships in every API response. The founding paper in this literature
framed exactly this prediction problem as adoption versus euthanasia, and that is
precisely the thing this project is built not to be.

---

## What it does

Three predictions from what is knowable at the intake desk, before anyone has
watched the animal:

| Question | Answer |
|---|---|
| Will it go home this week? | 7, 14 and 30 day adoption probability |
| Will it still be here in two months? | Long-stay risk |
| What does the whole wait look like? | A competing-risk survival curve |

Those feed a ranked queue of the animals most likely to become long-stay
residents, with the intervention each one needs: photography, foster placement,
medical and behaviour support, breed-specific rescue outreach, a senior adoption
event.

## Four findings worth defending

**1. The standard estimator is wrong here, by a lot.** Fifty-one percent of exits
from this shelter are not adoptions. An animal transferred to a rescue partner on
day three cannot be adopted from Austin on day thirty; it has left the risk set
entirely. Treat that as ordinary censoring, which is what the shelter analytics
literature does, and 30 day adoption is overstated by 23.7 percentage points, a
72 percent relative error. By one year the naive estimator says 98.8 percent of
arrivals are adopted. The correct figure is 48.3. Those two numbers describe
different shelters.

**2. Calibration failed before discrimination, and harder.** The model was frozen
on 2018 data and then met March 2020. Its ability to rank animals barely moved:
mean monthly AUC 0.778 before, 0.789 after. What broke was the numbers. In July
2020 it predicted a 30 day adoption rate 7.6 points above what happened. A
dashboard watching AUC alone would have shown a healthy model for months.

**3. The language model earns its place on one target and not the other.** A
structured breed reference built by an LLM beats a hand-written keyword baseline
by 0.012 AUC on long-stay risk, decisively. On 30 day adoption it beats it by
0.0003, which is nothing. Reporting only the flattering half would have been easy.

**4. Three classes of feature will silently break a drift detector.** Features
monotone in calendar time have an unbounded PSI against any earlier reference.
Shelter-level covariates are near constant within a period, so their PSI saturates
on an ordinary month. Calendar-cycle features drift quarter over quarter by
construction. All three are handled explicitly rather than tuned around, and the
first are excluded from the deployed model entirely.

## Headline results

Strictly temporal split: train through 2018, calibrate on 2019, test on 2020 to
January 2022, deliberately across the 2020 break.

| Target | Base rate | AUC | 95% CI | ECE | lift@50 |
|---|---|---|---|---|---|
| Adopted within 7 days | 16.6% | **0.827** | 0.821 to 0.835 | 0.022 | 4.33 |
| Adopted within 14 days | 27.6% | **0.816** | 0.811 to 0.823 | 0.018 | 2.97 |
| Adopted within 30 days | 37.2% | **0.803** | 0.797 to 0.809 | 0.023 | 2.52 |
| Long stay past 60 days | 11.6% | **0.765** | 0.754 to 0.775 | 0.018 | 4.15 |

The last column is the one a shelter director would ask for. The top 50 of the
long-stay queue contains 4.2 times as many true long-stay animals as a random 50;
48 percent of that top 50 really did stay past sixty days, against a base rate of
11.6.

**The leakage control:** train the entire model on randomly shuffled labels. It
comes back at 0.5023. Nothing in the 56 features encodes the outcome.

---

## Quick start

```bash
make setup      # install the package and dev dependencies
make data       # download the raw CSVs, about 40 MB, once
make all        # reproduce every number, figure, PDF and the demo site
```

About 35 minutes on two cores. Random seed 20260820 throughout, so a second run
produces the same numbers to the last decimal place.

`make help` lists every target. The pipeline is a chain of ten plain scripts, so a
step that fails can be fixed and rerun on its own:

```bash
make episodes      # 01  reconstruct episodes from the two event logs
make features      # 02  build the 58-column feature matrix
make train         # 03  four targets, four models
make ablations     # 04  feature blocks, breed, weather, shuffled-label control
make survival      # 05  Kaplan-Meier, Aalen-Johansen, Cox, discrete hazard
make interpret     # 06  SHAP, permutation importance, partial dependence
make drift         # 07  drift detection, monitoring, retraining
make timefeatures  # 09  the monotone calendar-time experiment
make figures       # 08  every figure
make export        # 10  MEASURED_RESULTS.json and the website fixtures
```

### The command line tool

```bash
secondchance audit --intakes data/raw/aac_intakes_20220304.csv \
                   --outcomes data/raw/aac_outcomes_20220304.csv

secondchance build --intakes data/raw/aac_intakes_20220304.csv \
                   --outcomes data/raw/aac_outcomes_20220304.csv \
                   --weather data/raw/austin_weather_USW00013958.csv \
                   --output data/interim/features.parquet

secondchance train --features data/interim/features.parquet \
                   --target adopted_within_30d --model lightgbm
```

`secondchance train` applies the same cohort definition the paper uses and
reproduces the results table exactly: AUC 0.8028, ECE 0.0230, Brier 0.1737.

---

## Layout

```
src/secondchance/      the library. Everything with a number in it is here.
  episodes.py            episode reconstruction, and the audit that defends it
  features.py            58 features, the cohort definition, the block structure
  modeling.py            split, calibration, metrics, bootstrap comparisons
  survival.py            KM, Aalen-Johansen, Cox, discrete-time competing hazards
  labeling/              structured breed attributes: the LLM path and its baseline
  monitor/               drift, performance, and the weekly monitoring Lambda
  ingest/                clients and Lambdas for the four public data sources
  pipeline/              warehouse rebuild, training, the promotion gate
  serve/                 the prediction API, and where the use policy is enforced
  cli.py                 the console script

analysis/              ten scripts, run in order, that produce every number
tests/                 366 tests
sql/                   the warehouse: schema, staging, episodes, analytics
infra/template.yaml    the whole AWS deployment as one SAM template
scripts/               publish_baseline.py, verify_numbers.py

deliverables/          six documents, built to PDF from markdown
presentation/          the deck and a timed speaker script
website_build_package/ everything needed to build the web application
docs/                  model card, runbook, cost model, data dictionary, decision log
results/               MEASURED_RESULTS.json, figures, tables
```

### Where the numbers live

`results/MEASURED_RESULTS.json` is the single source of truth. The paper, the
deck, the model card and the website all read from it, and none of them contains a
number typed in by hand.

That is checked rather than promised:

```bash
python3 scripts/verify_numbers.py --verbose
```

It reformats every headline figure the way the documents write it, asserts the
string is actually present, recomputes the internal arithmetic, and refuses any
JSON containing a bare `NaN`. It runs on every push. A number edited in the paper
and not in the pipeline fails there.

---

## The deployed system

Four public APIs on a schedule into an append-only S3 landing zone that keeps
every raw response forever. Redshift Serverless for the joins. Bedrock for any
breed token the reference has not seen, once, offline, into a versioned file a
human reviews before it reaches production. SageMaker for training, every model
registered against its data cutoff and its feature hash. An API where every
response carries the model version, the data freshness and the use policy. A
weekly monitoring job behind six CloudWatch alarms.

**$34.07 a month**, because training is transient and there is no persistent
endpoint. `docs/03_COST_MODEL.md` has the line items and the receipts.

```bash
sam build --template infra/template.yaml
sam deploy --guided
```

`docs/02_AWS_SETUP_RUNBOOK.md` is the full step-by-step, including the two API
tokens and the one manual approval the design deliberately does not automate.

### What is not automated, on purpose

- **Model promotion.** The gate computes the comparison and writes down what it
  would do. A person decides. The paper documents a case where the automatic rule
  would have promoted a challenger that was better only because of the window it
  was evaluated on.
- **New breed labels.** They land in a pending file and stay there until a human
  approves them. An automated label that feeds a decision about an animal should
  not reach production because a cron job succeeded.

---

## Testing

```bash
make check      # lint, type check, and the full suite
make test       # just the tests
```

366 tests, 94 percent coverage. The ones that matter most are in
`tests/test_episodes.py`, because a wrong pairing between intake and outcome rows
is silent: the durations still look plausible, the models still train, and every
number downstream is quietly wrong.

`tests/test_serve.py` asserts the ethical constraint directly. The use policy has
to be present on every scoring response, and no field in the prediction payload
may be named anything a person could read as a removal recommendation. That is
where the promise stops being a promise and becomes something that fails a build.

---

## Limitations

Three things this project does not claim.

**No behavioural data.** Protopopova and colleagues showed that is where the
remaining signal is, and none of it exists in any public export. An AUC much above
0.80 from administrative records alone would be a leak rather than an achievement.

**Breed is a staff guess.** Olson and colleagues measured 50 percent sensitivity
against DNA for pit bull identification. The bully-type finding in this paper is a
finding about a label, not about animals.

**The queue finds the right animals; nobody has shown that acting on it changes
what happens to them.** That needs a prospective study, it is in the model card,
and it is what I would do next.

A known, measured fairness gap: dogs carrying a bully-type breed label are ranked
less accurately than other dogs (AUC 0.754 against 0.807) and the model is
under-confident about them. Because the queue routes help toward low adoption
scores, that error pushes them higher in the queue, which is the safer direction.
It is still an error and it is documented in `docs/01_MODEL_CARD.md`.

---

## Data and licence

- Austin Animal Center Intakes, City of Austin Open Data Portal, `wter-evkm`
- Austin Animal Center Outcomes, City of Austin Open Data Portal, `9t4d-g238`
- National Weather Service observations API, station KATT
- RescueGroups.org Adoptable Pet Data API

Austin's data is published under the City of Austin's open data terms. Code in
this repository is MIT licensed. The structured breed reference in
`data/reference/` was produced by a language model at temperature zero from a
versioned prompt and is documented in `docs/06_LLM_EVALUATION.md`.

**Davis Higgins, Bennett Shearin, Seth Sumter, Hunter Pace**, DTSC 3601, UNC Charlotte.
