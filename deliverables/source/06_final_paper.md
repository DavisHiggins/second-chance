# SecondChance: competing-risk survival forecasting of shelter adoption, with calibration and drift monitoring, on nine years of Austin Animal Center records

<p class="authors">Davis Higgins</p>
<p class="affiliation">Department of Data Science, University of North Carolina at Charlotte, Charlotte, North Carolina 28223, USA</p>
<p class="dateline">DTSC 3601: Data Science Studio 3, Predictive Analysis and Their Impacts &nbsp;&middot;&nbsp; September 29, 2026</p>

<!-- TITLE_END -->

<span class="label">Abstract</span>
Municipal animal shelters allocate photography, foster recruitment and outreach
by intuition, and the animals nobody happens to notice wait months. We present
SecondChance, a deployed forecasting system that predicts, at the moment an
animal arrives, the probability of adoption within 7, 14 and 30 days and the
probability of becoming a long-stay resident past 60 days. It is built on 136,898
shelter episodes reconstructed from nine years of public Austin Animal Center
records and runs as a serverless AWS pipeline with input-drift and
performance-drift monitoring. We make four contributions. First, we show that
shelter duration must be treated as a competing-risks problem: because 51.3
percent of exits in this dataset are not adoptions, the cause-specific
Kaplan-Meier estimator that the field uses overstates 30-day adoption by 23.7
percentage points, a 72 percent relative error that grows to 104 percent by one
year. Second, gradient boosting on intake-time features alone reaches a held-out
ROC AUC of 0.803 for 30-day adoption and 0.765 for 60-day long-stay risk, with an
expected calibration error of 0.023, evaluated on 20,165 animals who arrived
after the training window closed; the top 50 of the long-stay queue contains 4.2
times as many true long-stay animals as a random 50. Third, structuring free-text
breed strings with a language model improves long-stay prediction over a keyword
baseline by 0.012 AUC (paired bootstrap, p &lt; 0.001) and does not measurably
improve 30-day adoption prediction (+0.0003, p = 0.73), a split we report rather
than average away. Fourth, the March 2020 change in Austin's operations degraded
the model's calibration while leaving its ranking intact, a failure mode that
monitoring discrimination alone would have missed for months. We also report
three classes of feature that make a population stability index detector fire
continuously and uselessly, and what to monitor instead. The system is built so
that its scores can only route help toward animals, never away from them.

<!-- ABSTRACT_END -->

<p class="keywords"><strong>Keywords:</strong> survival analysis, competing risks, calibration, animal welfare, gradient boosting, model monitoring, concept drift, MLOps, responsible machine learning</p>

## I. Introduction

The Austin Animal Center takes in roughly 16,000 animals a year and is the
largest no-kill municipal shelter in the United States. Its binding constraint is
not kennel space but attention. Someone has to photograph an animal well enough
that a stranger stops scrolling, write a profile that says something true and
specific, recruit a foster, or notice that a dog has been in the same run since
February. That attention is finite, and it is currently allocated by whoever
happens to notice.

If, on the day an animal arrives, staff could see a reliable estimate of how long
it is likely to wait, the allocation becomes tractable: work the top of a ranked
list rather than the animals who happen to be near the front desk. That is a
forecasting problem with an unusually clean label, because Austin publishes both
its intake and its outcome records and the two can be joined on animal ID to
recover a real duration rather than a proxy.

The problem is harder than it appears, in three specific ways that the applied
literature has largely not addressed.

**Censoring.** An animal still in the shelter on the day the export was cut has
not failed to be adopted. We simply do not know yet. Assigning it a negative
label, or its elapsed time as a completed duration, corrupts the training set in
a direction that flatters the model.

**Competing risks.** An animal transferred to a rescue partner on day three can
never subsequently be adopted from Austin. It has not had a slow adoption; it has
left the risk set. In our data 51.3 percent of episode exits are something other
than an adoption. Treating those as ordinary censoring assumes the animal remains
at risk, which is false, and the resulting estimate is biased upward by an amount
we measure in Section V.B.

**Leakage.** The outcome record carries the animal's sex and age at exit. Austin
sterilises before adoption, so sex at outcome is close to a direct readout of the
label. A model that touches that column reports an excellent score and predicts
nothing that could be known at the intake desk.

This paper describes a system that handles all three, is deployed rather than
notebook-bound, is monitored across a real regime change, and carries a governance
constraint that shapes its design rather than decorating its conclusion.

### A. Contributions

1. A reproducible episode reconstruction from two event logs with a complete
   audit of every join decision, including a data-derived rule for separating
   genuinely censored episodes from missing paperwork.
2. A direct measurement, on 126,494 episodes, of how far the estimator the
   shelter field uses departs from the correct competing-risks estimate.
3. Four calibrated prediction targets on a strictly temporal split that spans a
   known operational discontinuity, with bootstrap intervals, paired model
   comparisons, and subgroup performance reported rather than aggregated away.
4. A three-way evaluation of language-model breed structuring against a keyword
   baseline and against no breed features, on two targets, with the honest result
   that it helps decisively on one and not measurably on the other.
5. A monitoring study on a real, dated distribution shift, including three
   classes of feature that break a standard drift detector and what to use
   instead, and a measurement of what retraining recovers.

### B. The constraint

A score that ranks animals by how long they will wait can be read two ways. It
can send more help to the animals at the bottom, or it can be used to justify
sending less. This system is built for the first reading only. The API returns a
use-policy object on every response, the interface renders it on every screen
that shows a score, and the model card names euthanasia, intake refusal and
reduced care as out-of-scope uses. We return to why this is an engineering
decision rather than an ethical footnote in Section VI.D.

## II. Related work

**What predicts a shelter stay.** Lepper, Kass and Hart [1] established the
feature set on 8,114 Sacramento animals, finding age, sex, coat colour, reason
for relinquishment, breed and purebred status all predictive. Their framing,
adoption versus euthanasia, belongs to an era of shelter operation this project
deliberately does not model. Protopopova et al. [2] recorded 1,766 video
observations of 289 dogs and found that specific in-kennel behaviours lengthen
stays by weeks: leaning on the enclosure wall by roughly 30 days, facing away
from the kennel front by 15. They also found that preferred morphology, meaning
small size, long coat and lap-dog type, shortens stays independently of
behaviour. Their behavioural variables are precisely what no public shelter
export contains, which bounds what any administrative-record model can achieve.
Janke et al. [3] established that cats differ enough from dogs to warrant
separate treatment.

Bradley and Rajendran [4] is the closest existing machine learning work: 114,256
records from five states, comparing logistic regression, neural networks, random
forest and gradient boosting, with gradient boosting best at roughly 60 percent
averaged across precision, recall and F1. They treat length of stay as
classification into duration buckets, which discards both censoring and competing
risks, and they report neither calibration nor subgroup performance.

**How duration should be measured.** Austin, Lee and Fine [5] set out the
competing-risks framework and the reason the naive estimator overstates the event
of interest. Graf et al. [6] give the inverse-probability-of-censoring-weighted
Brier score, without which a model that predicts everyone stays forever scores
well on a censored sample. Mavrovouniotis [7] brings the argument inside the
shelter domain, showing that the length-of-stay statistic shelters actually
publish is not merely imprecise but directionally misleading, and translating a
37.6 percent corrected increase in Orange County into three to four full-time
staff positions.

