# Work Plan

<div class="doc-header">
<p>DTSC 3601: Data Science Studio 3, Predictive Analysis and Their Impacts</p>
<p><strong>SecondChance: shelter adoption forecasting for the Austin Animal Center</strong></p>
<p>Davis Higgins &nbsp;&middot;&nbsp; Submitted Tuesday, August 25, 2026</p>
</div>

## 1. Partners

Davis Higgins, working solo.

I considered forming a group and decided against it for a specific reason. The
project I want to build is a full serverless lifecycle: ingestion, warehouse,
training, an API, a monitoring loop and a front end. In a four person team that
splits into four people who each understand a quarter of it. Running it alone
means every architectural decision, every leakage check and every deployment step
passes through one set of hands, and I will be able to answer a question about
any part of it in the final presentation without saying "that was someone else's
piece." The cost is volume of work, which I have accounted for in the schedule in
section 4 by cutting scope in two named places rather than by hoping to work
faster.

If the workload proves unmanageable by the internal early draft deadline in Week
4, the fallback is described in section 5.

---

## 2. Direction

**The theme:** applying survival analysis and gradient boosting to operational
decisions in animal welfare, with the monitoring and governance apparatus that a
prediction affecting a living animal actually requires.

**The problem.** Municipal animal shelters run at capacity. Staff time,
photography, foster recruitment, behaviour support and adoption event slots are
all scarce, and they are currently allocated by intuition and by whoever happens
to be noticed. Some animals sit for months while nobody realises they are
sitting. The Austin Animal Center, the largest no-kill municipal shelter in the
United States, publishes every intake and every outcome it records, which makes
this a rare case where an operational allocation problem has a public, complete,
long-running dataset attached to it.

**What SecondChance does.** For every animal, at the moment it arrives, it
predicts:

- the probability of adoption within 7, 14 and 30 days
- the probability of still being in the shelter after 60 days, which is the
  shelter's own definition of a long-stay resident
- the full curve of adoption probability over time, and an expected number of
  days in care

Those predictions drive a ranked "needs attention" queue, a 30-day population
forecast for capacity planning, and an outreach planner that turns the queue into
a week of assignable work.

**Why survival analysis and not just classification.** Two thirds of the
technical interest in this project lives here. An animal still in the shelter on
the day the data was exported has not "failed to be adopted"; we simply do not
know yet. That is right censoring, and treating it as a negative label corrupts
the training set. Worse, an animal transferred to a rescue partner on day three
can never be adopted from Austin afterwards, so a transfer is a *competing risk*,
not ordinary censoring. Kaplan-Meier applied naively to this data will overstate
adoption, and I expect that overstatement to be large enough to be worth
measuring and reporting as a result in its own right.

**The methods I intend to use.** Cause-specific Cox proportional hazards and
Aalen-Johansen cumulative incidence for the survival side; gradient boosted trees
for the binary horizons; isotonic calibration on a held-out block; SHAP and
permutation importance for interpretability; population stability index and
Kolmogorov-Smirnov for input drift; and a language model called through Amazon
Bedrock to turn free text breed strings into structured attributes.

**The ethical constraint, stated up front because it shapes the design.** This
model must never be used to justify euthanasia, intake refusal, or reducing the
care an animal receives. A low predicted adoption probability is a request for
more help, not less. This is not a disclaimer I intend to add at the end. It
determines what the API returns, what the interface can display, and what goes in
the model card.

**What I am most interested in learning.** How a prediction pipeline behaves when
the world underneath it changes. The Austin data spans March 2020, when the
shelter's operating model changed abruptly, and I want to see what a model
trained on 2018 does when it meets 2020, whether standard drift detection catches
it, and how much retraining actually recovers.

---

## 3. Sources

### 3.1 Data sources and APIs

**Austin Animal Center Intakes.** City of Austin Open Data Portal, Socrata
dataset `wter-evkm`. One row per arrival, from 1 October 2013 to the present:
animal ID, timestamp, found location, intake type, intake condition, species,
sex, age, breed and colour. Roughly 137,000 rows as of March 2022.
`https://data.austintexas.gov/resource/wter-evkm.json`

