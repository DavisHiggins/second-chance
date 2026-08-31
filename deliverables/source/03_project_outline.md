# Project Outline

<div class="doc-header">
<p>DTSC 3601: Data Science Studio 3, Predictive Analysis and Their Impacts</p>
<p><strong>SecondChance: shelter adoption forecasting for the Austin Animal Center</strong></p>
<p>Davis Higgins &nbsp;&middot;&nbsp; Submitted Tuesday, September 1, 2026</p>
</div>

**Working title of the paper:** SecondChance: competing-risk survival forecasting
of shelter adoption, with calibration and drift monitoring, on nine years of
Austin Animal Center records

**Author:** Davis Higgins, Department of Data Science, University of North
Carolina at Charlotte

---

## Abstract

Municipal animal shelters allocate photography, foster recruitment, behavioural
support and outreach by intuition, and animals that nobody happens to notice wait
months. SecondChance predicts, at the moment an animal arrives, how long it will
wait: the probability of adoption within 7, 14 and 30 days, the probability of
becoming a long-stay resident past 60 days, and the full curve in between. It is
built on 136,898 shelter episodes reconstructed from nine years of public Austin
Animal Center intake and outcome records, deployed as a serverless AWS pipeline,
and monitored for both input drift and performance decay.

The paper makes four claims. First, that shelter duration must be modelled as a
competing-risks survival problem, and that the standard approach overstates
30-day adoption by 23.7 percentage points, a 72 percent relative error, because
it treats transfers and returns to owner as if the animal were still waiting to
be adopted. Second, that a gradient boosted model on intake-time features alone
reaches a held-out ROC AUC of 0.803 for 30-day adoption and 0.765 for 60-day
long-stay risk, with an expected calibration error of 0.023, evaluated on 20,165
animals who arrived after the model's training window closed. Third, that
structuring free-text breed strings with a language model measurably improves
long-stay prediction over a keyword baseline, and measurably does not improve
30-day adoption prediction, a distinction the paper reports rather than
smoothing over. Fourth, that the March 2020 change in Austin's operations
degraded the model's calibration without degrading its ranking, which is a
failure mode that a monitoring setup watching only discrimination would miss
entirely.

The system carries a hard constraint enforced in code as well as in prose: the
score routes help toward animals and must never be used to justify euthanasia,
intake refusal, or reduced care.

---

## 1. Introduction

**The problem.** The Austin Animal Center takes in roughly 16,000 animals a year
and is the largest no-kill municipal shelter in the United States. Its scarce
resource is not kennel space so much as attention: someone to photograph an
animal well, someone to recruit a foster, someone to write a profile that makes
a person stop scrolling. That attention is currently allocated by whoever
notices, and the animals nobody notices are the ones who wait.

**Why this is a prediction problem.** If, on the day an animal arrives, you could
say "this one will probably go home this week, this one probably will not be gone
in two months", the allocation becomes tractable. That is a forecasting question
with a clean label attached, because Austin publishes both its intake and its
outcome records and the two can be joined on animal ID.

**Why it is harder than it looks.** Three complications, each of which the
existing applied literature handles badly or not at all:

1. **Censoring.** An animal still in the shelter on the day the data was pulled
   has not failed to be adopted. Treating that as a negative label biases the
   whole model.
2. **Competing risks.** An animal transferred to a rescue partner cannot
   subsequently be adopted from Austin. It is not a slow adoption; it has left
   the risk set. Roughly half of all exits in this data are not adoptions.
3. **Leakage.** The outcome record contains the animal's sex and age at exit.
   Austin sterilises before adoption, so sex at outcome nearly announces the
   answer. A model that touches it looks excellent and is useless.

**What this paper contributes.**

- A reproducible episode construction from two event logs, with a full audit of
  every join decision.
- A direct measurement of how much the standard estimator overstates adoption in
  this dataset.
- Four calibrated prediction targets evaluated on a strictly temporal split
  that spans a known regime change, with subgroup performance reported.
- An evaluation of language-model breed structuring against a keyword baseline
  and against dropping breed entirely.
- A deployed serverless pipeline with drift and performance monitoring, and a
  measurement of what retraining does and does not recover.

---

## 2. Related work

Four strands, treated in full in the literature review submitted in Week 2 and
condensed here.