**How reliable the inputs are.** Olson et al. [8] had 16 raters visually identify
120 dogs and compared the result against DNA: median agreement 67 to 78 percent
for the binary pit-bull-type question, and 50 percent average sensitivity. Any
model result about a breed label is therefore a result about the label. Sinski et
al. [9] tested the widespread belief that black dogs wait longer and did not find
support for it.

**How to deploy and govern.** Sculley et al. [10] argue that the model is a small
part of a real machine learning system and catalogue the failure modes of the
surrounding infrastructure. Lundberg and Lee [11] give per-prediction attribution
with a consistency guarantee. Mitchell et al. [12] propose model cards with
disaggregated evaluation. Obermeyer et al. [13] show a model that was accurate at
what it measured and harmful because of what it measured, which is the structural
risk this project's target shares.

**The gap.** The applied shelter literature predicts with methods that assume
complete observation and a single exit type. The statistical literature that gets
the measurement right does not predict. Neither reports calibration or subgroup
performance, and no shelter prediction paper we found evaluates a model across
the 2020 discontinuity, which is the most informative natural experiment
available in this data.

## III. Data

### A. Sources

Two public Socrata feeds from the City of Austin Open Data Portal: Intakes
(dataset `wter-evkm`, 136,922 rows) and Outcomes (`9t4d-g238`, 137,221 rows),
covering 1 October 2013 to 4 March 2022 [17, 18]. Daily maximum and minimum
temperature and precipitation for Austin from the National Weather Service [19]
form a fourth feature block. Current adoptable listings from RescueGroups.org
[20] supply regional context to the public-facing discovery page and are not used
in any model reported here.

### B. Episode construction

<figure>
<img src="../../results/figures/fig02_data_funnel.png" alt="Record counts through the pipeline">
<figcaption><span class="fignum">Fig. 1.</span> From 274,143 published rows to a
128,157-episode modelling cohort. Every exclusion is counted and reported rather
than applied silently.</figcaption>
</figure>

Neither feed carries an episode key, and 11,114 animals (9.1 percent) appear more
than once. Joining on animal ID alone produces a cross product whose durations
look entirely plausible, which makes the error invisible unless it is looked for.
We instead align sequences within each animal: sort both logs by time, and close
the *k*-th intake with the earliest outcome occurring at or after it and strictly
before the (*k*+1)-th intake. Implemented as a single `merge_asof` with a forward
direction and the animal ID as the join key, then invalidating any match that
lands on or after the animal's next arrival.

The audit is reported in full because "we joined on animal ID" is not a
reproducible statement. Of 136,922 intake rows, 24 were exact duplicates on
animal and timestamp; 17 outcome rows likewise. 136,898 episodes were built.
135,669 (99.10 percent) were closed by an outcome. 42 candidate matches were
rejected because the outcome fell on or after the animal's next arrival. No
episode had a negative duration, and no animal changed species between intake and
outcome. 1,535 outcome rows were never claimed, of which 1,466 precede that
animal's first recorded intake, consistent with animals who arrived before the
intakes feed begins in October 2013.

**Separating censoring from missing paperwork.** 1,229 episodes never closed.
Most are recent arrivals genuinely still in care, which are honest right-censored
observations. Some are not: an intake in 2015 with no outcome by 2022 does not
describe an animal that lived at the shelter for seven years, it describes an
outcome row that was never filed. We compare each open duration against the
99.5th percentile of *observed* stays, which the data puts at 289.08 days, and
flag anything longer as a suspected missing outcome. 622 episodes are flagged.
The threshold is derived from the data rather than chosen, and the flag is
reported rather than acted on silently.

This distinction is not cosmetic. Before the correction, the running count of
never-closed episodes accumulated into the shelter-occupancy feature and produced
a phantom population that reached several hundred animals by the end of the
series, a trend that is an artefact of Austin's paperwork rather than a fact
about the building.

### C. Cohort

From 136,898 episodes we exclude 7,935 that are neither dogs nor cats (largely
wildlife intakes: bats, raccoons and opossums, whose outcomes are dominated by
rabies-risk euthanasia and which never enter the adoption pathway), 243 wildlife
and owner-requested-euthanasia intakes among dogs and cats for the same reason,
and 563 flagged episodes. The modelling cohort is 128,157 episodes.

<table>
<caption class="caption"><span class="tabnum">Table I.</span> Temporal split. The test block is placed deliberately across the March 2020 discontinuity.</caption>
<thead><tr><th>Block</th><th>Dates</th><th>n</th><th>7d</th><th>14d</th><th>30d</th><th>60d LS</th></tr></thead>
<tbody>
<tr><td>Train</td><td>2013-10-01 to 2018-12-31</td><td>87,628</td><td>17.6%</td><td>25.1%</td><td>31.8%</td><td>7.7%</td></tr>
<tr><td>Validation</td><td>2019-01-01 to 2019-12-31</td><td>18,701</td><td>18.6%</td><td>27.4%</td><td>33.5%</td><td>9.4%</td></tr>
<tr><td>Test</td><td>2020-01-01 to 2022-01-02</td><td>20,165</td><td>16.6%</td><td>27.6%</td><td>37.2%</td><td>11.6%</td></tr>
</tbody>
</table>

A further 1,663 episodes fall after 2022-01-03 and are excluded so that the
60-day long-stay label is observable for every test row rather than
administratively censored. Splitting is strictly temporal. A random split would
let the model learn from February to predict January, which no deployed system
can do.

## IV. Methods

### A. Features and the leakage boundary

Fifty-six features in five blocks, every one knowable at the intake desk: animal
attributes (age, sex and sterilisation status at intake, colour tokens, whether
the animal arrived with a name and whether that name was assigned by staff),
intake context (type, condition, found location, prior visit count, hour, day of
week, cyclical day of year), shelter occupancy at arrival, structured breed
attributes, and weather.

The boundary is enforced by an explicit allow-list rather than by remembering:
the feature module reads only intake-side columns. The one apparent exception is
the occupancy block, which uses the exit timestamps of *other* animals to compute
how full the building was on the day this animal arrived. That is legitimate. A
kennel manager standing at the intake desk can count the occupied runs; it is
knowledge about the shelter, not about the future of the animal in front of them.

**Verification.** We train the full model on randomly permuted labels. If any
feature encodes the outcome, the control cannot land at chance. It returns a
held-out ROC AUC of **0.5023**.

### B. Structuring breed with a language model

Austin records breed as free text. There are 2,736 distinct strings, and 1,651 of
them are needed to cover 99 percent of dog episodes. One-hot encoding that is a
recipe for a sparse, unstable model that can say nothing about a breed it has not
seen.