**Austin Animal Center Outcomes.** Same portal, dataset `9t4d-g238`. One row per
departure over the same period: outcome type, outcome subtype, date of birth,
species, sex and age at outcome. Roughly 137,000 rows.
`https://data.austintexas.gov/resource/9t4d-g238.json`

These two are the heart of the project. They share an animal ID, which means the
intake and outcome events can be paired into a real episode with a real duration
label, rather than a duration inferred from a proxy. Both are available through
the Socrata API with SoQL filtering, which supports incremental pulls. An
application token is free and lifts the rate limit; the API works without one at
a lower ceiling.

**National Weather Service API.** `https://api.weather.gov`. Hourly observations
for the Austin station, aggregated to daily maximum, minimum and precipitation.
No key required, but the API rejects requests that do not send a descriptive
User-Agent header. Used to test whether weather around the intake date affects
adoption speed, which is plausible because adoption is a walk-in activity.
Documentation: `https://www.weather.gov/documentation/services-web-api`

**RescueGroups.org Adoptable Pet API.** `https://api.rescuegroups.org/v5/public`.
Current adoptable listings across partner organisations, filterable by radius
from a postal code. Provides regional supply context, which matters: a shepherd
mix is harder to place in a week when forty other Austin-area organisations are
also listing shepherd mixes. Requires a free API key from their developer portal.
Documentation: `https://rescuegroups.org/services/adoptable-pet-data-api/`

**Amazon Bedrock.** Not a data source but an API in the pipeline. Used to convert
Austin's 2,736 distinct free-text breed strings into structured attributes.

### 3.2 Literature I have already read

These are the papers the project is built on. The full literature review in Week
2 will expand and synthesise them; this is what I have found so far and why each
one matters.

1. **Bradley, J. and Rajendran, S. (2021).** "Increasing adoption rates at animal
   shelters: a two-phase approach to predict length of stay and optimal shelter
   allocation." *BMC Veterinary Research* 17, article 70.
   DOI: 10.1186/s12917-020-02728-2.
   The closest existing work: 114,256 records from shelters in five states,
   comparing logistic regression, neural networks, random forest and gradient
   boosting. Gradient boosting won at roughly 60 percent across precision, recall
   and F1. The gap I intend to fill is that they treat length of stay as a
   classification problem and do not handle censoring or competing risks at all.

2. **Protopopova, A., Mehrkam, L. R., Boggess, M. M. and Wynne, C. D. L. (2014).**
   "In-Kennel Behavior Predicts Length of Stay in Shelter Dogs." *PLOS ONE* 9(12):
   e114319. DOI: 10.1371/journal.pone.0114319.
   289 dogs, 1,766 video observations. Specific in-kennel behaviours predicted
   length of stay: leaning on the enclosure wall added about 30 days. Establishes
   that length of stay is predictable from observable features, and that
   morphology (small, long coat, lap dog breeds) shortens stays independently of
   behaviour. Their behavioural variables are exactly what Austin's public export
   does not contain, which bounds how well my model can possibly do.

3. **Lepper, M., Kass, P. H. and Hart, L. A. (2002).** "Prediction of adoption
   versus euthanasia among dogs and cats in a California animal shelter."
   *Journal of Applied Animal Welfare Science* 5(1), 29-42.
   DOI: 10.1207/S15327604JAWS0501_3.
   4,813 cats and 3,301 dogs. Age, sex, coat colour, reason for relinquishment,
   breed and purebred status all predicted adoption. The foundational paper for
   the feature set, and a useful ethical contrast: it frames the problem as
   adoption versus euthanasia, which is the framing I am deliberately refusing.

4. **Olson, K. R., Levy, J. K., Norby, B., Crandall, M. M., Broadhurst, J. E.,
   Jacks, S., Barton, R. C. and Zimmerman, M. S. (2015).** "Inconsistent
   identification of pit bull-type dogs by shelter staff." *The Veterinary
   Journal* 206, 197-202.
   120 dogs, 16 raters, visual identification compared against DNA. Median
   agreement with DNA was 67 to 78 percent and average sensitivity for identifying
   pit bull-type dogs was 50 percent. This is critical for me: the breed field I
   am about to build features from is a staff guess, and this paper quantifies how
   unreliable that guess is. Any breed-related finding has to be reported as a
   finding about the *label*, not about the animal's genetics.

