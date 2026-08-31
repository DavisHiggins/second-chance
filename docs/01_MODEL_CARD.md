# Model card: SecondChance adoption forecasting

Format follows Mitchell et al., "Model Cards for Model Reporting", FAT\* 2019.
Every number here is read from `results/MEASURED_RESULTS.json` and was measured on
a held-out temporal block, not estimated.

**Model version:** `sc-adopt30-2022-03-04-a1`
**Date:** 12 September 2026
**Owner:** Davis Higgins, DTSC 3601, University of North Carolina at Charlotte
**Contact:** davishiggins1@gmail.com
**Licence:** MIT for the code. Source data is public domain (City of Austin).

---

## 1. Model details

**What it is.** Four calibrated binary classifiers and one discrete-time survival
model, all trained on the same 56-feature intake-time matrix.

| Component | Algorithm | Predicts |
|---|---|---|
| `adopt_7d` | LightGBM + isotonic | P(adopted from this shelter within 7 days) |
| `adopt_14d` | LightGBM + isotonic | P(adopted within 14 days) |
| `adopt_30d` | LightGBM + isotonic | P(adopted within 30 days) |
| `long_stay_60d` | LightGBM + isotonic | P(still in the shelter after 60 days) |
| `survival` | Two LightGBM cause-specific hazards | Full cumulative incidence curve and expected days in care |

**Hyperparameters (classifiers):** 600 trees, learning rate 0.05, 48 leaves,
minimum 60 samples per leaf, subsample 0.85 with frequency 1, column sample 0.8,
L2 regularisation 1.0. The long-stay model additionally uses
`scale_pos_weight = 12.05`. Random seed 20260820 throughout.

**Calibration:** isotonic regression fitted on the 2019 validation block only,
with the base estimator frozen so the calibrator cannot refit it.

**Preprocessing:** median imputation with a missingness indicator and
standardisation for numeric columns; constant imputation and one-hot encoding with
a minimum category frequency of 25 for categorical columns.

---

## 2. Intended use

**Primary intended use.** Ranking animals currently in the shelter's care so that
scarce staff attention, photography, foster recruitment, behavioural support,
adoption-event slots and outreach go first to the animals the model expects to
wait longest.

**Primary intended users.** Shelter operations staff, volunteer coordinators, and
foster programme managers at the Austin Animal Center or a comparable municipal
shelter.

**Out-of-scope uses, and this list is enforced rather than advisory.**

- **Euthanasia decisions of any kind.** No score produced by this system may
  inform, justify, support, or be cited in a decision to euthanise an animal.
- **Intake refusal.** The score must not be used to decline an animal at the door.
- **Withholding or deprioritising care.** Medical treatment, behavioural support
  and daily welfare are not to be allocated by this score, in either direction.
- **Individual adoption counselling.** The model predicts population-level
  frequency. It says nothing meaningful about whether a particular adopter and a
  particular animal are a good match.
- **Public display of a score.** The public discovery page shows how long an
  animal has been waiting. It does not show a probability, because telling the
  public that an animal is statistically unlikely to be adopted harms that animal.
- **Any shelter other than the one it was trained on**, without revalidation. See
  Section 8.

**How this is enforced.** The API returns a `use_policy` object on every response
and the interface renders it on every screen that shows a score, so removing it is
a visible change to a tracked file. There is no endpoint, field, sort order or
interface state anywhere in the system that surfaces animals for removal, and
there is no "low priority" label. These are design constraints recorded in
`website_build_package/PRODUCT_SPEC.md` and checked in
`ACCEPTANCE_CHECKLIST.md`.

**Why the direction is fixed.** The prediction target is adoption, which is a
proxy for adopter demand, which is shaped by public preference, including
preferences about breed appearance that Olson et al. (2015) show are not even
reliably measured. Used to route help *toward* low-scoring animals, the system
counteracts that preference. Used to route resources *away* from them, it would
convert a public preference into a shelter decision and close a feedback loop.
Obermeyer et al. (2019) is the case study for what that failure looks like when it
happens.

---

## 3. Training data