**What predicts a shelter stay.** Lepper, Kass and Hart (2002) established the
feature set on 8,114 Sacramento animals. Protopopova et al. (2014) showed with
video observation of 289 dogs that in-kennel behaviour predicts length of stay
with effects measured in weeks, and that preferred morphology shortens stays
independently of behaviour. Janke et al. (2017) established that cats behave
differently from dogs. Bradley and Rajendran (2021) is the closest machine
learning work: 114,256 records from five states, gradient boosting best at
roughly 60 percent across precision, recall and F1.

**How duration should be measured.** Austin, Lee and Fine (2016) give the
competing-risks framework and explain why the naive estimator overstates the
event of interest. Graf et al. (1999) give the censoring-weighted Brier score.
Mavrovouniotis (2026) brings the survival argument into the shelter domain
itself, showing that the length-of-stay statistic shelters actually report is
directionally misleading, with worked Orange County examples.

**How reliable the inputs are.** Olson et al. (2015) compared visual breed
identification against DNA for 120 dogs across 16 raters and found 50 percent
average sensitivity for identifying pit bull-type dogs. Sinski et al. (2016)
tested the black dog folk belief and did not find support for it.

**How to deploy and govern.** Sculley et al. (2015) on the infrastructure being
the real system. Lundberg and Lee (2017) on per-prediction attribution. Mitchell
et al. (2019) on model cards and disaggregated reporting. Obermeyer et al. (2019)
on an accurate model causing harm through its choice of target.

**The gap.** The applied shelter work predicts with methods that assume complete
observation and a single exit type. The statistical work that gets the
measurement right does not predict. Neither side reports calibration or subgroup
performance, and nobody evaluates across the 2020 regime change.

---

## 3. Methods

### 3.1 Data

Two public Socrata feeds from the City of Austin: intakes (`wter-evkm`) and
outcomes (`9t4d-g238`), covering 1 October 2013 to 4 March 2022, 136,922 and
137,221 rows respectively. Daily Austin weather observations as a fourth feature
block. RescueGroups.org listings for regional supply context on the public
discovery page.

### 3.2 Episode construction

The two feeds are event logs with no episode key, and about one animal in eleven
returns. Within each animal, the k-th intake is closed by the earliest outcome at
or after it and strictly before the (k+1)-th intake. Every rejection is counted.
The audit table reports rows in, duplicates dropped, episodes built, episodes
matched, episodes left open, candidate matches rejected, negative durations, and
species mismatches.

### 3.3 Features

56 features in five blocks, every one of them knowable at the intake desk: animal
attributes, intake context, shelter occupancy at arrival, structured breed
attributes, and weather. The leakage boundary is enforced by an explicit
allow-list, and verified by a shuffled-label control.

### 3.4 The language model step

Austin records breed as free text: 2,736 distinct strings, of which 1,651 are
needed to cover 99 percent of dog episodes. Splitting on Austin's own convention
reduces this to 254 atomic breed tokens, which a language model labels once with
eleven structured attributes. The paper compares this against a keyword baseline
and against no breed features at all, on both targets, with a paired bootstrap.

### 3.5 Models

Temporal split throughout: train on arrivals through 2018, calibrate on 2019,
test on 2020 to 2022. Baselines are the training base rate and a logistic
regression. The candidate models are LightGBM and XGBoost. Probabilities are
calibrated with isotonic regression fitted on the validation block only.

For the survival side: cause-specific Kaplan-Meier, Aalen-Johansen cumulative
incidence, a penalised Cox proportional hazards model, and a discrete-time
gradient boosted hazard model that estimates both cause-specific hazards jointly
and composes them into a properly normalised cumulative incidence.

### 3.6 Evaluation

Discrimination by ROC AUC and average precision, with 95 percent percentile
bootstrap intervals. Calibration by expected calibration error, calibration slope
and intercept, and reliability curves. Operational value by precision and lift at
queue depths of 20, 50 and 100. Survival models by Harrell's concordance and the
censoring-weighted integrated Brier score. Model comparisons by paired bootstrap
of the AUC difference. Subgroup metrics by species, life stage, sex, intake type,
intake condition, breed group, and two breed labels.

### 3.7 Deployment and monitoring