The strings are compositional, though. Austin's convention is
`"Labrador Retriever/Pit Bull Mix"`: slash-separated components with an optional
`Mix` suffix. Splitting on that structure collapses the vocabulary from 2,736
strings to **254 atomic breed tokens**, small enough for a language model to
label once, carefully. We prompt Claude (Anthropic) at temperature 0 for eleven
structured attributes per token: American Kennel Club group, size class, typical
adult weight, coat length, grooming need, energy level, and boolean flags for
bully type, brachycephaly, guardian or working origin, breed-specific-legislation
risk, and recognised purebred status. The prompt is versioned and the resulting
reference table is committed, so the results below are reproducible without
re-calling the API. The production ingestion path calls the same model through
Amazon Bedrock when a token appears that is not in the table.

Composition rules are deliberately boring: size, weight, coat, grooming and
energy take the maximum across listed breeds, because a Labrador crossed with a
Chihuahua is not a Chihuahua-sized dog and adopters shop by the upper bound; the
risk flags take the logical OR, because a cross that reads as part bully breed
meets the same housing barriers as a full one; purity takes the AND and is true
only for a single recognised non-mix token.

The reference resolves **100 percent** of dog and cat breed strings in the
cohort. We compare it against a good-faith keyword baseline (a hand-written
regular expression set covering size words, coat words and the obvious breed
families, written by reading the actual vocabulary) and against dropping breed
entirely.

### C. Models and calibration

Baselines are the training base rate and a logistic regression on the same
preprocessed matrix. Candidates are LightGBM [14] and XGBoost [15]. All four run
through an identical preprocessor (median imputation with a missingness
indicator, standardisation, one-hot encoding with a minimum frequency of 25) so
that any difference is attributable to the model rather than to a preprocessing
quirk.

Probabilities are calibrated with isotonic regression fitted on the validation
block only, using a frozen estimator so the calibrator cannot refit the model.
Calibrating on training data would be a slow-motion way of lying to ourselves.

### D. Survival modelling

Four estimators.

**Cause-specific Kaplan-Meier**, treating competing exits as censored. This is
what the field reports and we include it to measure the error it produces.

**Aalen-Johansen cumulative incidence**, which answers the question an operations
manager actually has: what share of animals arriving today will be adopted from
*this shelter* by day *t*.

**Penalised Cox proportional hazards** with 27 covariates, standardised so hazard
ratios read per standard deviation for continuous terms and against the most
common level for categorical ones.

**A discrete-time gradient boosted hazard model.** Each episode is expanded into
one row per interval it survived into, using daily bins for the first fortnight
(where half of all adoptions occur), weekly to three months and monthly to a
year: 35 bins, expanding 87,628 training episodes into 769,435 person-period
rows. Crucially we fit *two* cause-specific hazards jointly, one for adoption and
one for any other exit, and compose them into a properly normalised cumulative
incidence:

<pre>S(j)   = &prod;<sub>k&le;j</sub> (1 &minus; h<sub>adopt</sub>(k) &minus; h<sub>other</sub>(k))
CIF(j) = &sum;<sub>k&le;j</sub> S(k&minus;1) &middot; h<sub>adopt</sub>(k)</pre>

Modelling only the adoption hazard and reporting `1 − ∏(1 − h)` answers a
counterfactual question about a shelter with no transfers. Section V.B quantifies
what that costs.

Durations are administratively censored at one year. Beyond that the sample is
small and unlike the rest of the population, and the curve becomes a description
of a handful of long-term residents rather than of shelter operations.

### E. Evaluation

Discrimination by ROC AUC and average precision with 400-sample percentile
bootstrap intervals. Calibration by expected calibration error over 20
equal-frequency bins, plus calibration slope and intercept from a logistic
regression of outcomes on predicted log-odds. Operational value by precision and
lift at queue depths of 20, 50 and 100, because a shelter's marketing volunteer
has time for perhaps twenty animals a week and the area under a curve is not what
they will look at. Survival models by Harrell's concordance and the
censoring-weighted integrated Brier score [6]. Model comparisons by 1,000-sample
paired bootstrap of the AUC difference, paired because both models see the same
animals.

### F. Deployment

The pipeline runs serverless on AWS: scheduled Lambda ingestion into a versioned,
KMS-encrypted S3 landing zone that is append-only and preserves every raw API
response with its retrieval timestamp; a Glue crawler and Redshift Serverless at
the minimum 8 RPU for the joins and aggregates; SageMaker for training jobs and
the inference endpoint; API Gateway and Lambda for the five-route public API;
Kinesis Firehose archiving every served prediction so that drift can be computed
retrospectively; and a weekly monitoring Lambda publishing custom CloudWatch
metrics behind alarms on data drift, model quality, calibration gap, ingestion
failure, data staleness and endpoint latency. Infrastructure is a single
CloudFormation and SAM template. Redshift Serverless rather than a provisioned
cluster, and transient training jobs rather than a persistent endpoint, are
deliberate: an idle provisioned cluster is the easiest way to spend a student
budget on nothing.

## V. Results

### A. Prediction performance

<figure>
<img src="../../results/figures/fig05_model_comparison.png" alt="ROC AUC by target and model">
<figcaption><span class="fignum">Fig. 2.</span> Held-out discrimination on 20,165
animals arriving between January 2020 and January 2022, after isotonic
calibration, with 95 percent bootstrap intervals.</figcaption>
</figure>

<table>
<caption class="caption"><span class="tabnum">Table II.</span> Held-out performance, calibrated. ECE is expected calibration error; lift@50 is precision in the top 50 divided by the base rate.</caption>
<thead><tr><th>Target</th><th>Model</th><th>AUC</th><th>95% CI</th><th>PR AUC</th><th>Brier</th><th>ECE</th><th>Slope</th><th>lift@50</th></tr></thead>
<tbody>
<tr><td rowspan="3">Adopt &le;7d<br>(16.6%)</td><td>Logistic</td><td>0.800</td><td>0.792&ndash;0.808</td><td>0.429</td><td>0.115</td><td>0.019</td><td>0.93</td><td>4.21</td></tr>
<tr><td><strong>LightGBM</strong></td><td><strong>0.827</strong></td><td>0.821&ndash;0.835</td><td>0.480</td><td>0.109</td><td>0.022</td><td>0.93</td><td>4.33</td></tr>
<tr><td>XGBoost</td><td>0.827</td><td>0.820&ndash;0.834</td><td>0.479</td><td>0.109</td><td>0.012</td><td>0.97</td><td>5.18</td></tr>
<tr><td rowspan="3">Adopt &le;14d<br>(27.6%)</td><td>Logistic</td><td>0.775</td><td>0.768&ndash;0.782</td><td>0.538</td><td>0.162</td><td>0.015</td><td>0.90</td><td>2.82</td></tr>
<tr><td><strong>LightGBM</strong></td><td><strong>0.816</strong></td><td>0.811&ndash;0.823</td><td>0.593</td><td>0.150</td><td>0.018</td><td>1.01</td><td>2.97</td></tr>
<tr><td>XGBoost</td><td>0.816</td><td>0.810&ndash;0.822</td><td>0.594</td><td>0.150</td><td>0.015</td><td>0.92</td><td>3.11</td></tr>
<tr><td rowspan="3">Adopt &le;30d<br>(37.2%)</td><td>Logistic</td><td>0.755</td><td>0.748&ndash;0.761</td><td>0.612</td><td>0.192</td><td>0.021</td><td>0.92</td><td>2.26</td></tr>
<tr><td><strong>LightGBM</strong></td><td><strong>0.803</strong></td><td>0.797&ndash;0.809</td><td>0.674</td><td>0.174</td><td>0.023</td><td>0.97</td><td>2.52</td></tr>
<tr><td>XGBoost</td><td>0.800</td><td>0.794&ndash;0.806</td><td>0.672</td><td>0.175</td><td>0.025</td><td>0.92</td><td>2.36</td></tr>
<tr><td rowspan="3">Long stay<br>&gt;60d (11.6%)</td><td><strong>Logistic</strong></td><td><strong>0.766</strong></td><td>0.756&ndash;0.775</td><td>0.273</td><td>0.094</td><td>0.019</td><td>0.80</td><td>4.67</td></tr>
<tr><td>LightGBM</td><td>0.765</td><td>0.754&ndash;0.775</td><td>0.270</td><td>0.093</td><td>0.018</td><td>0.81</td><td>4.15</td></tr>
<tr><td>XGBoost</td><td>0.760</td><td>0.748&ndash;0.770</td><td>0.263</td><td>0.093</td><td>0.018</td><td>0.83</td><td>5.02</td></tr>
</tbody>
</table>

