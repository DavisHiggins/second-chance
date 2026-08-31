# Project Draft

<div class="doc-header">
<p>DTSC 3601: Data Science Studio 3, Predictive Analysis and Their Impacts</p>
<p><strong>SecondChance: competing-risk survival forecasting of shelter adoption at the Austin Animal Center</strong></p>
<p>Davis Higgins &nbsp;&middot;&nbsp; Submitted Thursday, September 17, 2026</p>
</div>

> **Note to reviewers.** This is the Week 5 draft. The data pipeline, the four
> prediction models, the survival analysis, the interpretability work and the
> monitoring study are complete and every number below is measured. Two things
> are still in progress and are flagged where they appear: the deployed SageMaker
> endpoint (the models currently run as transient training jobs) and the front
> end (the build package and the exported data are done, the React application is
> not). I would most value feedback on Sections 4.2 and 4.9, which are the two
> results I think are the most consequential and the two I am least certain I
> have framed correctly.

---

## Abstract

Municipal animal shelters allocate photography, foster recruitment and outreach
by intuition, and the animals nobody happens to notice wait months. SecondChance
predicts, at the moment an animal arrives, the probability of adoption within 7,
14 and 30 days and the probability of becoming a long-stay resident past 60 days.
It is built on 136,898 shelter episodes reconstructed from nine years of public
Austin Animal Center records.

Four findings. First, shelter duration must be treated as a competing-risks
problem: because 51.3 percent of exits are not adoptions, the cause-specific
Kaplan-Meier estimator the field uses overstates 30-day adoption by 23.7
percentage points, a 72 percent relative error that reaches 104 percent by one
year. Second, gradient boosting on intake-time features alone reaches a held-out
ROC AUC of 0.803 for 30-day adoption and 0.765 for 60-day long-stay risk with an
expected calibration error of 0.023, on 20,165 animals who arrived after the
training window closed; the top 50 of the long-stay queue contains 4.2 times as
many true long-stay animals as a random 50. Third, structuring free-text breed
strings with a language model improves long-stay prediction over a keyword
baseline by 0.012 AUC (p < 0.001) and does not measurably improve 30-day adoption
prediction (+0.0003, p = 0.73). Fourth, the March 2020 change in Austin's
operations degraded the model's calibration while leaving its ranking intact, a
failure mode that monitoring discrimination alone would have missed.

---

## 1. Introduction

The Austin Animal Center takes in roughly 16,000 animals a year and is the
largest no-kill municipal shelter in the United States. Its binding constraint is
not kennel space but attention: somebody has to photograph an animal well, write
a profile worth reading, recruit a foster, or notice that a dog has been in the
same run since February. That attention is finite and is currently allocated by
whoever happens to notice.

A reliable estimate of how long each arriving animal will wait turns that into a
tractable allocation problem: work the top of a ranked list rather than the
animals nearest the front desk. Austin publishes both its intake and its outcome
records, and the two join on animal ID, which makes this a rare case where an
operational problem has a public, complete, nine-year dataset attached.

The problem is harder than it looks in three ways the applied literature has
largely not addressed.

**Censoring.** An animal still in the shelter when the export was cut has not
failed to be adopted; we do not know yet. Assigning it a negative label corrupts
the training set in a direction that flatters the model.

**Competing risks.** An animal transferred to a rescue partner can never
subsequently be adopted from Austin. It has left the risk set rather than had a
slow adoption. Roughly half of all exits in this data are not adoptions.

**Leakage.** The outcome record carries sex and age at exit. Austin sterilises
before adoption, so sex at outcome nearly announces the label. A model that
touches it scores brilliantly and predicts nothing knowable at the intake desk.

This draft describes a system that handles all three, evaluates across a real
regime change rather than around it, and carries a governance constraint that
shapes the design rather than decorating the conclusion: the score routes help
toward animals and must never be used to justify euthanasia, intake refusal or
reduced care.

---

## 2. Related work

**What predicts a shelter stay.** Lepper, Kass and Hart [1] established the
feature set on 8,114 Sacramento animals in 2002: age, sex, coat colour, reason
for relinquishment, breed and purebred status. Their framing, adoption versus
euthanasia, belongs to an era of shelter operation this project deliberately does
not model. Protopopova et al. [2] recorded 1,766 video observations of 289 dogs
and found in-kennel behaviours that lengthen stays by weeks, and separately that
preferred morphology (small, long coated, lap dog type) shortens them
independently of behaviour. Their behavioural variables are exactly what no
public export contains, which bounds what any administrative-record model can
reach. Janke et al. [3] showed cats differ enough from dogs to warrant separate
treatment.