| | |
|---|---|
| Source | Austin Animal Center Intakes (`wter-evkm`) and Outcomes (`9t4d-g238`), City of Austin Open Data Portal |
| Enrichment | Daily Austin weather (National Weather Service station record) |
| Period covered | 1 October 2013 to 4 March 2022 |
| Raw rows | 136,922 intakes; 137,221 outcomes |
| Episodes reconstructed | 136,898 |
| Modelling cohort | 128,157 |
| Training block | 87,628 episodes, 2013-10-01 to 2018-12-31 |
| Calibration block | 18,701 episodes, calendar year 2019 |

**Cohort exclusions, with counts:** 7,935 episodes that are neither dogs nor cats
(largely wildlife intakes whose outcomes are dominated by rabies-risk euthanasia
and which never enter the adoption pathway); 243 wildlife and
owner-requested-euthanasia intakes among dogs and cats; 563 episodes flagged as
suspected missing outcome records.

**Composition of the training block.** Base rates: 17.6 percent adopted within 7
days, 25.1 percent within 14, 31.8 percent within 30, and 7.7 percent still
present after 60 days.

---

## 4. Evaluation data

**Test block:** 20,165 episodes, arrivals from 1 January 2020 to 2 January 2022.
No animal in this block appears in training or calibration.

The test period was chosen deliberately to span the March 2020 change in Austin's
operations. A model evaluated only on data from its own era says nothing about
what happens when the world moves, and that is the property an operations team
most needs to know.

Base rates in the test block are higher than in training for every target (16.6,
27.6, 37.2 and 11.6 percent), which is itself a symptom of the shift.

---

## 5. Quantitative performance

### 5.1 Overall

| Target | ROC AUC | 95% CI | PR AUC | Brier | ECE | Slope | Precision@50 | Lift@50 |
|---|---|---|---|---|---|---|---|---|
| Adopt ≤ 7d | 0.827 | 0.821–0.835 | 0.480 | 0.109 | 0.022 | 0.93 | 0.72 | 4.33 |
| Adopt ≤ 14d | 0.816 | 0.811–0.823 | 0.593 | 0.150 | 0.018 | 1.01 | 0.82 | 2.97 |
| Adopt ≤ 30d | 0.803 | 0.797–0.809 | 0.674 | 0.174 | 0.023 | 0.97 | 0.94 | 2.52 |
| Long stay > 60d | 0.765 | 0.754–0.775 | 0.270 | 0.093 | 0.018 | 0.81 | 0.48 | 4.15 |

Survival: Cox concordance 0.700 held out; discrete-time model integrated Brier
score 0.0401 against 0.0458 for a Kaplan-Meier baseline, a 12.5 percent
improvement.

**Baselines.** Predicting the training base rate for every animal gives AUC 0.500
by construction. Logistic regression on the same features gives 0.800, 0.775,
0.755 and 0.766. The boosted model beats logistic regression on the three
adoption horizons and does not beat it on long stay.

### 5.2 Disaggregated performance

This is the section that matters most. Reported for the 30-day target.

| Attribute | Level | n | Observed rate | AUC | Calibration gap |
|---|---|---|---|---|---|
| Species | Cat | 8,539 | 0.327 | 0.849 | −0.015 |
| | Dog | 11,626 | 0.406 | 0.764 | −0.018 |
| Bully-type label | no | 17,535 | 0.378 | 0.807 | −0.012 |
| | **yes** | **2,630** | **0.332** | **0.754** | **−0.048** |
| Restricted-breed label | no | 15,283 | 0.364 | 0.813 | −0.006 |
| | **yes** | **4,882** | **0.397** | **0.771** | **−0.053** |
| Black in coat | no | 13,704 | 0.366 | 0.807 | −0.017 |
| | yes | 6,461 | 0.387 | 0.793 | −0.017 |
| Life stage | neonate | 5,101 | 0.219 | 0.893 | +0.017 |
| | puppy or kitten | 3,268 | 0.658 | 0.741 | −0.047 |
| | juvenile | 1,491 | 0.538 | **0.683** | −0.066 |
| | young adult | 6,039 | 0.388 | 0.704 | −0.034 |
| | adult | 2,908 | 0.285 | 0.705 | +0.005 |
| | senior | 1,358 | 0.197 | 0.721 | +0.008 |
| Intake condition | Normal | 15,817 | 0.434 | 0.774 | −0.018 |
| | Injured | 1,745 | 0.185 | **0.691** | −0.019 |
| | Sick | 1,230 | 0.185 | 0.761 | −0.025 |
| | Nursing | 824 | 0.033 | 0.963 | +0.004 |

**Known disparities, stated plainly.**