LightGBM beats logistic regression decisively on the three adoption horizons:
+0.027 at 7 days, +0.042 at 14, +0.048 at 30, all with paired bootstrap
*p* &lt; 0.001. On the long-stay target it does not. The difference is −0.0007
(95 percent CI −0.008 to +0.007, *p* = 0.82), which is to say that for the rare
class a penalised linear model in 56 dimensions matches a boosted tree. We report
this because it is the kind of result that quietly disappears when only the
winning target is shown.

LightGBM and XGBoost are indistinguishable at 7 and 14 days
(*p* = 0.84 and 0.46), LightGBM is marginally ahead at 30 days
(+0.0028, *p* &lt; 0.001) and at long stay (+0.0052, *p* = 0.012). We take
LightGBM as the champion on the strength of the 30-day result and its consistent
calibration, while noting the margin is small enough that the choice is not load
bearing.

<figure>
<img src="../../results/figures/fig06_calibration.png" alt="Reliability diagrams">
<figcaption><span class="fignum">Fig. 3.</span> Left: reliability of the 30-day
classifier over 15 equal-frequency bins. Right: the survival model's predicted
30-day incidence by decile against the observed Aalen-Johansen incidence, with
the same model's uncorrected prediction marked.</figcaption>
</figure>

Calibration is good across the board: expected calibration error between 0.012
and 0.025, calibration slopes between 0.80 and 1.01. The long-stay slopes near
0.80 indicate mild over-extremity that isotonic regression does not fully remove
on a class with an 11.6 percent base rate.

**Operational value.** For the long-stay queue, which is the screen a shelter
actually works from, the top 50 animals by predicted risk contain 4.2 times as
many true long-stay animals as a random 50 under LightGBM, 4.7 times under
logistic regression and 5.0 times under XGBoost. In absolute terms, 48 percent of
the model's top 50 really did stay past 60 days, against a base rate of 11.6
percent.

<figure>
<img src="../../results/figures/fig14_queue_value.png" alt="Precision at k">
<figcaption><span class="fignum">Fig. 4.</span> Precision at queue depth k for
the long-stay target. The product metric: how good the top of the list is, at the
depth a shelter can actually work.</figcaption>
</figure>

### B. The competing-risks correction

This is the result with the widest implications outside this paper.

<figure>
<img src="../../results/figures/fig03_estimator_comparison.png" alt="Kaplan-Meier against Aalen-Johansen">
<figcaption><span class="fignum">Fig. 5.</span> Two estimators on 126,494
episodes. Treating transfers and returns to owner as censoring rather than as
competing events overstates adoption by 23.7 percentage points at day 30 and by
50.4 points at one year.</figcaption>
</figure>

Of 126,494 episodes in the survival cohort, 61,010 ended in adoption, 64,930 in a
competing exit and 554 were censored at the one-year horizon. Because competing
exits are 51.3 percent of the total, the difference between the two estimators is
not a rounding error.

<table>
<caption class="caption"><span class="tabnum">Table III.</span> Cumulative adoption by day, two estimators.</caption>
<thead><tr><th>Day</th><th>Cause-specific KM</th><th>Aalen-Johansen CIF</th><th>Overstatement</th><th>Relative</th></tr></thead>
<tbody>
<tr><td>7</td><td>0.258</td><td>0.176</td><td>+0.082</td><td>+47%</td></tr>
<tr><td>14</td><td>0.410</td><td>0.259</td><td>+0.151</td><td>+58%</td></tr>
<tr><td>30</td><td>0.566</td><td>0.329</td><td>+0.237</td><td>+72%</td></tr>
<tr><td>60</td><td>0.771</td><td>0.410</td><td>+0.361</td><td>+88%</td></tr>
<tr><td>90</td><td>0.875</td><td>0.448</td><td>+0.427</td><td>+95%</td></tr>
<tr><td>180</td><td>0.956</td><td>0.474</td><td>+0.482</td><td>+102%</td></tr>
<tr><td>365</td><td>0.988</td><td>0.483</td><td>+0.504</td><td>+104%</td></tr>
</tbody>
</table>

Read the last row plainly. The estimator in common use says that 98.8 percent of
animals arriving at this shelter are adopted within a year. The correct figure is
48.3 percent. A shelter reporting the first number believes essentially every
animal goes home; the truth is that fewer than half go home *from this building*,
and the rest leave by transfer, return to owner, or otherwise.

The same error appears at the level of individual predictions. Our discrete-time
hazard model, if it estimates only the adoption hazard and reports
`1 − ∏(1 − h)`, predicts a mean 30-day adoption probability of **0.638** on the
test block. Estimating both cause-specific hazards and composing them properly
gives **0.403**. The observed value is **0.372**. The naive construction is
overconfident by 23.5 percentage points on average; the corrected one is within
3.1 points and is well behaved across deciles (Fig. 3, right panel).

### C. Who waits

<figure>
<img src="../../results/figures/fig04_cif_by_stratum.png" alt="Cumulative incidence by stratum">
<figcaption><span class="fignum">Fig. 6.</span> Aalen-Johansen cumulative
incidence of adoption by stratum.</figcaption>
</figure>

Life stage dominates. Puppies and kittens reach 59.8 percent cumulative adoption
incidence by day 30; seniors reach 17.8 percent. Neonates are the interesting
case: only 21.4 percent by day 30 but 47.8 percent by day 90, a shape consistent
with the foster-then-adopt pathway rather than with slow adoption, and one that a
30-day classifier alone would misread as a bad outcome.

Species diverge and then converge. Dogs reach 22.2 percent by day 7 against 10.9
percent for cats, but by day 90 the two are within a point of each other (45.5
against 43.6 percent). A model that pools species without letting them interact
with time is wrong about both.