5. **Sinski, J., Carini, R. M. and Weber, J. D. (2016).** "Putting (Big) Black Dog
   Syndrome to the Test: Evidence from a Large Metropolitan Shelter."
   *Anthrozoös* 29(4). DOI: 10.1080/08927936.2016.1228769.
   Tests the widespread shelter belief that black dogs are adopted more slowly and
   does not find support for it. I intend to test the same thing in the Austin
   data, because a model that silently encoded the folk belief would help make it
   true.

6. **Mavrovouniotis, M. L. (2026).** "Use of Kaplan-Meier and Cox regressions in
   the distribution of length of stay in animal shelters for pre-specified
   calendar periods." *PLOS ONE* 21(1): e0342102.
   DOI: 10.1371/journal.pone.0342102.
   Argues that the standard way shelters compute length of stay, averaging over
   animals whose stay ended inside a reporting window, is systematically
   misleading, and proposes a Kaplan-Meier and Cox formulation with left
   truncation and right censoring instead. Directly validates the methodological
   choice at the centre of my project, with worked examples from Orange County
   showing mean length of stay rising from 15.1 to 20.8 days across COVID.

7. **Austin, P. C., Lee, D. S. and Fine, J. P. (2016).** "Introduction to the
   Analysis of Survival Data in the Presence of Competing Risks." *Circulation*.
   The methodological reference for the competing risks treatment. Explains why
   the cause-specific hazard and the cumulative incidence function answer
   different questions and why conflating them overstates the event of interest.

8. **Sculley, D., Holt, G., Golovin, D., Davydov, E., Phillips, T., Ebner, D.,
   Chaudhary, V., Young, M., Crespo, J.-F. and Dennison, D. (2015).** "Hidden
   Technical Debt in Machine Learning Systems." *Advances in Neural Information
   Processing Systems 28*, 2503-2511.
   The argument that the model is a small part of a real machine learning system,
   and that the surrounding infrastructure is where the maintenance cost lives.
   This is effectively the thesis statement of the course's final product
   requirement, and it shapes how I am scoping the build.