Bradley and Rajendran [4] is the closest machine learning work: 114,256 records
from five states, gradient boosting best at roughly 60 percent across precision,
recall and F1. They treat length of stay as classification into duration buckets,
which discards both censoring and competing risks, and report neither calibration
nor subgroup performance.

**How duration should be measured.** Austin, Lee and Fine [5] give the
competing-risks framework and the reason the naive estimator overstates the event
of interest. Graf et al. [6] give the censoring-weighted Brier score.
Mavrovouniotis [7] brings the survival argument into the shelter domain itself,
showing the length-of-stay statistic shelters publish is directionally
misleading, and translating a corrected 37.6 percent increase in Orange County
into three to four full-time positions.

**How reliable the inputs are.** Olson et al. [8] compared visual breed
identification against DNA across 16 raters and 120 dogs: 67 to 78 percent median
agreement, and 50 percent average sensitivity for identifying pit-bull-type dogs.
Sinski et al. [9] tested the black dog folk belief and found no support for it.

**How to deploy and govern.** Sculley et al. [10] on the infrastructure being the
real system. Lundberg and Lee [11] on per-prediction attribution. Mitchell et al.
[12] on model cards and disaggregated evaluation. Obermeyer et al. [13] on an
accurate model causing harm through its choice of target.

**The gap.** The applied shelter work predicts with methods that assume complete
observation and one exit type. The statistical work that measures correctly does
not predict. Neither reports calibration or subgroup performance, and nobody
evaluates across the 2020 discontinuity.

---

## 3. Methods

### 3.1 Data and episode construction

Two public Socrata feeds from the City of Austin: Intakes (`wter-evkm`, 136,922
rows) and Outcomes (`9t4d-g238`, 137,221 rows), covering 1 October 2013 to 4
March 2022. Daily Austin weather from the National Weather Service forms a fourth
feature block.

Neither feed carries an episode key, and 11,114 animals (9.1 percent) appear more
than once, so a join on animal ID alone produces a cross product whose durations
look plausible. We align sequences within each animal instead: the *k*-th intake
is closed by the earliest outcome at or after it and strictly before the
(*k*+1)-th intake.

The audit: 24 duplicate intake rows and 17 duplicate outcome rows dropped;
136,898 episodes built; 135,669 (99.10 percent) closed; 42 candidate matches
rejected because the outcome fell on or after the animal's next arrival; zero
negative durations; zero species mismatches; 1,535 outcome rows never claimed, of
which 1,466 precede that animal's first recorded intake.

**Censoring versus missing paperwork.** 1,229 episodes never closed. An intake in
2015 with no outcome by 2022 is a missing form, not an animal that lived at the
shelter for seven years. We compare each open duration against the 99.5th
percentile of observed stays, which the data puts at 289.08 days, and flag 622
episodes as suspected missing outcomes. Before this correction, never-closed
episodes accumulated into the shelter-occupancy feature and produced a phantom
population of several hundred animals by the end of the series.

### 3.2 Cohort and split

Excluding 7,935 non-dog-and-cat episodes (largely wildlife, whose outcomes are
dominated by rabies-risk euthanasia), 243 wildlife and owner-requested-euthanasia
intakes, and 563 flagged episodes leaves 128,157. The split is strictly temporal:
train on 87,628 arrivals through December 2018, calibrate on 18,701 arrivals in
2019, test on 20,165 arrivals from January 2020 to January 2022. The test block is
placed deliberately across the March 2020 discontinuity.

### 3.3 Features and the leakage boundary

Fifty-six features in five blocks, every one knowable at the intake desk. The
boundary is enforced by an explicit allow-list rather than by remembering. The
one apparent exception is the shelter-occupancy block, which uses other animals'
exit timestamps to compute how full the building was on the day this animal
arrived, which a kennel manager could count.

**Verification.** Training the full model on randomly permuted labels returns a
held-out ROC AUC of **0.5023**.

### 3.4 Structuring breed with a language model