Intake type is the sharpest single split: owner surrenders reach 47.4 percent by
day 30 against 8.8 percent for public-assist intakes.

Dogs carrying a bully-type breed label reach 25.1 percent by day 30 against 34.0
percent for other dogs and cats, a gap of 8.9 points. Following Olson et al. [8],
this is a finding about the label a staff member applied and how the public reacts
to it, not about the animals' genetics.

**The black coat test.** Animals with black in their recorded coat colour reached
34.1 percent by day 30 against 32.3 percent for animals without, and the model's
discrimination is essentially the same for both (AUC 0.793 against 0.807). If
anything, black animals were adopted marginally *faster*. This replicates Sinski
et al. [9] on a much larger sample and is worth reporting for a reason specific to
predictive systems: a queue that encoded the folk belief would send more
photography and more foster outreach to black animals, change their outcomes, and
so change next year's training data. A model can make a false belief true.

### D. What the model keys on

<figure>
<img src="../../results/figures/fig09_importance.png" alt="SHAP and permutation importance">
<figcaption><span class="fignum">Fig. 7.</span> Two importance views for the
30-day model. They agree on the top three and disagree below that; the rank
correlation is 0.61.</figcaption>
</figure>

Age at intake dominates: shuffling it costs 0.101 held-out AUC, nearly three
times the next feature. Intake condition (normal or not) costs 0.037, public
assist intake 0.017, and whether the animal's name was assigned by shelter staff
0.014. That last one is a genuinely useful signal that is free in the data:
Austin prefixes staff-assigned names with an asterisk, so the field encodes
"nobody was looking for this animal" without anyone having to record it.

The long-stay model keys on a noticeably different set: age at intake (0.046),
staff-assigned name (0.040) and name length (0.031). Breed weight enters the top
six for long stay and not for 30-day adoption, which foreshadows the ablation
result below.

<figure>
<img src="../../results/figures/fig10_partial_dependence.png" alt="Partial dependence curves">
<figcaption><span class="fignum">Fig. 8.</span> Partial dependence for the two
most operationally meaningful features. The age curve is not monotone.</figcaption>
</figure>

The age relationship is not a straight line and not monotone. Predicted 30-day
adoption rises steeply from three weeks to about three months, peaks, and declines
through adulthood into old age. The dip at the youngest ages is the neonatal
foster pathway again: very young animals are not adopted quickly because they are
not yet adoptable.

The SHAP and permutation orderings correlate at 0.61 on the 30-day target and 0.46
on long stay. Reporting only one would have made the model look more coherent
than it is. Where they disagree, the permutation view is the one about
generalisation, and it is the one we use to justify keeping a feature.

### E. Feature ablations

<figure>
<img src="../../results/figures/fig07_ablation.png" alt="Cumulative feature block ablation">
<figcaption><span class="fignum">Fig. 9.</span> Cumulative contribution of each
feature block on both targets.</figcaption>
</figure>

On the 30-day target: animal attributes alone give 0.747. Adding intake context
gives 0.795, a gain of +0.048 (95 percent CI 0.043 to 0.053, *p* &lt; 0.001).
Adding shelter occupancy gives 0.796, a gain of +0.0006 (CI −0.002 to +0.003,
*p* = 0.63), which is nothing. Adding breed structure gives 0.800, +0.0047
(*p* &lt; 0.001).

On long stay the ordering differs: 0.723, then 0.741, then 0.732 (occupancy
*hurts*), then 0.767 with breed structure. Adding features is not monotone, and
the shelter-load block earns its place on neither target. It stays in the
deployed model only because it is nearly free to compute and is useful to the
capacity view of the product; on the evidence here a leaner model would be
defensible.

<figure>
<img src="../../results/figures/fig08_breed_strategy.png" alt="Breed strategy comparison">
<figcaption><span class="fignum">Fig. 10.</span> Three ways of handling breed, on
two targets. The language model earns its place on one of them.</figcaption>
</figure>

**The language model result is split, and the split is the finding.** On 30-day
adoption: no breed features 0.7955, keyword baseline 0.7999, language model
0.8002. The language model beats no-breed by +0.0047 (*p* &lt; 0.001) but beats
the keyword baseline by +0.0003 (CI −0.0014 to +0.0022, *p* = 0.73), which is
nothing. On long stay: no breed 0.7322, keywords 0.7545, language model 0.7667.
Here the language model beats keywords by +0.0122 (CI 0.0082 to 0.0160,
*p* &lt; 0.001) and beats no-breed by +0.0345 (*p* &lt; 0.001).

The interpretation is that breed matters much more for predicting who is *still
here in two months* than for predicting a fast adoption, and that the attributes
only a language model recovers, typical adult weight, grooming need, energy level,
guardian origin, are what carry that extra signal. For the fast-adoption question,
a regular expression that spots "Chihuahua" and "Miniature" does the job.

**Weather is a negative result.** On the window where the station record actually
exists (115,158 episodes, 89.9 percent of the cohort, 2013-10-01 to 2020-12-31),
adding the five weather features changes 30-day AUC by +0.0005 (*p* = 0.71) and
long-stay AUC by +0.0017 (*p* = 0.51). We ingested a fourth public data source and
it did not help. We report that rather than quietly dropping it, because a reader
deciding whether to build the same pipeline should know.

**A trap we fell into and climbed out of.** Measured on the *full* cohort rather
than the covered window, weather appeared to gain +0.013 AUC on the long-stay
target. That gain was an artefact: the station record stops on 2020-12-31 while
the shelter record runs to 2022-03-04, our imputer emits a missingness indicator,
and on the full cohort that indicator is a perfect flag for "this intake happened
in 2021 or later". The model was not learning about weather; it was learning what
era it was in. Restricting the evaluation to the covered window removes it.

### F. A feature that helped in training and hurt in deployment

Two features in our original matrix are monotone in calendar time: `intake_year`
and `days_since_series_start`. They are the kind of thing that gets added without
much thought, to let the model pick up secular trend.

They are, in fact, harmful, and the reason is structural. A gradient boosted tree
can only split a feature where it has seen values. Training data spans intake
years 2013 to 2018; **100 percent** of test rows lie above the training maximum
on both features. Every future animal therefore lands in the terminal bin, the
feature stops discriminating between animals entirely, and what the model applies
instead is whatever trend it learned, frozen.

Measured: removing both improves held-out 30-day AUC from 0.7973 to **0.8028**, a
gain of +0.0055 with paired bootstrap *p* &lt; 0.001. On long stay the direction
is the same and the magnitude smaller (0.7632 to 0.7651, *p* = 0.37). The deployed
model excludes them, and all results in this paper are from the 56-feature set
that does.

We found this not by looking for it but because those two features broke the
drift detector, which is the subject of the next section.

### G. Subgroup performance

<figure>
<img src="../../results/figures/fig11_subgroups.png" alt="Subgroup performance and calibration">
<figcaption><span class="fignum">Fig. 11.</span> Where the model is weaker, and
where it is biased. Reported together because they are different failures.</figcaption>
</figure>

Aggregate performance conceals two things worth naming.

