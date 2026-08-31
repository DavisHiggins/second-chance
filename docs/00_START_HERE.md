# Start here

Everything in this project, what it is for, and the order to open it in.

If you have five minutes, read section 1 and stop. If you are grading this, section
3 maps every requirement in the brief to the file that satisfies it.

---

## 1. The five minute version

**SecondChance forecasts how long an animal will wait for adoption at the Austin
Animal Center, so that limited staff attention goes where it changes an outcome.**

Nine years of records, 136,898 shelter episodes, evaluated on 20,165 animals the
model never saw.

Four findings worth defending:

1. **The standard estimator is wrong here by 72 percent.** Fifty-one percent of
   exits from this shelter are not adoptions. Treating a transfer as ordinary
   censoring, which is what the shelter analytics literature does, overstates
   30 day adoption by 23.7 percentage points. At one year it says 98.8 percent of
   arrivals are adopted; the correct figure is 48.3.
2. **Calibration failed before discrimination, and harder.** Across the 2020
   shift, mean monthly AUC went from 0.778 to 0.789. Meanwhile the model was
   predicting a 30 day adoption rate 7.6 points above what happened.
3. **The language model earns its place on one target and not the other.** It
   beats a keyword baseline by 0.012 AUC on long-stay risk, decisively, and by
   0.0003 on 30 day adoption, which is nothing.
4. **Three classes of feature will silently break a drift detector**, and the
   first version of this one fired CRITICAL in every quarter until all three were
   handled.

And one rule the whole system is built around: **a low predicted adoption
probability is a request for more help, not less.** No screen surfaces an animal
for removal, no field in the API is named anything that could be read that way,
and `tests/test_serve.py` fails the build if the use policy goes missing from a
response.

The single best artefact to open next is
**`deliverables/SecondChance_final_paper.pdf`**.

---

## 2. Reading order

### If you want to understand the work

| Order | File | Why |
|---|---|---|
| 1 | `deliverables/SecondChance_final_paper.pdf` | The whole thing, 12 pages |
| 2 | `presentation/SecondChance_Final_Presentation.pptx` | The five minute version, with a timed script beside it |
| 3 | `results/SecondChance_demo.html` | The working product, no server needed |
| 4 | `docs/01_MODEL_CARD.md` | What the model is, what it is not, and where it is worse |
| 5 | `docs/05_DECISION_LOG.md` | Every choice that could have gone the other way, including the ones that were wrong first |

### If you want to run it

| Order | File | Why |
|---|---|---|
| 1 | `README.md` | Quick start, `make all`, about 35 minutes |
| 2 | `Makefile` | Every step of the pipeline as a named target |
| 3 | `analysis/01_build_episodes.py` through `10_export.py` | The pipeline, readable top to bottom in order |
| 4 | `docs/04_DATA_DICTIONARY.md` | All 58 features, generated from the built matrix |

### If you want to deploy it

| Order | File | Why |
|---|---|---|
| 1 | `docs/02_AWS_SETUP_RUNBOOK.md` | Step by step, including the two API tokens |
| 2 | `infra/template.yaml` | The entire deployment as one SAM template |
| 3 | `docs/03_COST_MODEL.md` | $34.07 a month, with the volumes each line comes from |
| 4 | `sql/01_schema.sql` through `04_analytics.sql` | The warehouse |

### If you want to check the numbers

```bash
python3 scripts/verify_numbers.py --verbose
```

166 assertions. It reformats every headline figure the way the documents write it,
checks the string is actually present, recomputes the internal arithmetic from the
underlying curves, and refuses any JSON containing a bare `NaN`. It runs on every
push. A number edited in the paper and not in the pipeline fails there.

---

## 3. Where each requirement in the brief is satisfied

| Requirement | Where | Evidence |
|---|---|---|
| Collect data from APIs | `src/secondchance/ingest/clients.py`, `handlers.py` | Four sources: Austin intakes (Socrata `wter-evkm`), Austin outcomes (`9t4d-g238`), National Weather Service, RescueGroups v5 |
| Save to Redshift via S3 | `infra/template.yaml`, `sql/01_schema.sql` | Three-layer warehouse, append-only raw landing zone, COPY from S3 |
| Join and aggregate | `sql/02_staging.sql`, `03_episodes.sql`, `04_analytics.sql` | The episode reconstruction, plus twelve analytics views |
| Apply LLM APIs | `src/secondchance/labeling/`, `monitor/handlers.py` | 254 breed tokens structured offline; a second-opinion review on monitoring alerts |
| Train on SageMaker or EC2 | `src/secondchance/pipeline/handlers.py` | Transient training jobs, model registry, a promotion gate that does not auto-promote |
| Interpret the model | `analysis/06_interpret.py`, `docs/01_MODEL_CARD.md` | SHAP, permutation importance, partial dependence, subgroup performance |
| Monitoring and evaluation pipeline | `src/secondchance/monitor/` | Input drift, performance drift, six CloudWatch alarms, an LLM review, and a human in the loop |
| Well-commented deployable repository | all of it | 366 tests, 94 percent coverage, ruff clean under PEP 8 and PEP 257, CI on every push |
| Present results | `presentation/`, `deliverables/` | A deck with a timed script, and six documents |
| Cite correctly | `deliverables/source/06_final_paper.md` | 20 references, every one verified against the publisher's own record |

---

## 4. Every file, and what it is

### The deliverables