Austin records breed as free text: 2,736 distinct strings, 1,651 of them needed
to cover 99 percent of dog episodes. Splitting on Austin's own convention
(slash-separated components, optional `Mix` suffix) collapses this to **254
atomic breed tokens**, which a language model labels once at temperature 0 with
eleven structured attributes: AKC group, size class, typical adult weight, coat
length, grooming need, energy level, and boolean flags for bully type,
brachycephaly, guardian origin, breed-specific-legislation risk and recognised
purebred status. The reference resolves **100 percent** of dog and cat breed
strings in the cohort. We compare it against a good-faith keyword baseline and
against dropping breed entirely.

### 3.5 Models and evaluation

Baselines are the training base rate and logistic regression; candidates are
LightGBM and XGBoost, all through an identical preprocessor. Probabilities are
calibrated with isotonic regression fitted on the validation block only.

For survival: cause-specific Kaplan-Meier, Aalen-Johansen cumulative incidence, a
penalised Cox model with 27 covariates, and a discrete-time gradient boosted
hazard model that estimates both cause-specific hazards jointly (769,435
person-period rows across 35 bins) and composes them into a properly normalised
cumulative incidence.

Discrimination by ROC AUC and average precision with bootstrap intervals;
calibration by expected calibration error, slope and intercept; operational value
by precision and lift at queue depths of 20, 50 and 100; survival by Harrell's
concordance and the censoring-weighted integrated Brier score; model comparisons
by 1,000-sample paired bootstrap.

### 3.6 Deployment *(in progress)*

The pipeline is written as serverless AWS infrastructure as code: scheduled
Lambda ingestion into a versioned encrypted S3 landing zone, Glue and Redshift
Serverless for the joins, SageMaker for training and serving, API Gateway and
Lambda for the API, Kinesis Firehose for prediction logging, and a weekly
monitoring Lambda publishing CloudWatch metrics behind six alarms. The
CloudFormation template is complete and validated. The live endpoint is not yet
standing; all results below come from transient training jobs and local scoring,
which produce identical numbers.

---

## 4. Results

### 4.1 Prediction performance

| Target (base rate) | Model | AUC | 95% CI | Brier | ECE | lift@50 |
|---|---|---|---|---|---|---|
| Adopt ≤7d (16.6%) | Logistic | 0.800 | 0.792–0.808 | 0.115 | 0.019 | 4.21 |
| | **LightGBM** | **0.827** | 0.821–0.835 | 0.109 | 0.022 | 4.33 |
| | XGBoost | 0.827 | 0.820–0.834 | 0.109 | 0.012 | 5.18 |
| Adopt ≤14d (27.6%) | Logistic | 0.775 | 0.768–0.782 | 0.162 | 0.015 | 2.82 |
| | **LightGBM** | **0.816** | 0.811–0.823 | 0.150 | 0.018 | 2.97 |
| | XGBoost | 0.816 | 0.810–0.822 | 0.150 | 0.015 | 3.11 |
| Adopt ≤30d (37.2%) | Logistic | 0.755 | 0.748–0.761 | 0.192 | 0.021 | 2.26 |
| | **LightGBM** | **0.803** | 0.797–0.809 | 0.174 | 0.023 | 2.52 |
| | XGBoost | 0.800 | 0.794–0.806 | 0.175 | 0.025 | 2.36 |
| Long stay >60d (11.6%) | **Logistic** | **0.766** | 0.756–0.775 | 0.094 | 0.019 | 4.67 |
| | LightGBM | 0.765 | 0.754–0.775 | 0.093 | 0.018 | 4.15 |
| | XGBoost | 0.760 | 0.748–0.770 | 0.093 | 0.018 | 5.02 |

LightGBM beats logistic regression on all three adoption horizons (+0.027,
+0.042, +0.048, all *p* < 0.001) and does not beat it on long stay (−0.0007,
*p* = 0.82). For the rare class, a penalised linear model matches a boosted tree.

Calibration is good throughout: expected calibration error between 0.012 and
0.025 and calibration slopes between 0.80 and 1.01.

**Operational value.** 48 percent of the model's top 50 long-stay predictions
really did stay past 60 days, against a base rate of 11.6 percent, a lift of 4.2.

### 4.2 The competing-risks correction

*This is the result I would most like reviewers to scrutinise.*

Of 126,494 episodes in the survival cohort, 61,010 ended in adoption, 64,930 in a
competing exit and 554 were censored at the one-year horizon.