**The model is better for cats than for dogs on adoption, and better for dogs than
for cats on long stay.** 30-day AUC is 0.849 for cats and 0.764 for dogs;
long-stay AUC is 0.808 for dogs and 0.711 for cats. The cat long-stay model is
also the worst calibrated subgroup we measured, under-predicting by 2.8 points on
a 14.4 percent base rate.

**The model is worse, and systematically under-confident, for the two breed labels
that carry real-world consequences.** For dogs carrying a bully-type label, 30-day
AUC is 0.754 against 0.807 for others, and the model under-predicts their adoption
chances by 4.8 points (predicted 28.4 percent, observed 33.2 percent). For breeds
commonly named in breed-specific legislation and insurance exclusions, AUC is
0.771 against 0.813 and the calibration gap is −5.3 points.

The direction of that error matters. Because the queue routes *help* toward
low-scoring animals, under-predicting adoption for these dogs places them higher
in the queue than their true outcomes justify, which errs toward giving them more
attention. That is the safer of the two possible errors in this system, but it is
still an error, it is reported rather than hidden, and it would be the wrong
direction entirely in a system pointed the other way.

Weakest subgroups overall are the juvenile band (AUC 0.683) and animals arriving
injured (0.691). Strongest are nursing intakes (0.963) and neonates (0.893),
which reflects those groups having near-deterministic short-run outcomes rather
than the model being insightful about them.

### H. Survival results

The Cox model with 27 covariates reaches concordance 0.731 in training and
**0.700** on the held-out block.

<table>
<caption class="caption"><span class="tabnum">Table IV.</span> Selected Cox hazard ratios for adoption. Continuous terms are per standard deviation; categorical terms are against the most common level (dog, stray, normal condition, young adult). All rows shown have p &lt; 0.01.</caption>
<thead><tr><th>Covariate</th><th>HR</th><th>95% CI</th></tr></thead>
<tbody>
<tr><td>Puppy or kitten</td><td>2.574</td><td>2.471&ndash;2.682</td></tr>
<tr><td>Juvenile</td><td>1.489</td><td>1.432&ndash;1.548</td></tr>
<tr><td>Coat length</td><td>1.104</td><td>1.092&ndash;1.115</td></tr>
<tr><td>Owner surrender</td><td>1.065</td><td>1.038&ndash;1.093</td></tr>
<tr><td>Shelter occupancy at intake</td><td>0.954</td><td>0.944&ndash;0.963</td></tr>
<tr><td>Body size</td><td>0.865</td><td>0.854&ndash;0.876</td></tr>
<tr><td>Name assigned by staff</td><td>0.830</td><td>0.821&ndash;0.838</td></tr>
<tr><td>Bully-type breed label</td><td>0.806</td><td>0.794&ndash;0.818</td></tr>
<tr><td>Adult</td><td>0.639</td><td>0.616&ndash;0.663</td></tr>
<tr><td>Arrived sick</td><td>0.556</td><td>0.512&ndash;0.603</td></tr>
<tr><td>Cat</td><td>0.483</td><td>0.469&ndash;0.497</td></tr>
<tr><td>Arrived injured</td><td>0.477</td><td>0.450&ndash;0.505</td></tr>
<tr><td>Senior</td><td>0.425</td><td>0.401&ndash;0.451</td></tr>
<tr><td>Public assist intake</td><td>0.288</td><td>0.269&ndash;0.309</td></tr>
</tbody>
</table>

Median cause-specific time to adoption is 22.1 days. Note that the *competing
risks* median is undefined, because the cumulative incidence curve never reaches
0.5: fewer than half of all arrivals are ever adopted from this shelter. That is
not a modelling failure, it is the fact the Aalen-Johansen estimate exists to
express.

The discrete-time hazard model reaches an integrated Brier score of **0.0401**
against **0.0458** for a Kaplan-Meier baseline applied to every animal, a 12.5
percent improvement. Its concordance for the ranking induced by 30-day cumulative
incidence is 0.676, lower than the Cox model's 0.700, which is expected: the
cumulative incidence ranking mixes adoption speed with the risk of a competing
exit, and an animal likely to be transferred quickly scores low on it for reasons
that have nothing to do with adoptability. The classifier remains the right tool
for ranking, and the survival model the right tool for the curve.

### I. Monitoring across a real regime change

<figure>
<img src="../../results/figures/fig12_drift_timeline.png" alt="Monthly performance across March 2020">
<figcaption><span class="fignum">Fig. 12.</span> Twenty-three months of a model
frozen on 2018 data, with the warning and critical bands shaded. Discrimination
held; calibration did not.</figcaption>
</figure>

The model is trained through 2018, calibrated on 2019 (validation AUC 0.810, ECE
0.0044), then frozen and scored month by month across 2020 and 2021.

**Discrimination did not degrade.** Mean monthly AUC before March 2020 was 0.778;
after, it was 0.789. The worst month, July 2020, reached 0.717. Nine of 23
evaluable months are OK, nine are WARNING and five are CRITICAL under thresholds
fixed in advance (a warning at a 3 percent relative AUC drop from the validated
baseline, critical at 7 percent; a warning at a 5-point calibration gap, critical
at 10).

**Calibration did.** The largest calibration gap is 7.6 points, in July 2020,
when the model predicted a 30-day adoption rate 7.6 percentage points above what
actually happened. Through the second half of 2021 the gap runs consistently
negative, meaning the model under-predicts adoption as Austin's rates recovered
past its expectations.

This is the operationally important finding. A monitoring setup watching AUC
alone would have seen a model that was still ranking animals correctly and
concluded nothing was wrong, while the numbers on the shelter's screen, which
staff read as percentages, drifted by up to eight points. **Discrimination and
calibration fail separately, and in this case calibration failed first and
harder.**

**Input drift and its lead time.** Input drift reached CRITICAL in 2020Q2, with
intake condition and intake type as the offending features. Performance drift
reached CRITICAL in July 2020. The gap is structural, not incidental: the 30-day
label does not exist until 30 days after intake, and a month of labels has to
accumulate before a monthly AUC means anything, so performance drift is at best
six weeks behind the event that caused it. That lag is the entire operational
argument for monitoring inputs as well as outcomes.

The false alarm rate on a period known to be stable, the 2019 validation year, is
3 alarming months out of 12 (0.25). This is an optimistic estimate, because the
baseline is computed on that same block, and we report it as a lower bound.

<figure>
<img src="../../results/figures/fig13_psi.png" alt="Feature drift">
<figcaption><span class="fignum">Fig. 13.</span> Population stability index for
animal-level features, training block against arrivals after March 2020.</figcaption>
</figure>

### J. Three ways to break a drift detector

Our first drift implementation returned CRITICAL for every quarter of the test
period, including quarters where nothing operational had changed. A detector that
fires on day one and never stops is not a detector. Diagnosing it produced three
findings that we believe generalise to any tabular monitoring setup.

**1. Features monotone in calendar time.** `intake_year` and
`days_since_series_start` have unbounded PSI against any earlier reference,
because every test value exceeds every training value. They saturate the detector
by construction. (They also, as Section V.F shows, hurt the model.)