```
deliverables/
  SecondChance_work_plan.pdf          the Work Plan assignment
  SecondChance_literature_review.pdf  the Literature Review assignment
  SecondChance_project_outline.pdf    the Project Outline assignment
  SecondChance_paper_draft.pdf        the Project Draft assignment
  SecondChance_peer_reviews.pdf       two peer reviews  (see the note below)
  SecondChance_final_paper.pdf        the Final Paper, 12 pages, two column
  source/                             the markdown each PDF is built from
  build_docs.py                       markdown to HTML to PDF, headless Chromium
```

**One thing to fix before submitting.** The two peer reviews are written against
realistic invented manuscripts, "Manuscript A" on air-quality nowcasting and
"Manuscript B" on restaurant-inspection risk scoring, because the drafts you will
actually be assigned do not exist yet. The structure, the depth and the tone are
what a strong review looks like. **Redirect them at your real assigned papers
before you hand them in.**

### The presentation

```
presentation/
  SecondChance_Final_Presentation.pptx  10 slides
  SecondChance_Final_Presentation.pdf   the same, as a PDF
  SPEAKER_SCRIPT.md                     timed to five minutes, with cut and expand lists
  build_deck.js                         pptxgenjs, reads MEASURED_RESULTS.json
```

The speaker script is timed at roughly 150 words a minute and tells you what to cut
if you run over and what to add if you run under. Slides 4 and 9 are the two that
make the project what it is, and the script says not to cut either.

### The library

```
src/secondchance/
  episodes.py        episode reconstruction and the audit that defends it
  features.py        58 features, the cohort definition, the block structure
  modeling.py        temporal split, calibration, metrics, bootstrap comparisons
  survival.py        KM, Aalen-Johansen, Cox, discrete-time competing hazards
  plotting.py        one matplotlib style for every figure
  cli.py             the `secondchance` console script
  labeling/          breed structuring: the LLM path, the keyword baseline, the Lambda
  monitor/           drift, performance, thresholds, the weekly monitoring Lambda
  ingest/            HTTP clients and the four scheduled ingestion Lambdas
  pipeline/          warehouse rebuild, training, the promotion gate
  serve/             the prediction API, and where the use policy is enforced
```

### The analysis

Ten scripts, run in order, each writing an artefact the next one reads:

```
analysis/
  01_build_episodes.py   episode table and audit
  02_build_features.py   the 58-column matrix
  03_train_eval.py       four targets, four models, temporal split
  04_ablations.py        feature blocks, breed strategy, weather, shuffled-label control
  05_survival.py         KM, Aalen-Johansen, Cox, discrete-time hazards
  06_interpret.py        SHAP, permutation importance, partial dependence
  07_drift.py            drift detection, monitoring simulation, retraining
  08_figures.py          every figure in the paper and the deck
  09_time_features.py    the monotone calendar-time experiment
  10_export.py           MEASURED_RESULTS.json and the website fixtures
```

### The website build package

Everything Claude Code needs to build the web application from scratch:

```
website_build_package/
  CLAUDE.md                 build instructions, read this first
  PRODUCT_SPEC.md           every page, component, state and acceptance criterion
  DESIGN_SYSTEM.md          colour, type, spacing, elevation, motion tokens
  ANIMATION_SPEC.md         what moves, how far, how fast, and when it must not
  API_CONTRACT.md           endpoint shapes, error states, the offline fallback
  CONTENT.md                every string in the product, written and ready
  ACCEPTANCE_CHECKLIST.md   what "done" means
  MEASURED_RESULTS.json     the real evaluation numbers
  data/                     66 JSON files: 250 real animals, trends, segments, model summary
  build_demo.py             builds the standalone HTML demo
```

The data in there is real. 250 actual animals from the held-out test block, scored
by the trained model, with SHAP drivers computed per animal. No sample records were
invented.

### Documentation

```
docs/
  00_START_HERE.md        this file
  01_MODEL_CARD.md        intended use, performance, subgroups, limitations
  02_AWS_SETUP_RUNBOOK.md deployment, step by step
  03_COST_MODEL.md        $34.07 a month, with the arithmetic
  04_DATA_DICTIONARY.md   all 58 features, generated from the built matrix
  05_DECISION_LOG.md      every choice that could have gone the other way
  06_LLM_EVALUATION.md    what the language model did and what it was worth
```

### Everything else

```
sql/          the warehouse: schema, staging, episodes, analytics
infra/        the whole AWS deployment as one SAM template
tests/        366 tests
scripts/      publish_baseline.py, verify_numbers.py, build_data_dictionary.py
results/      MEASURED_RESULTS.json, 14 figures, 22 tables
data/         raw CSVs, the built matrices, and the breed reference
Makefile      every step of the pipeline as a named target
```

---

## 5. What you have to do yourself

Three things, and only three.

**1. Redirect the peer reviews.** See the note above. They are written against
invented manuscripts because your real assigned drafts do not exist yet.

**2. Deploy to AWS, if you want the deployed half.** Everything in the paper runs
locally with no credentials of any kind. The AWS side needs an account and about
forty minutes; `docs/02_AWS_SETUP_RUNBOOK.md` is the step by step, and the only
manual pieces are creating the two API tokens and confirming the alert email.

**3. Build the website, if you want it.** Hand `website_build_package/` to Claude
Code and point it at `CLAUDE.md`. `results/SecondChance_demo.html` is a working
standalone version if you would rather just show that.

Everything else is done. There are no blanks to fill in, and
`scripts/verify_numbers.py` checks that on every push.

---

## 6. Dates

| Deliverable | Due |
|---|---|
| Work Plan | Tuesday 25 August, 10:00 |
| Literature Review | Thursday 27 August |
| Project Outline | Tuesday 1 September |
| Project Draft | Thursday 17 September |
| Peer Reviews (two) | Thursday 24 September |
| Final paper and presentation | Tuesday 29 September |

Every one of those is built and in `deliverables/`.