1. **The model is worse for dogs carrying a bully-type breed label** (AUC 0.754
   against 0.807) and **under-predicts their adoption chances by 4.8 points**. The
   same pattern holds, more strongly, for breeds commonly named in
   breed-specific legislation and insurance exclusions (AUC 0.771, gap −5.3
   points).

   Because the queue routes help toward low-scoring animals, under-prediction
   places these dogs higher in the queue than their true outcomes justify, which
   errs toward more attention rather than less. That is the safer of the two
   possible errors in this system. It is still an error, it is reported rather
   than corrected away, and it would be the wrong direction entirely in a system
   pointed at resource withdrawal.

2. **Breed findings are findings about a label, not about animals.** Olson et al.
   (2015) measured 50 percent average sensitivity for visual identification of
   pit-bull-type dogs against DNA across 16 raters and 120 dogs. The `breed` field
   this model consumes is a staff judgement of that reliability. Every breed
   result in this system describes how the public responds to a recorded label.

3. **Black coat colour does not slow adoption in this dataset.** Animals with
   black in the recorded coat were adopted at a marginally *higher* rate (38.7
   against 36.6 percent within 30 days) and model discrimination is essentially
   the same for both. This replicates Sinski et al. (2016). It is reported because
   a model that encoded the folk belief would begin making it true.

4. **The weakest subgroups are juveniles (AUC 0.683) and animals arriving
   injured (0.691).** Both should be treated as lower confidence, and the API
   returns a `confidence` field that reflects this.

5. **Cat long-stay prediction is the worst-calibrated subgroup measured** (AUC
   0.711, gap −2.8 points on a 14.4 percent base rate).

---

## 6. Behaviour under distribution shift

The model was frozen at its 2018 training cutoff and scored month by month across
2020 and 2021.

- **Discrimination held.** Mean monthly AUC was 0.778 before March 2020 and 0.789
  after. Worst month, July 2020, at 0.717.
- **Calibration did not.** Largest monthly calibration gap 7.6 points, in July
  2020. Through the second half of 2021 the model consistently under-predicted
  adoption as Austin's rates recovered.
- **Nine of 23 evaluable months were OK, nine WARNING, five CRITICAL** under
  thresholds fixed in advance.

**The operational implication.** Discrimination and calibration fail separately,
and here calibration failed first and harder. Monitoring AUC alone would have
shown nothing wrong for months while the numbers staff read as percentages drifted
by up to eight points.

**Retraining did not fix it.** Retraining on data through June 2020 and evaluating
on 2021 gave +0.001 AUC and made calibration worse (ECE 0.045 to 0.050), because
the calibration window was the most anomalous six months in the series. This is
the argument for a champion-versus-challenger approval gate and for choosing a
calibration window on stability rather than recency.

---

## 7. The language model component

**What it does.** Converts Austin's 2,736 distinct free-text breed strings into
structured attributes, by splitting on Austin's own convention into 254 atomic
breed tokens and labelling each once.

**Model:** Claude (Anthropic), `anthropic.claude-3-5-sonnet-20241022-v2:0` through
Amazon Bedrock, temperature 0. The prompt is stored verbatim in
`src/secondchance/labeling/breed_llm.py` and the output is committed to
`data/reference/breed_attributes_llm.psv`, versioned by prompt hash.

**Coverage:** resolves 100 percent of dog and cat breed strings in the cohort.

**Measured value, honestly split.** Against a hand-written keyword baseline, the
language model gains +0.0122 AUC on the long-stay target (95 percent CI 0.0082 to
0.0160, p < 0.001) and +0.0003 on the 30-day target (CI −0.0014 to 0.0022,
p = 0.73), which is nothing. Against dropping breed features entirely it gains
+0.0345 on long stay and +0.0047 on 30-day adoption, both p < 0.001.

**Interpretation.** The extra machinery earns its place for predicting who is
still here in two months and does not earn it for predicting a fast adoption. A
regular expression is sufficient for the second question.

**Governance.** The `bsl_risk` flag records that a breed is commonly named in
United States breed-specific legislation or insurance exclusions. It is a fact
about the housing market, not about an animal's temperament, and it is present so
the model can account for a real barrier adopters face. It must never be read as a
statement about an individual animal.

**Human review requirement.** Any refresh of the reference table requires a human
to audit a sample before the new labels reach production. The audit table is
`analytics.labeling_audit` in the warehouse schema.