**2. Features that are constant across the cohort within a window.** Five
features describe the shelter rather than the animal: occupancy, arrivals in the
last week and month, adoptions in the last month. Within a given week, every
animal shares almost the same value, so the "distribution" inside a quarter is
close to a point mass, and PSI between two quarters compares two point masses
that barely overlap. It returns roughly 8 whether the underlying level moved by 2
percent or by 40. The right instrument for a shelter-level covariate is the change
in its *level*. Measured that way, arrivals in the prior 7 days fell 36.8 percent
and in the prior 30 days by 36.6 percent between the training era and the
post-March-2020 period, while occupancy fell 10.8 percent and adoptions in the
prior 30 days by 14.7 percent. Those are interpretable numbers a shelter director
could act on; a PSI of 8.3 is not.

**3. Deterministic functions of the calendar.** Month, season and the sine and
cosine of day of year differ enormously between one quarter and a multi-year
reference, because one quarter is one season. That is the calendar, not drift.
Left in, they held the detector at PSI around 6 in every quarter including stable
ones.

Excluding all three classes leaves 19 monitored features and a detector that
behaves: WARNING in 2020Q1, CRITICAL in 2020Q2 on intake condition and intake
type, and a mixture afterwards.

We also compared reference strategies. A fixed reference correctly says "the world
you trained on is gone" but never clears, so staff stop reading it. A
quarter-over-quarter reference is worse: shelter intake is seasonal, so it
returned CRITICAL for every comparison in the series including the stable 2019
quarters, with `season` as the worst feature every time. A **year-over-year**
reference removes the seasonal cycle by construction and localises the event: two
of eight quarters critical, with 2020Q2 against 2019Q2 correctly flagged on intake
type. A deployed system wants both: the fixed reference to say whether the model
is still inside its training domain, the year-over-year one to say when something
just happened.

### K. What retraining recovered

We simulate the operational response: on 1 January 2021, with alarms having fired
for months, retrain on everything through June 2020 and calibrate on the second
half of 2020, then evaluate both models on 2021 (11,336 animals).

The stale model scores AUC 0.813 with ECE 0.045. The retrained model scores AUC
0.815 with ECE 0.050. Retraining bought +0.001 AUC and made calibration *worse*.

The reason is the calibration window. The second half of 2020 was the most
unusual six months in the series, and an isotonic map fitted to it transfers badly
to 2021. This is a concrete argument for two things: a champion-versus-challenger
approval gate rather than automatic promotion, and choosing a calibration window
for stability rather than for recency.

It is also a partial indictment of our own gate. On a held-out fourth quarter of
2020, the challenger looked better than the champion on both AUC (0.793 against
0.770) and ECE (0.032 against 0.039), and our promotion rule would have said
PROMOTE. It would have been wrong. A three-month holdout drawn from inside an
anomalous period is not enough to certify a model for the year after it. The
gate we would now specify requires the challenger to hold up on at least two
non-adjacent holdout windows.

## VI. Discussion

### A. The correction is not optional

If a single result from this paper should travel, it is Table III. Every shelter
that reports a Kaplan-Meier adoption curve, and the field's analytics literature
largely does, is reporting a number wrong in a predictable direction, by 72
percent at 30 days and 104 percent at a year in this dataset. The fix is a
different estimator, not more data.

### B. Calibration is the thing that breaks

Section V.I is, we think, the most useful thing here for anyone deploying a
similar system. The usual monitoring metric is the usual modelling metric, and
across a real regime change the usual modelling metric held while the thing the
user actually reads drifted by eight points. Any monitoring design that watches
discrimination alone is watching the wrong number.

### C. The language model earned its place on one target

It would have been easy to report only the long-stay result: +0.035 AUC over no
breed features, +0.012 over a good keyword baseline, both *p* &lt; 0.001, on a
component that cost a few cents to run once. Reporting the 30-day result
alongside it, where the language model is statistically indistinguishable from a
regular expression, is the honest version, and it is also more useful: it tells a
reader which question the extra machinery is worth deploying for.

### D. Direction is an engineering decision

The same machinery that ranks animals for extra help could rank them for less.
Lepper et al. [1] framed exactly this prediction problem as adoption versus
euthanasia; Obermeyer et al. [13] showed an accurate model causing harm through
its choice of target. Between those two references sits an obligation.

We discharge it in code rather than in prose. The API embeds the use policy in
every response, so removing it from the interface is a visible diff. The
interface has no ranking that surfaces animals for removal, no "low priority"
state, and no probability shown to the public. The model card names the
out-of-scope uses. None of this makes misuse impossible; it makes it require
intent, which is the most a technical artefact can do.

There is also a feedback loop we cannot engineer away. A deployed queue changes
which animals get photographed, which changes their outcomes, which becomes next
year's training data. Our black-coat null result (Section V.C) is the clearest
illustration of the stake: had the model encoded the folk belief, it would have
begun making it true.

## VII. Limitations

**No behavioural data.** Protopopova et al. [2] show effects of 15 to 30 days
from in-kennel behaviour. None of it is in any public export. That is the ceiling
we are working under, and it is likely the largest single source of remaining
signal.

**Breed is a staff guess.** Olson et al. [8] measured 50 percent sensitivity.
Every breed result here is a result about the label.

**One shelter, unusual policy.** Austin is the largest no-kill municipal shelter
in the United States. Its outcome mix, particularly the 29 percent transfer rate,
is not typical, and the competing-risks correction would have a different
magnitude elsewhere, though the direction would be the same.

**The intervention effects are assumptions.** We can measure that the queue finds
long-stay animals 4.2 times better than chance. We cannot measure, from this data,
what happens when a shelter acts on it. The photography channel in particular has
*no* evidentiary basis in this dataset, because Austin's export contains no
photograph field, and the interface labels it as an assumption rather than a
measurement.

**Administrative censoring at one year** is a modelling choice. Moving it changes
the tail of the curves, though not the estimator comparison.

**The retraining experiment is a single simulated decision** at a single date. It
is a case study, not an estimate of the general value of retraining.

## VIII. Conclusion

We built a shelter adoption forecasting system on nine years of public records,
treated the duration properly as a competing-risks survival problem, calibrated
it, deployed it serverlessly, and monitored it across a real regime change.

The prediction results are solid and unspectacular: ROC AUC 0.803 for 30-day
adoption and 0.765 for 60-day long-stay risk, with an expected calibration error
of 0.023, and a queue whose top 50 is 4.2 times better than chance at finding the
animals who will still be there in two months. That is enough to be useful to an
operations team, and we have been careful not to claim more.

The methodological results are the ones we would defend hardest. The estimator
the field uses overstates 30-day adoption by 72 percent on this data. Calibration
and discrimination fail separately, and a monitoring design that watches only the
second will miss the first for months. A language model earns its keep on one
target and not another, and saying so is more useful than averaging. Two features
that looked harmless were actively harmful in deployment, and we found them only
because they broke a detector. And three whole classes of feature will silently
render a standard drift monitor useless if nobody checks.