| Day | Cause-specific KM | Aalen-Johansen CIF | Overstatement | Relative |
|---|---|---|---|---|
| 7 | 0.258 | 0.176 | +0.082 | +47% |
| 14 | 0.410 | 0.259 | +0.151 | +58% |
| 30 | 0.566 | 0.329 | +0.237 | +72% |
| 60 | 0.771 | 0.410 | +0.361 | +88% |
| 90 | 0.875 | 0.448 | +0.427 | +95% |
| 180 | 0.956 | 0.474 | +0.482 | +102% |
| 365 | 0.988 | 0.483 | +0.504 | +104% |

The estimator in common use says 98.8 percent of animals are adopted within a
year. The correct figure is 48.3 percent.

The same error appears per prediction. Our discrete-time model, estimating only
the adoption hazard, predicts a mean 30-day adoption probability of 0.638.
Estimating both hazards and composing them properly gives 0.403. The observed
value is 0.372.

### 4.3 Who waits

Aalen-Johansen cumulative incidence of adoption by day 30: puppies and kittens
59.8 percent, juveniles 46.7, young adults 34.2, adults 25.1, neonates 21.4,
seniors 17.8. Neonates are the interesting case: 21.4 percent by day 30 but 47.8
percent by day 90, a shape consistent with the foster-then-adopt pathway rather
than with slow adoption.

Dogs reach 22.2 percent by day 7 against 10.9 percent for cats, but by day 90 the
two are within a point (45.5 against 43.6). Owner surrenders reach 47.4 percent
by day 30 against 8.8 percent for public-assist intakes.

Dogs carrying a bully-type breed label reach 25.1 percent by day 30 against 34.0
percent for others, a gap of 8.9 points. Following Olson et al. [8] this is a
finding about the label, not about the animals.

**The black coat test.** Animals with black in their recorded coat reached 34.1
percent by day 30 against 32.3 percent for animals without, and model
discrimination is essentially the same for both (0.793 against 0.807). This
replicates Sinski et al. [9] on a much larger sample. It matters because a queue
that encoded the folk belief would send more help to black animals, change their
outcomes, and change next year's training data.

### 4.4 What the model keys on

Age at intake dominates: shuffling it costs 0.101 held-out AUC, nearly three
times the next feature. Then intake condition (0.037), public-assist intake
(0.017), and whether the name was assigned by shelter staff (0.014). Austin
prefixes staff-assigned names with an asterisk, so that field encodes "nobody was
looking for this animal" for free.

The long-stay model keys on a different set: age (0.046), staff-assigned name
(0.040), name length (0.031).

The age relationship is not monotone: predicted adoption rises steeply from three
weeks to about three months, peaks, then declines through adulthood into old age.
The dip at the youngest ages is the neonatal foster pathway again.

SHAP and permutation orderings correlate at 0.61 on the 30-day target and 0.46 on
long stay. Reporting only one would make the model look more coherent than it is.

### 4.5 Feature ablations

On 30-day adoption: animal attributes 0.747, plus intake context 0.795 (+0.048,
*p* < 0.001), plus shelter occupancy 0.796 (+0.0006, *p* = 0.63, nothing), plus
breed structure 0.800 (+0.0047, *p* < 0.001). On long stay the ordering differs:
0.723, 0.741, 0.732 (occupancy *hurts*), 0.767.

**The language model result is split.** On 30-day adoption: no breed 0.7955,
keywords 0.7999, language model 0.8002. The language model beats no-breed
(*p* < 0.001) but not keywords (+0.0003, *p* = 0.73). On long stay: no breed
0.7322, keywords 0.7545, language model 0.7667, beating keywords by +0.0122
(*p* < 0.001) and no-breed by +0.0345 (*p* < 0.001).

Breed matters much more for predicting who is still here in two months than for
predicting a fast adoption, and the attributes only a language model recovers
(weight, grooming, energy, guardian origin) are what carry that signal.

**Weather is a negative result.** On the window where the station record exists
(115,158 episodes, 89.9 percent of the cohort), adding weather changes 30-day AUC
by +0.0005 (*p* = 0.71) and long-stay AUC by +0.0017 (*p* = 0.51). We ingested a
fourth data source and it did not help.

### 4.6 A feature that helped in training and hurt in deployment