A serverless AWS pipeline: scheduled ingestion into an S3 landing zone, Glue and
Redshift Serverless for the joins, SageMaker for training and serving, API
Gateway and Lambda for the API, Kinesis Firehose for prediction logging, and a
weekly monitoring job publishing CloudWatch metrics behind alarms. Input drift by
population stability index and Kolmogorov-Smirnov, performance drift by rolling
AUC and calibration gap against a validated baseline.

---

## 4. Results

The results section will report, in this order:

1. **The data audit.** 136,898 episodes from 274,143 published rows; 99.1 percent
   closed; 622 flagged as suspected missing outcomes by a data-derived threshold.
2. **The estimator comparison.** Cause-specific Kaplan-Meier against
   Aalen-Johansen at seven horizons, with the size of the overstatement at each.
3. **Prediction performance.** Four targets, four models, held-out ROC AUC, PR
   AUC, Brier, expected calibration error, calibration slope, and precision and
   lift at three queue depths, with bootstrap intervals and paired comparisons.
4. **Feature ablations.** The cumulative contribution of each block on both
   targets, and the three-way breed strategy comparison.
5. **The weather negative result.** Reported because a fourth data source that
   does not help is a finding, not something to quietly drop.
6. **Survival results.** Cox hazard ratios per standard deviation, concordance on
   the held-out block, the discrete-time model's integrated Brier score against a
   Kaplan-Meier baseline, and decile calibration of the predicted cumulative
   incidence.
7. **Interpretability.** SHAP and permutation importance side by side, their rank
   agreement, the age partial dependence curve, and three worked per-animal
   explanations.
8. **Subgroup performance.** Where the model is weaker and where it is
   miscalibrated, including the two breed labels and the black coat test.
9. **Drift and monitoring.** Input drift by quarter against a fixed reference and
   year over year, the monthly performance timeline across March 2020, the lead
   time of the input signal over the outcome signal, the false alarm rate on a
   stable period, and the measured effect of retraining.
10. **A methodological finding about the monitoring itself.** Three classes of
    feature that make a population stability index detector useless, why, and what
    to use instead for each.

---

## 5. Conclusion and discussion

The discussion will make four points and then state the limits honestly.

**The competing-risks correction is not optional.** In this dataset the standard
approach overstates 30-day adoption by 23.7 points. Any shelter reporting a
Kaplan-Meier adoption curve is reporting a number that is wrong in a predictable
direction.

**Calibration and discrimination fail separately, and calibration fails first.**
Across the 2020 regime change the model's ranking held while its probabilities
drifted by up to 7.6 points. A monitoring setup watching AUC alone would have
seen nothing wrong for months.

**The language model earned its place on one target and not the other.**
Structured breed attributes are worth 0.035 AUC on long-stay risk and
statistically nothing over a keyword baseline on 30-day adoption. Reporting only
the flattering half would have been the easy thing to do.

**The direction of the intervention is a design decision, not a disclaimer.** The
same model that ranks animals for extra help could rank them for less. The API,
the interface and the model card are all built so that the second use is
difficult, and the paper argues that this is the minimum standard for a
prediction system pointed at a living animal.

**Limitations.** No behavioural data, which Protopopova et al. show is where the
remaining signal is. Breed is a staff guess with measured 50 percent sensitivity.
One shelter, in one city, with an unusual no-kill policy. The intervention effects
in the outreach planner are assumptions, not measurements, and are labelled as
such in the interface. And the feedback loop is real: a deployed queue changes
which animals get help, which changes next year's training data.

**Future work.** Adding a photograph quality signal, which is the largest missing
feature and is in principle recoverable from listing images. Extending to a second
shelter to test transfer. And a prospective evaluation, which is the only way to
learn whether the queue actually changes outcomes rather than merely predicting
them.

---

## 6. Deliverables and status

| Deliverable | Status |
|---|---|
| Data pipeline and episode audit | Complete |
| Feature engineering with leakage controls | Complete |
| Language model breed structuring and its evaluation | Complete |
| Four classification targets, four models, calibrated | Complete |
| Survival analysis with competing risks | Complete |
| Interpretability | Complete |
| Drift and monitoring analysis | Complete |
| AWS infrastructure as code | Complete, deployment pending |
| Website | Build package complete, front end in progress |
| Paper draft | Due Week 5 |
| Final paper and presentation | Due Week 7 |