Future work: recovering a photograph-quality signal, which is the largest missing
feature and is in principle available from listing images; extending to a second
shelter to test transfer; and a prospective evaluation, which is the only way to
learn whether a queue like this changes outcomes rather than merely predicting
them.

<!-- COLUMNS_END -->

<div class="references">

## Data and code availability

All data used is public. The Austin feeds are available from the City of Austin
Open Data Portal under the Public Domain Dedication and License. The full
pipeline, the analysis scripts that produced every number in this paper, the
structured breed reference, the infrastructure template and the model card are in
the project repository. Every figure and table is generated from
`results/MEASURED_RESULTS.json`, which is itself assembled from the analysis
outputs, so no number in this paper was transcribed by hand.

## References

1. M. Lepper, P. H. Kass and L. A. Hart, "Prediction of adoption versus euthanasia among dogs and cats in a California animal shelter," *Journal of Applied Animal Welfare Science*, vol. 5, no. 1, pp. 29–42, 2002. DOI: 10.1207/S15327604JAWS0501_3.
2. A. Protopopova, L. R. Mehrkam, M. M. Boggess and C. D. L. Wynne, "In-kennel behavior predicts length of stay in shelter dogs," *PLOS ONE*, vol. 9, no. 12, e114319, 2014. DOI: 10.1371/journal.pone.0114319.
3. N. Janke, O. Berke, T. Flockhart, S. Bateman and J. B. Coe, "Risk factors affecting length of stay of cats in an animal shelter: a case study at the Guelph Humane Society, 2011–2016," *Preventive Veterinary Medicine*, vol. 148, pp. 44–48, 2017.
4. J. Bradley and S. Rajendran, "Increasing adoption rates at animal shelters: a two-phase approach to predict length of stay and optimal shelter allocation," *BMC Veterinary Research*, vol. 17, art. 70, 2021. DOI: 10.1186/s12917-020-02728-2.
5. P. C. Austin, D. S. Lee and J. P. Fine, "Introduction to the analysis of survival data in the presence of competing risks," *Circulation*, 2016. DOI: 10.1161/CIRCULATIONAHA.115.017719.
6. E. Graf, C. Schmoor, W. Sauerbrei and M. Schumacher, "Assessment and comparison of prognostic classification schemes for survival data," *Statistics in Medicine*, vol. 18, no. 17–18, pp. 2529–2545, 1999.
7. M. L. Mavrovouniotis, "Use of Kaplan-Meier and Cox regressions in the distribution of length of stay in animal shelters for pre-specified calendar periods," *PLOS ONE*, vol. 21, no. 1, e0342102, 2026. DOI: 10.1371/journal.pone.0342102.
8. K. R. Olson, J. K. Levy, B. Norby, M. M. Crandall, J. E. Broadhurst, S. Jacks, R. C. Barton and M. S. Zimmerman, "Inconsistent identification of pit bull-type dogs by shelter staff," *The Veterinary Journal*, vol. 206, pp. 197–202, 2015.
9. J. Sinski, R. M. Carini and J. D. Weber, "Putting (big) black dog syndrome to the test: evidence from a large metropolitan shelter," *Anthrozoös*, vol. 29, no. 4, 2016. DOI: 10.1080/08927936.2016.1228769.
10. D. Sculley, G. Holt, D. Golovin, E. Davydov, T. Phillips, D. Ebner, V. Chaudhary, M. Young, J.-F. Crespo and D. Dennison, "Hidden technical debt in machine learning systems," in *Advances in Neural Information Processing Systems 28*, 2015, pp. 2503–2511.
11. S. M. Lundberg and S.-I. Lee, "A unified approach to interpreting model predictions," in *Advances in Neural Information Processing Systems 30*, 2017.
12. M. Mitchell, S. Wu, A. Zaldivar, P. Barnes, L. Vasserman, B. Hutchinson, E. Spitzer, I. D. Raji and T. Gebru, "Model cards for model reporting," in *Proc. Conference on Fairness, Accountability, and Transparency (FAT\* '19)*, 2019. DOI: 10.1145/3287560.3287596.
13. Z. Obermeyer, B. Powers, C. Vogeli and S. Mullainathan, "Dissecting racial bias in an algorithm used to manage the health of populations," *Science*, vol. 366, no. 6464, pp. 447–453, 2019. DOI: 10.1126/science.aax2342.
14. G. Ke, Q. Meng, T. Finley, T. Wang, W. Chen, W. Ma, Q. Ye and T.-Y. Liu, "LightGBM: a highly efficient gradient boosting decision tree," in *Advances in Neural Information Processing Systems 30*, 2017.
15. T. Chen and C. Guestrin, "XGBoost: a scalable tree boosting system," in *Proc. 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining*, 2016, pp. 785–794. DOI: 10.1145/2939672.2939785.
16. C. Davidson-Pilon, "lifelines: survival analysis in Python," *Journal of Open Source Software*, vol. 4, no. 40, p. 1317, 2019. DOI: 10.21105/joss.01317.
17. City of Austin, "Austin Animal Center Intakes," City of Austin Open Data Portal, dataset `wter-evkm`. https://data.austintexas.gov/resource/wter-evkm.json
18. City of Austin, "Austin Animal Center Outcomes," City of Austin Open Data Portal, dataset `9t4d-g238`. https://data.austintexas.gov/resource/9t4d-g238.json
19. National Weather Service, "Web service API." https://www.weather.gov/documentation/services-web-api
20. RescueGroups.org, "Adoptable Pet Data API." https://rescuegroups.org/services/adoptable-pet-data-api/

## Appendix A. Reproduction

```
make setup                  # environment and dependencies
python analysis/01_build_episodes.py    # episode table and audit
python analysis/02_build_features.py    # 56-feature matrix
python analysis/03_train_eval.py        # four targets, four models
python analysis/04_ablations.py         # feature blocks, breed, weather, leakage
python analysis/05_survival.py          # KM, Aalen-Johansen, Cox, discrete hazard
python analysis/06_interpret.py         # SHAP, permutation, partial dependence
python analysis/07_drift.py             # drift, monitoring, retraining
python analysis/09_time_features.py     # the monotone time feature experiment
python analysis/08_figures.py           # every figure in this paper
python analysis/10_export.py            # MEASURED_RESULTS.json and site fixtures
```

Total runtime is about 35 minutes on two cores. Random seed 20260820 throughout.

## Appendix B. Measured AWS cost

Monthly, us-east-1, at the volumes this project generates: S3 storage and requests
$0.42; Redshift Serverless at 8 RPU for roughly 20 minutes a day $14.20; four
ingestion Lambdas $0.09; the monitoring Lambda $0.31; API Gateway HTTP API at
50,000 requests $0.05; Kinesis Data Streams on-demand plus Firehose $12.40;
CloudWatch metrics, alarms and logs $3.80; Secrets Manager $0.80; KMS $2.00. Total
**$34.07 per month** with no SageMaker endpoint running. A persistent
`ml.m5.xlarge` real-time endpoint adds roughly $169 per month, which is why the
default deployment uses transient training jobs and creates the endpoint only for
demonstration. Training a single model on `ml.m5.xlarge` costs about $0.06.

</div>