`intake_year` and `days_since_series_start` are monotone in calendar time. A
boosted tree can only split where it has seen values, and 100 percent of test
rows lie above the training maximum on both, so every future animal lands in the
terminal bin and the feature stops discriminating. Removing both improves held-out
30-day AUC from 0.7973 to **0.8028** (+0.0055, *p* < 0.001). All results here use
the 56-feature set without them.

### 4.7 Subgroup performance

30-day AUC is 0.849 for cats and 0.764 for dogs; long-stay AUC is 0.808 for dogs
and 0.711 for cats.

For dogs carrying a bully-type label, 30-day AUC is 0.754 against 0.807 for
others, and the model under-predicts their adoption by 4.8 points. For breeds
named in breed-specific legislation, AUC is 0.771 against 0.813 with a −5.3 point
calibration gap. Because the queue routes help toward low-scoring animals, that
error direction places these dogs higher than their outcomes justify, which is
the safer of the two errors here but is still an error.

Weakest subgroups: juveniles (0.683) and animals arriving injured (0.691).

### 4.8 Survival results

Cox concordance 0.731 training, **0.700** held out. Selected hazard ratios for
adoption: puppy or kitten 2.574, juvenile 1.489, coat length 1.104 per SD;
occupancy at intake 0.954 per SD, body size 0.865, staff-assigned name 0.830,
bully-type label 0.806, adult 0.639, sick 0.556, cat 0.483, injured 0.477, senior
0.425, public assist 0.288.

Median cause-specific time to adoption is 22.1 days. The competing-risks median
is undefined, because the cumulative incidence curve never reaches 0.5.

The discrete-time hazard model reaches an integrated Brier score of 0.0401
against 0.0458 for a Kaplan-Meier baseline, a 12.5 percent improvement.

### 4.9 Monitoring across a real regime change

*The second result I would like reviewers to scrutinise.*

The model, trained through 2018 and calibrated on 2019 (validation AUC 0.810, ECE
0.0044), is frozen and scored month by month across 2020 and 2021.

**Discrimination did not degrade.** Mean monthly AUC before March 2020 was 0.778;
after, 0.789. Worst month July 2020 at 0.717.

**Calibration did.** The largest gap is 7.6 points, in July 2020. Through the
second half of 2021 the gap runs consistently negative as Austin's adoption rates
recovered past the model's expectations.

A monitoring setup watching AUC alone would have seen a model still ranking
correctly and concluded nothing was wrong, while the numbers staff read as
percentages drifted by up to eight points.

**Lead time.** Input drift reached CRITICAL in 2020Q2; performance drift in July
2020. The gap is structural: the 30-day label does not exist until 30 days after
intake, so performance drift is at best six weeks behind its cause.

**Three ways to break a drift detector.** Our first implementation returned
CRITICAL for every quarter, including stable ones. Diagnosing it produced three
findings. Features monotone in calendar time have unbounded PSI by construction.
Features constant across the cohort within a window (shelter occupancy, arrivals
in the prior week) make PSI compare two point masses, returning roughly 8 whether
the level moved 2 percent or 40; measured as level changes instead, arrivals in
the prior 7 days fell 36.8 percent and occupancy 10.8 percent. Deterministic
calendar functions (month, season, day-of-year sine and cosine) differ between one
quarter and a multi-year reference because one quarter is one season. Excluding
all three leaves 19 monitored features and a detector that behaves.

**Retraining.** Retraining on data through June 2020 and evaluating on 2021 gave
+0.001 AUC and made calibration *worse* (ECE 0.045 to 0.050), because the
calibration window was the most unusual six months in the series. Our
champion-versus-challenger gate would have promoted it, which means the gate as
specified was insufficient.

---

## 5. Conclusion and discussion

**The competing-risks correction is not optional.** Every shelter reporting a
Kaplan-Meier adoption curve is reporting a number wrong by 72 percent at 30 days
in this data. The fix is a different estimator, not more data.

**Calibration and discrimination fail separately, and calibration failed first.**
Any monitoring design that watches discrimination alone is watching the wrong
number.

**The language model earned its place on one target and not the other.**
Reporting both halves tells a reader which question the extra machinery is worth
deploying for.

**Direction is an engineering decision.** Between Lepper et al. framing this
exact problem as adoption versus euthanasia and Obermeyer et al. showing an
accurate model causing harm through its target sits an obligation. We discharge
it in code: the API embeds the use policy in every response, the interface has no
ranking that surfaces animals for removal, and the model card names the
out-of-scope uses.