9. **Mitchell, M., Wu, S., Zaldivar, A., Barnes, P., Vasserman, L., Hutchinson,
   B., Spitzer, E., Raji, I. D. and Gebru, T. (2019).** "Model Cards for Model
   Reporting." *Proceedings of the Conference on Fairness, Accountability, and
   Transparency (FAT\* '19)*. DOI: 10.1145/3287560.3287596.
   The format I will use for the governance deliverable, including the
   subgroup-disaggregated evaluation and the explicit statement of out-of-scope
   uses.

10. **Obermeyer, Z., Powers, B., Vogeli, C. and Mullainathan, S. (2019).**
    "Dissecting racial bias in an algorithm used to manage the health of
    populations." *Science* 366, 447-453. DOI: 10.1126/science.aax2342.
    A prediction system that was accurate at what it measured and harmful because
    of what it measured. The cautionary case for why I am checking subgroup
    performance by breed label rather than assuming aggregate accuracy is enough.

### 3.3 Technical references

- **Graf, E., Schmoor, C., Sauerbrei, W. and Schumacher, M. (1999).** "Assessment
  and comparison of prognostic classification schemes for survival data."
  *Statistics in Medicine* 18(17-18), 2529-2545. The inverse probability of
  censoring weighted Brier score I will use to evaluate the survival model.
- **Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q. and Liu,
  T.-Y. (2017).** "LightGBM: A Highly Efficient Gradient Boosting Decision Tree."
  *Advances in Neural Information Processing Systems 30*.
- **Chen, T. and Guestrin, C. (2016).** "XGBoost: A Scalable Tree Boosting
  System." *Proceedings of the 22nd ACM SIGKDD International Conference on
  Knowledge Discovery and Data Mining*, 785-794. DOI: 10.1145/2939672.2939785.
- **Lundberg, S. M. and Lee, S.-I. (2017).** "A Unified Approach to Interpreting
  Model Predictions." *Advances in Neural Information Processing Systems 30*.
- `lifelines` documentation for the Kaplan-Meier, Aalen-Johansen and Cox
  implementations: `https://lifelines.readthedocs.io`
- AWS Serverless Application Model documentation for the infrastructure as code:
  `https://docs.aws.amazon.com/serverless-application-model/`
- AWS documentation on Redshift `COPY` from S3, SageMaker training jobs and
  endpoints, and CloudWatch custom metrics and alarms.

### 3.4 Where I looked and did not find what I needed

Worth recording so I do not search the same ground twice. I looked for shelter
datasets with behavioural assessments attached, because Protopopova et al. show
that is where the remaining signal is. Sonoma County, Dallas and Long Beach all
publish outcome data but none of them publish behavioural evaluations, and the
Austin export does not either. I also looked at the Kaggle "Shelter Animal
Outcomes" competition data and found it is a subset of the same Austin feed with
fewer columns and a shorter window, so there is no reason to prefer it over the
live API.

---

## 4. Work Schedule

The course deliverable schedule sets the hard dates. My internal plan front-loads
the data engineering, because everything downstream is blocked on the episode
join being correct, and a mistake there is silent.

### 4a. How long on the exploration phase

**Eight days, 18 to 25 August, roughly 22 hours.** This is Week 1 and the first
half of Week 2, running in parallel with writing this document.

The exploration phase is not "look at some histograms." It is answering three
questions that determine whether the project is viable at all:

1. Can intakes and outcomes actually be paired into episodes? The two feeds share
   an animal ID but roughly one animal in eleven appears more than once, so a
   naive join on ID produces a cross product. I need a sequence alignment within
   each animal, and I need to measure how many episodes it fails on.
2. How many animals are still in the shelter at the export cutoff, and how many
   have an intake with no outcome ever recorded? The first group are legitimate
   censored observations. The second group are missing paperwork, and mixing them
   would poison both the survival curves and the occupancy feature.
3. Which fields are available at intake time and which are only known at outcome?
   The outcomes feed carries `Sex upon Outcome` and `Age upon Outcome`. Austin
   neuters on the way out, so `Sex upon Outcome` is close to a direct readout of
   whether the animal was adopted. Any model that touches it will look superb and
   be worthless. Building the leakage boundary explicitly is exploration work.

Deliverable at the end of this phase: a written data audit with counts for every
join outcome, and a frozen episode table.

### 4b. When the project outline will be ready

**Draft by Thursday 27 August, finalised for submission Tuesday 1 September.**

The outline is due in Week 3. I want it written after the exploration phase
rather than before, because the outline commits me to a set of results sections
and I would rather commit to sections I already know the data can support. By 27
August I will know the episode count, the censoring rate and the class balance
for each target, which is enough to write an honest abstract and a methods
section that will not need rewriting.

The literature review is due 27 August and I am writing it in parallel during
Week 2, drawing on the ten papers in section 3.2 plus whatever the citation
chains surface.

### 4c. How much time on coding

**Roughly 55 hours across four weeks, 25 August to 20 September**, split as:

| Block | Days | Hours | What |
|---|---|---|---|
| Ingestion and warehouse | 25-30 Aug | 12 | Socrata, NWS and RescueGroups clients with retry and paging; S3 landing zone; Redshift schema; the `COPY` path; the episode builder as production code with tests |
| Feature engineering | 31 Aug - 3 Sept | 10 | Intake-time-only feature set; the Bedrock breed structuring step and its evaluation; the shelter occupancy sweep |
| Modelling | 4-10 Sept | 14 | Baselines, gradient boosting on four targets, Cox, Aalen-Johansen, the discrete-time competing risk hazard model, isotonic calibration, bootstrap intervals, subgroup evaluation |
| Interpretability and monitoring | 11-15 Sept | 9 | SHAP, permutation importance, partial dependence; PSI and KS drift; the monthly performance report; CloudWatch metrics and alarms; the retraining experiment |
| Deployment and the front end | 16-20 Sept | 10 | SAM template, SageMaker endpoint, API Gateway, the website build |

I am deliberately allocating more time to the pipeline around the model than to
the model itself. Following Sculley et al., that is where the work actually is,
and it is also where this course's grading weight sits.

**Two named scope cuts, decided now rather than under pressure later.** First, I
will not build a trained population forecasting model; the 30-day capacity
projection will be a seasonal baseline, clearly labelled as such in the interface.
Second, the return-after-adoption prediction listed in my original concept is cut,
because Austin's export does not reliably distinguish a returned adoption from a
new stray intake, and I would be modelling noise.

### 4d. When documentation starts

**Documentation starts on day one, 18 August, and is never a separate phase.**

Concretely: every module gets its docstring when it is written, not afterwards.
The decision log gets an entry the same day a decision is made, because the
reasoning behind "why is the occupancy feature capped at 289 days" is completely
gone from my memory in three weeks. The data dictionary is written alongside the
feature code. The model card is drafted as soon as the first model trains, with
the metrics left explicitly marked as pending until they are measured.

The pieces that genuinely are a phase:

- **1-3 September:** the AWS setup runbook, written while I am doing the setup,
  because that is the only time the steps are actually known.
- **11-14 September:** the paper draft, due Week 5 on 17 September.
- **21-24 September:** revision after peer review, plus the final paper.
- **25-28 September:** the presentation and rehearsal.

### 4e. When the initial demo is finished

**Working demo by Thursday 10 September**, matching the internal early-draft
deadline in Week 4.

"Working" here means specific things: the data pipeline runs end to end from API
to episode table; at least one model is trained and evaluated on a temporal split
with real numbers; and the website renders those real numbers from a static
export. It does not need the live SageMaker endpoint, and it does not need the
monitoring loop. Those land by 20 September.

The reason for the early date is that a demo is the fastest way to discover that
a number is wrong. A metric that looks fine in a notebook looks obviously wrong
when it is rendered next to an animal's name and a photograph.

### 4f. Full schedule against the course deadlines

| Week | Dates | Course deliverable | My work |
|---|---|---|---|
| 1 | Aug 18-24 | Quiz 1; work plan assigned | Data exploration; API smoke tests; episode join |
| 2 | Aug 25-31 | **Work plan due Aug 25; literature review due Aug 27** | Ingestion and warehouse build; outline drafted |
| 3 | Sept 1-7 | **Project outline due**; midterm prep | Feature engineering; AWS setup and runbook; LLM breed step |
| 4 | Sept 8-14 | Midterm; internal early draft deadline | **Demo by Sept 10**; modelling; interpretability |
| 5 | Sept 15-21 | **Project draft due Sept 17**; review peer draft | Monitoring and drift; deployment; paper draft |
| 6 | Sept 22-28 | **Two peer reviews due Sept 24**; finalise | Revision; front end polish; presentation build |
| 7 | Sept 29 | **Final paper and presentation** | Rehearsal; submission |

Working rhythm: 12 to 15 hours a week, roughly two evenings plus one long weekend
block. That is realistic alongside a full course load, and it is the number I will
be measuring myself against rather than an optimistic one.

---

## 5. Risk Analysis

Seven risks, in descending order of how much they would actually hurt.

### Risk 1: Silent label leakage from the outcomes feed
**Likelihood: high if I am careless. Impact: fatal.**

The outcomes table carries `Sex upon Outcome` and `Age upon Outcome`. Austin
sterilises animals before adoption, so an animal that leaves neutered was very
probably adopted. Join that column into the feature matrix and the model reports
an AUC in the high nineties and predicts nothing useful, because at intake time
nobody knows it.

**Mitigation.** A hard architectural boundary: the feature construction module
only ever reads intake-side columns, enforced by an explicit allow-list rather
than by remembering. Plus a shuffled-label control run: train the full model on
randomly permuted labels and confirm the AUC lands at 0.5. If a leaked column
exists, the control will not come back to chance. This costs one extra training
run and it is the single highest value check in the project.

### Risk 2: The episode join is wrong in a way that looks right
**Likelihood: moderate. Impact: severe.**

About one animal in eleven has multiple intakes. A join on animal ID alone
produces a cross product, and a cross product still produces plausible-looking
durations. The failure is invisible unless you look for it.

**Mitigation.** Sequence alignment within each animal rather than a key join: the
k-th intake is closed by the first outcome that occurs at or after it and before
the (k+1)-th intake. Every rejection is counted. I will report the number of
episodes built, matched, left open, and rejected because the candidate outcome
fell after the next arrival, and I will check that no episode has a negative
duration and that no animal changes species between intake and outcome. If the
audit numbers do not add up, I stop and fix the join before doing anything else.

### Risk 3: The 2020 distribution shift breaks the model
**Likelihood: certain. Impact: moderate, and it is also an opportunity.**

The Austin shelter's operating model changed in March 2020. Any model trained on
earlier data and tested across that boundary will degrade.

**Mitigation, and reframing.** I am not going to avoid this by choosing a split
that hides it. I am going to put the whole of 2020 and 2021 in the test block
deliberately, and treat the degradation as the monitoring case study the course
asks for. A real, dated, externally caused shift is far better evidence that
drift detection works than a synthetic one I inject myself. The risk that remains
is that the degradation is so severe the model looks useless, in which case the
honest result is that it looks useless across a regime change, and the paper says
so and reports what retraining recovers.

### Risk 4: AWS cost overrun
**Likelihood: moderate. Impact: moderate, and personal.**

An idle Redshift provisioned cluster is roughly 180 dollars a month. A SageMaker
endpoint left running on an `ml.m5.xlarge` is about 170 dollars a month. Two
forgotten resources over a six-week project is real money out of my own pocket.

**Mitigation.** Redshift Serverless at the minimum 8 RPU rather than a
provisioned cluster, so idle time costs nothing. SageMaker endpoints created for
demonstration and torn down the same day, with the training path using transient
jobs. An AWS Budgets alert at 25 dollars and a hard one at 50. A documented
teardown command in the runbook, and a calendar reminder to run it. The cost model
goes in the appendix of the paper with the actual figures rather than estimates.

### Risk 5: The RescueGroups API key does not arrive in time
**Likelihood: moderate. Impact: low.**

Their key is issued by a human process with no published turnaround.

**Mitigation.** The RescueGroups feed powers the public discovery page and
regional supply context. Neither is load bearing for the core prediction. The
ingestion Lambda already treats a missing key as "skip this run" rather than an
error, and the website's discovery page falls back to the Austin data. If the key
never arrives, the paper reports three data sources instead of four and explains
why. I am requesting the key in Week 1 so there is maximum time for it to land.

### Risk 6: The breed field is a staff guess and I am about to build features on it
**Likelihood: certain. Impact: moderate, mostly to the interpretation.**

Olson et al. measured 50 percent average sensitivity for visually identifying
pit bull-type dogs. Whatever my model learns about "bully-type breeds" is
learning about the label a staff member applied, not about the animal.

**Mitigation.** This one cannot be engineered away, so it gets handled honestly.
Every breed-related result will be stated as a result about the recorded label.
The model card will carry the Olson finding explicitly. And I will report the
breed subgroup performance rather than only the aggregate, because if the model is
worse for the animals carrying a contested label, that is exactly the thing a
reader needs to know.

### Risk 7: Scope, given that I am working alone
**Likelihood: moderate. Impact: moderate.**

Ingestion, warehouse, four models, survival analysis, an LLM step, monitoring,
deployment, a website, and seven written deliverables is a lot for one person in
six weeks.

**Mitigation.** The two scope cuts in section 4c are already made. Beyond those,
the priority order if I fall behind is: the data pipeline and the leakage checks
are non-negotiable; the survival analysis is the intellectual core and stays; the
monitoring loop stays because it is the course's central requirement; the website
degrades to a static export with real numbers rather than a live API; and the
RescueGroups integration is the first thing cut entirely. I will make that call at
the Week 4 internal deadline based on where the demo actually is, not at Week 6
when there is no room left to recover.