---

## 8. Limitations

- **No behavioural data.** Protopopova et al. (2014) found in-kennel behaviours
  worth 15 to 30 days of length of stay. None appear in any public export. This is
  the ceiling on what an administrative-record model can achieve.
- **Breed is a staff guess** with measured 50 percent sensitivity.
- **One shelter, unusual policy.** Austin is the largest no-kill municipal shelter
  in the United States and 29 percent of its exits are transfers to rescue
  partners. The competing-risks correction would have a different magnitude
  elsewhere, though the same direction. **Do not deploy this model at another
  shelter without retraining and revalidating.**
- **Intervention effects are assumptions, not measurements.** The system can show
  that its queue finds long-stay animals 4.2 times better than chance. It cannot
  show, from this data, what happens when a shelter acts on the queue. The
  photography channel in particular has no evidentiary basis here, because
  Austin's export contains no photograph field, and the interface labels it as an
  assumption.
- **Administrative censoring at one year** is a modelling choice that affects the
  tail of the survival curves.
- **A feedback loop exists and cannot be engineered away.** A deployed queue
  changes which animals get help, which changes their outcomes, which becomes the
  next training set. Monitoring should watch for the distributional signature of
  it: a narrowing gap between predicted and observed outcomes for the groups the
  queue targets most.

---

## 9. Ethical considerations

**Who could be harmed.** Animals, if the score is used to reduce what they
receive. That is the entire risk surface of this system and it is why Section 2 is
written as a constraint rather than a recommendation.

**Whose interests are represented.** The shelter's operations staff, whose
allocation problem this solves, and the animals, whose interest is served only if
the direction of the intervention is fixed. Adopters are not represented; the
model does not attempt to match animals to people.

**What the model is a proxy for.** Adopter demand. Demand incorporates public
preference about appearance and breed label. A system that routes help toward
animals the public prefers less is counteracting that preference; one that routes
resources away from them would launder it into policy.

**Fairness framing.** The relevant protected attributes here are attributes of
animals, not people, so the usual fairness formalisms do not transfer directly.
What does transfer is the requirement to measure and report performance
separately for the groups a decision affects, which Section 5.2 does.

---

## 10. Maintenance

| | |
|---|---|
| Retraining cadence | Weekly evaluation, retrain on a triggered basis, never automatic promotion |
| Approval | Human approval required before a new model serves traffic (`ModelApprovalMode` defaults to `Manual`) |
| Monitoring | Weekly job publishing PSI, rolling AUC, calibration gap, data freshness |
| Alarm thresholds | PSI 0.10 warning / 0.25 critical; AUC relative drop 3 percent / 7 percent; calibration gap 5 points / 10 points |
| Rollback | Previous model package remains registered; endpoint update is a single SAM parameter change |
| Card review | Whenever the model version changes, or quarterly, whichever comes first |

**What is monitored, and what deliberately is not.** Nineteen animal-level
features are monitored with the population stability index. Three classes are
excluded, each for a measured reason documented in `analysis/07_drift.py`:
features monotone in calendar time (unbounded PSI by construction),
shelter-level covariates that are near-constant within a window (PSI compares two
point masses and saturates), and deterministic functions of the calendar (the
season is not drift). Shelter-level covariates are monitored as level changes
instead.

---

## 11. Citation

```
Higgins, D. (2026). SecondChance: competing-risk survival forecasting of
shelter adoption, with calibration and drift monitoring, on nine years of
Austin Animal Center records. DTSC 3601, University of North Carolina at
Charlotte.
```

## 12. References cited in this card

- Mitchell, M. et al. (2019). Model cards for model reporting. *FAT\* '19*. DOI: 10.1145/3287560.3287596
- Obermeyer, Z. et al. (2019). Dissecting racial bias in an algorithm used to manage the health of populations. *Science* 366(6464), 447-453.
- Olson, K. R. et al. (2015). Inconsistent identification of pit bull-type dogs by shelter staff. *The Veterinary Journal* 206, 197-202.
- Protopopova, A. et al. (2014). In-kennel behavior predicts length of stay in shelter dogs. *PLOS ONE* 9(12), e114319.
- Sinski, J., Carini, R. M. and Weber, J. D. (2016). Putting (big) black dog syndrome to the test. *Anthrozoös* 29(4).