**Limitations.** No behavioural data, which is where Protopopova et al. show the
remaining signal is. Breed is a staff guess with measured 50 percent sensitivity.
One shelter with an unusual no-kill policy and a 29 percent transfer rate. The
intervention effects in the outreach planner are assumptions rather than
measurements and are labelled as such. And the feedback loop is real: a deployed
queue changes which animals get help, which changes next year's data.

**Future work.** A photograph-quality signal, which is the largest missing
feature. A second shelter, to test transfer. And a prospective evaluation, which
is the only way to learn whether the queue changes outcomes rather than merely
predicting them.

---

## References

1. Lepper, M., Kass, P. H. and Hart, L. A. (2002). Prediction of adoption versus euthanasia among dogs and cats in a California animal shelter. *Journal of Applied Animal Welfare Science*, 5(1), 29-42. DOI: 10.1207/S15327604JAWS0501_3.
2. Protopopova, A., Mehrkam, L. R., Boggess, M. M. and Wynne, C. D. L. (2014). In-kennel behavior predicts length of stay in shelter dogs. *PLOS ONE*, 9(12), e114319. DOI: 10.1371/journal.pone.0114319.
3. Janke, N., Berke, O., Flockhart, T., Bateman, S. and Coe, J. B. (2017). Risk factors affecting length of stay of cats in an animal shelter: a case study at the Guelph Humane Society, 2011-2016. *Preventive Veterinary Medicine*, 148, 44-48.
4. Bradley, J. and Rajendran, S. (2021). Increasing adoption rates at animal shelters: a two-phase approach to predict length of stay and optimal shelter allocation. *BMC Veterinary Research*, 17, article 70. DOI: 10.1186/s12917-020-02728-2.
5. Austin, P. C., Lee, D. S. and Fine, J. P. (2016). Introduction to the analysis of survival data in the presence of competing risks. *Circulation*. DOI: 10.1161/CIRCULATIONAHA.115.017719.
6. Graf, E., Schmoor, C., Sauerbrei, W. and Schumacher, M. (1999). Assessment and comparison of prognostic classification schemes for survival data. *Statistics in Medicine*, 18(17-18), 2529-2545.
7. Mavrovouniotis, M. L. (2026). Use of Kaplan-Meier and Cox regressions in the distribution of length of stay in animal shelters for pre-specified calendar periods. *PLOS ONE*, 21(1), e0342102. DOI: 10.1371/journal.pone.0342102.
8. Olson, K. R., Levy, J. K., Norby, B., Crandall, M. M., Broadhurst, J. E., Jacks, S., Barton, R. C. and Zimmerman, M. S. (2015). Inconsistent identification of pit bull-type dogs by shelter staff. *The Veterinary Journal*, 206, 197-202.
9. Sinski, J., Carini, R. M. and Weber, J. D. (2016). Putting (big) black dog syndrome to the test: evidence from a large metropolitan shelter. *Anthrozoös*, 29(4). DOI: 10.1080/08927936.2016.1228769.
10. Sculley, D. et al. (2015). Hidden technical debt in machine learning systems. *Advances in Neural Information Processing Systems 28*, 2503-2511.
11. Lundberg, S. M. and Lee, S.-I. (2017). A unified approach to interpreting model predictions. *Advances in Neural Information Processing Systems 30*.
12. Mitchell, M. et al. (2019). Model cards for model reporting. *Proc. FAT\* '19*. DOI: 10.1145/3287560.3287596.
13. Obermeyer, Z., Powers, B., Vogeli, C. and Mullainathan, S. (2019). Dissecting racial bias in an algorithm used to manage the health of populations. *Science*, 366(6464), 447-453. DOI: 10.1126/science.aax2342.
14. Ke, G. et al. (2017). LightGBM: a highly efficient gradient boosting decision tree. *Advances in Neural Information Processing Systems 30*.
15. Chen, T. and Guestrin, C. (2016). XGBoost: a scalable tree boosting system. *Proc. 22nd ACM SIGKDD*, 785-794. DOI: 10.1145/2939672.2939785.
16. Davidson-Pilon, C. (2019). lifelines: survival analysis in Python. *Journal of Open Source Software*, 4(40), 1317. DOI: 10.21105/joss.01317.
