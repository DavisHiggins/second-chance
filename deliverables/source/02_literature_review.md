# Literature Review

<div class="doc-header">
<p>DTSC 3601: Data Science Studio 3, Predictive Analysis and Their Impacts</p>
<p><strong>SecondChance: shelter adoption forecasting for the Austin Animal Center</strong></p>
<p>Davis Higgins &nbsp;&middot;&nbsp; Submitted Thursday, August 27, 2026</p>
</div>

## Scope and central argument

This review covers three bodies of work that have to be brought together before
SecondChance can be built responsibly: empirical studies of what predicts how
long a shelter animal waits, the statistical literature on measuring duration
when observation is incomplete, and the machine learning literature on deploying,
explaining and monitoring a model whose output affects a living creature.

The argument the review builds toward is this. **Shelter length of stay is
predictable, and the field already knows roughly which features predict it. What
the field has not done is treat it as the survival problem it actually is, in the
presence of competing risks, with the resulting probabilities calibrated well
enough for an operations team to act on and monitored well enough to notice when
they stop being true.** Each of those four clauses is a gap, each is documented
below by the papers that come closest without closing it, and SecondChance is the
attempt to close all four at once on a single public dataset.

A note on what I am not reviewing. There is a large literature on shelter
euthanasia prediction. I have read enough of it to place my own work against it,
and I cite one foundational example, but the framing of that literature is the
framing this project explicitly refuses. I say so in section 5 rather than
pretending the work does not exist.

---

## 1. What predicts how long an animal waits

### 1.1 The foundational descriptive work

**Lepper, Kass and Hart (2002)** analysed 4,813 cats and 3,301 dogs impounded by
Sacramento County between September 1994 and May 1995, and asked what separated
animals who were adopted from animals who were euthanised [1]. For cats, age, sex,
coat colour and reason for relinquishment mattered. For dogs, the same list plus
breed, purebred status and injury status. The authors framed the practical
implication as resource allocation: shelter staff "could utilise this information
to increase adoption" of animals the public overlooks.

This is the paper the feature set of every subsequent shelter model traces back
to, including mine. Its limitation is the one it shares with its era: it is a
cross-sectional logistic regression on a nine-month window, it models a binary
terminal outcome rather than a duration, and it makes no attempt to say anything
about *when* an adoption happens. An animal adopted on day two and an animal
adopted on day two hundred are the same observation in this analysis. For a
shelter deciding what to do this week, that is exactly the information that has
been discarded.

The second limitation is the framing. Adoption versus euthanasia is a
comparison that only makes sense in a shelter that euthanises for space. Austin
does not, and framing the prediction problem that way in a modern no-kill context
produces a model whose most natural use is the one nobody should make of it.

### 1.2 Behaviour as a predictor, and the ceiling it implies

**Protopopova, Mehrkam, Boggess and Wynne (2014)** recorded 1,766 video
observations of 289 shelter dogs across their entire stays and regressed length of
stay on spontaneous in-kennel behaviour [2]. Three behaviours lengthened stays
significantly: leaning or rubbing on the enclosure wall added roughly 30 days,
facing away from the kennel front added about 15, and standing added about 7.
Back-and-forth motion added roughly 24 days. Behaviours that shelter staff
commonly believe matter, including barking, jumping at the door and sitting, did
not predict adoption at all.

Two things make this paper important for my project, and they pull in opposite
directions.

The encouraging finding is that length of stay is genuinely predictable, with
effect sizes measured in weeks rather than hours. The discouraging one, for me
specifically, is *what* predicted it. Every one of those variables requires
somebody to watch a dog in its kennel and code its behaviour. None of them appear
in any public shelter data export, including Austin's. Protopopova et al. are, in
effect, describing the ceiling that a model built on administrative records
cannot reach.

The paper also reports that morphologically preferred dogs, meaning small, long
coated, and of ratter, herder or lap dog type, had significantly shorter stays
regardless of behaviour. That finding is directly actionable for me, because
morphology *is* recoverable from an administrative record if the breed field can
be turned into structured attributes. It is one of the reasons SecondChance
includes a breed structuring step rather than one-hot encoding the raw string.

Its stated limitations are worth repeating: the design is correlational, it is a
single county shelter, and the observers were not adopters, so the dogs may have
behaved differently than they would for a member of the public.

### 1.3 The closest existing machine learning work

**Bradley and Rajendran (2021)** is the paper SecondChance has to be measured
against [3]. They assembled 114,256 records (50,466 cats and 63,790 dogs) from
shelters in five states, drawing on public portals in Kentucky, California, Texas
and Indiana plus direct collection from Colorado and Arizona, and compared
logistic regression, artificial neural networks, random forest and gradient
boosting on an 80/20 split with tenfold cross-validation. Gradient boosting won,
at roughly 60 percent averaged across precision, recall and F1, with random forest
second. Age mattered most, particularly at the two extremes of puppies and
seniors, followed by multicolour coat and by size at the large and small ends.
Gender, animal type and medium size were not significant.

Their two-phase framing is genuinely useful: predict length of stay, then use the
prediction to allocate animals across shelters in a network. That is the same
"prediction into an allocation decision" move SecondChance makes, and it is the
right one.

Three gaps remain, and they are the gaps my project is built in.

**First, and most importantly, they treat length of stay as classification.** An
animal is placed in a duration bucket and the model predicts the bucket. This
discards the two structural properties that make shelter duration data what it
is. An animal still in the shelter when the data was pulled has no bucket, and
either gets dropped, which biases toward fast outcomes, or gets assigned its
current elapsed time, which is simply wrong. And an animal that left for a reason
other than adoption is not a slow adoption; it is an animal that stopped being at
risk of adoption entirely. Neither issue is addressed.

**Second, they do not report calibration.** Precision, recall and F1 describe
ranking and thresholding. They say nothing about whether a predicted probability
means what it says. For a system whose entire product surface is a number a staff
member reads as a percentage, that is the more important property.

**Third, they do not report subgroup performance.** A model at 60 percent overall
could be at 75 percent for one group and 45 percent for another, and in a domain
where breed labels carry real consequences, that difference is the finding.

The authors are candid about their own limitations: no behavioural data, a desire
for more comprehensive collection, and reliance on relatively simple algorithms.

### 1.4 Risk factors specific to cats

**Janke, Berke, Flockhart, Bateman and Coe (2017)** studied length of stay for
cats at the Guelph Humane Society across 2011 to 2016 [4]. The cat-specific
literature matters here because roughly 40 percent of Austin's intakes are cats
and, as my own results show, the shape of their adoption curve is markedly
different: cats leave more slowly than dogs in the first fortnight and then catch
up almost completely by three months, largely because of the foster pathway for
neonatal kittens. Any model that pools species without letting the species
interact with time is going to be wrong about both.

---

## 2. The measurement problem nobody in the applied literature has solved

This section is the intellectual centre of the review, because it is where the
applied shelter work and the statistical work fail to meet.

### 2.1 Length of stay is routinely computed wrongly

**Mavrovouniotis (2026)** makes an argument that should be uncomfortable reading
for the whole shelter analytics field [5]. The standard way a shelter computes
its length of stay statistic, which the author calls HistLOS, averages the stays
of animals whose stay *ended* within a reporting period. That definition has a
perverse property: when a group of long staying residents finally departs, the
statistic gets worse, even though what actually happened is unambiguously good
news. Conversely, in a quarter with few departures, animals accumulating in the
building are invisible to the metric entirely.

The proposed replacement, ExitLOS, uses Kaplan-Meier and Cox regression with left
truncation and right censoring so that every animal present during any part of a
calendar period contributes their partial stay. Applied to Orange County Animal
Care data from 2018 to 2024, the corrected mean rose from 15.1 days before COVID
to 20.8 days after, with the 90th percentile rising from 27 to 46 days, and eight
of 23 quarterly comparisons showed statistically significant change. The author
translates the 37.6 percent increase into staffing: roughly three to four
additional full-time positions.

This paper validates the core methodological choice of my project from within the
domain itself, and it is recent enough that the applied shelter literature has not
absorbed it yet. It is also the clearest demonstration I have found that the
methodological point is not academic: it changes a staffing number.

What it does not do is prediction. It is a measurement paper. It tells you how to
describe the distribution of stays correctly; it does not tell you which animal
arriving today is going to be at the wrong end of it.

### 2.2 Competing risks, and why cause-specific Kaplan-Meier is not enough

**Austin, Lee and Fine (2016)** give the standard treatment of survival data when
more than one kind of exit is possible [6]. Their central point is that the
cause-specific hazard and the cumulative incidence function answer different
questions, and that the naive Kaplan-Meier estimate, computed by treating
competing events as ordinary censoring, systematically overstates the incidence of
the event of interest. The reason is an assumption that becomes obviously false
once it is stated: censoring assumes the animal remains *at risk* of the event.
An animal transferred to a rescue partner on day three is not at risk of being
adopted from Austin on day thirty. It is gone.

This is not a small correction in shelter data. In the Austin records, 51.3
percent of episode exits are something other than an adoption. My own measurement,
reported in the paper, is that the naive Kaplan-Meier estimate overstates
30-day adoption by 23.7 percentage points, a 72 percent relative overstatement,
and by day 365 it says 98.8 percent of animals are adopted when the correct
Aalen-Johansen figure is 48.3 percent. That is not a subtle bias. It is the
difference between a shelter believing essentially every animal eventually goes
home and knowing that fewer than half do from this building.

To my knowledge no published shelter analysis applies the competing risks
correction, and I have looked. That gap is the single most defensible
contribution SecondChance makes.

### 2.3 Evaluating a survival model honestly

**Graf, Schmoor, Sauerbrei and Schumacher (1999)** provide the inverse
probability of censoring weighted Brier score that makes survival model
comparison possible in the presence of censoring [7]. The construction matters
for a practical reason: without the weighting, a model that predicts every animal
stays forever scores well on a heavily censored sample, because most of the
observations agree with it up to the point where they disappear. The integrated
Brier score is the metric I use to compare the discrete-time hazard model against
a Kaplan-Meier baseline, and the weighting is what stops that comparison being
meaningless.

---

## 3. The measurement instrument is unreliable, and we should say so

**Olson, Levy, Norby, Crandall, Broadhurst, Jacks, Barton and Zimmerman (2015)**
did something that most people building models on shelter breed fields have not
read carefully enough [8]. They took 120 dogs at four Florida shelters, had 16
raters (three staff and one veterinarian per shelter) visually identify each one,
and compared those identifications against DNA analysis. Median agreement between
visual identification and DNA for the binary question "is this a pit bull-type
dog or not" ranged from 67 to 78 percent. The average sensitivity for identifying
pit bull-type dogs was 50 percent.

Fifty percent sensitivity on a binary judgement is the performance of a coin
toss, for the single most consequential label a shelter applies to a dog.

The implication for SecondChance is direct and I have built it into the design.
The Austin breed field is a staff guess. When my model finds that dogs carrying a
bully-type breed label are adopted more slowly, and it does, that is a finding
about *the label and how the public reacts to it*, not about the animals'
genetics. Stating it any other way would be a category error with real
consequences, because it would launder a staff perception into an apparently
objective statistical fact about a group of dogs.

The same paper is the reason my model card carries this finding explicitly, and
the reason my subgroup analysis reports performance separately for animals
carrying that label.

### 3.1 Testing folk beliefs rather than encoding them

**Sinski, Carini and Weber (2016)** tested "big black dog syndrome", the
widespread belief in shelter work that black dogs are adopted more slowly, against
data from a large metropolitan shelter, and did not find support for it [9].

I replicate this test on the Austin data because a predictive model is an unusual
kind of object: if it encodes a folk belief, it can make the belief true. A queue
that systematically ranks black animals as higher risk sends more photography and
more foster outreach to them, which changes their outcomes, which changes next
year's training data. My measured result is that animals with black in their coat
had a 34.1 percent cumulative incidence of adoption by day 30 against 32.3 percent
for animals without, so if anything very slightly faster, and that the model's
discrimination is essentially the same for both groups. Reporting a null result
here is not padding. It is the responsible handling of a variable the field has
strong priors about.

---

## 4. Building the thing so it survives contact with reality

### 4.1 The model is the small part

**Sculley et al. (2015)** is the paper that reframes what this project is [10].
Their argument is that in a real machine learning system the model code is a tiny
fraction of the total, and the surrounding infrastructure, configuration, data
collection, feature extraction, serving, monitoring and analysis tools, is where
the maintenance burden lives. They catalogue the specific failure modes:
entanglement, where changing anything changes everything; hidden feedback loops;
undeclared consumers; data dependencies that are unstable or underutilised; and
configuration debt.

Two of their categories apply to SecondChance directly enough that I designed
against them. **Unstable data dependencies:** my breed structuring step depends on
a language model's output, and if the prompt changes, every historical feature
changes silently. The reference table is therefore versioned by prompt hash and
committed to the repository, so the paper's numbers are reproducible without
re-calling the API. **Hidden feedback loops:** the queue changes which animals get
photographed, which changes their outcomes, which becomes next year's training
data. I cannot eliminate that loop, but the model card names it and the monitoring
design watches for the distributional signature of it.

### 4.2 Explaining a prediction to a person who will act on it

**Lundberg and Lee (2017)** unify a family of additive feature attribution methods
under Shapley values, giving per-prediction contributions with a sign and a
consistency guarantee [11]. For SecondChance the per-prediction property is what
matters: a shelter volunteer looking at one dog needs to know why *this* dog
scored low, not which features matter on average across 128,000 animals.

I pair SHAP with permutation importance, which answers a different question, and
the disagreement between them turns out to be informative. In my results the rank
correlation between the two is 0.50 on the 30-day target. Reporting only one would
have made the model look more coherent than it is.

### 4.3 Documenting what a model is for, and what it is not

**Mitchell et al. (2019)** propose model cards: short structured documents
reporting intended use, out-of-scope use, training data, evaluation data, and
performance disaggregated across the groups the model will encounter [12]. The
disaggregation requirement is the substantive one. An aggregate metric can conceal
exactly the failure that matters.

SecondChance ships a model card in this format. The out-of-scope section is not
boilerplate for this project; it is the constraint that shapes the API surface and
the interface, and it is enforced in code rather than only asserted in prose.

### 4.4 The cautionary case

**Obermeyer, Powers, Vogeli and Mullainathan (2019)** analysed a commercial
algorithm used to identify patients for high-risk care management programmes and
found large racial bias [13]. The mechanism is the part worth internalising: the
algorithm was accurate at predicting what it was built to predict, healthcare
costs. Costs were a proxy for need, and because less money is spent on Black
patients at the same level of illness, the proxy encoded the disparity. The model
was working correctly and causing harm.

The structural parallel to a shelter model is close enough to be uncomfortable.
SecondChance predicts adoption, which is a proxy for adopter demand, which is
shaped by public preference, which includes preferences about breed appearance
that Olson et al. show are not even reliably measured. If the model is used to
allocate resources *away* from animals the public prefers less, it converts a
public preference into a shelter decision and closes the loop. This is the
concrete reason the direction of the intervention is fixed: help flows toward the
low-scoring animals, never away from them.

---

## 5. Synthesis: the argument, and where SecondChance sits

Reading these thirteen papers together produces a picture with a specific hole in
the middle.

**The domain literature knows what predicts length of stay.** Lepper et al.
established the feature set, Protopopova et al. showed that behaviour matters
enormously and morphology matters independently of it, Janke et al. established
that cats behave differently from dogs, and Bradley and Rajendran showed that
gradient boosting on a large multi-shelter sample gets roughly 60 percent across
the usual classification metrics.

**The statistical literature knows how duration data should be handled.** Austin,
Lee and Fine set out the competing risks framework, Graf et al. provide the
evaluation metric that works under censoring, and Mavrovouniotis has now made the
survival argument inside the shelter domain itself, showing that the standard
length of stay statistic is not merely imprecise but directionally misleading.

**These two literatures have not met.** The applied shelter machine learning work
predicts length of stay with methods that assume the duration is fully observed
and that every exit is the same kind of event. Both assumptions are false in every
shelter dataset that exists. The measurement paper that gets it right does not
predict; the prediction papers that could act on it do not measure correctly.

**Nobody in the applied literature reports calibration or subgroup performance.**
Bradley and Rajendran report precision, recall and F1. Lepper et al. report odds
ratios. Neither reports whether a predicted probability corresponds to an observed
frequency, which is the property that determines whether a shelter can act on the
number. Neither disaggregates performance across the breed labels that Olson et
al. showed are 50 percent sensitive, or across the coat colour that Sinski et al.
showed carries a folk belief.

**And nobody reports what happens when the world changes.** Mavrovouniotis
documents a 37.6 percent shift in length of stay across COVID as a measurement
result. No shelter prediction paper I have found evaluates a model across that
boundary, which is the single most informative natural experiment available in
this data.

### What SecondChance does with that

Four things, each aimed at one of the four gaps.

1. **Treats time to adoption as a competing risks survival problem**, reporting
   the cause-specific Kaplan-Meier estimate and the Aalen-Johansen cumulative
   incidence side by side, and measuring the size of the error the field's
   standard approach produces.
2. **Reports calibration alongside discrimination** for every model and every
   horizon, calibrates on a held-out temporal block, and treats a calibration gap
   as a first-class monitoring signal rather than an afterthought.
3. **Reports subgroup performance** by species, life stage, intake condition and
   by the two breed labels that carry consequences, and states the breed findings
   as findings about the label rather than about the animal, following Olson et
   al.
4. **Evaluates across the March 2020 regime change deliberately**, using it as a
   real drift detection case study rather than avoiding it with a convenient
   split, and measures what retraining does and does not recover.

The ethical position running through all four comes from putting Lepper et al.
next to Obermeyer et al. The oldest paper in this review frames the shelter
prediction problem as adoption versus euthanasia. The most cautionary shows what
happens when an accurate model is pointed at a decision that reduces what a
population receives. SecondChance takes the same predictive machinery and fixes
the direction of the intervention: the score exists to increase what an animal
gets, and the system is built so that it cannot easily be used any other way.

---

## References

1. Lepper, M., Kass, P. H. and Hart, L. A. (2002). Prediction of adoption versus
   euthanasia among dogs and cats in a California animal shelter. *Journal of
   Applied Animal Welfare Science*, 5(1), 29-42.
   DOI: 10.1207/S15327604JAWS0501_3. PMID: 12738587.

2. Protopopova, A., Mehrkam, L. R., Boggess, M. M. and Wynne, C. D. L. (2014).
   In-kennel behavior predicts length of stay in shelter dogs. *PLOS ONE*, 9(12),
   e114319. DOI: 10.1371/journal.pone.0114319.

3. Bradley, J. and Rajendran, S. (2021). Increasing adoption rates at animal
   shelters: a two-phase approach to predict length of stay and optimal shelter
   allocation. *BMC Veterinary Research*, 17, article 70.
   DOI: 10.1186/s12917-020-02728-2.

4. Janke, N., Berke, O., Flockhart, T., Bateman, S. and Coe, J. B. (2017). Risk
   factors affecting length of stay of cats in an animal shelter: a case study at
   the Guelph Humane Society, 2011-2016. *Preventive Veterinary Medicine*, 148,
   44-48.

5. Mavrovouniotis, M. L. (2026). Use of Kaplan-Meier and Cox regressions in the
   distribution of length of stay in animal shelters for pre-specified calendar
   periods: definition, computation, and examples of dog length of stay in Orange
   County, California. *PLOS ONE*, 21(1), e0342102.
   DOI: 10.1371/journal.pone.0342102.

6. Austin, P. C., Lee, D. S. and Fine, J. P. (2016). Introduction to the analysis
   of survival data in the presence of competing risks. *Circulation*.
   DOI: 10.1161/CIRCULATIONAHA.115.017719. PMID: 26858290.

7. Graf, E., Schmoor, C., Sauerbrei, W. and Schumacher, M. (1999). Assessment and
   comparison of prognostic classification schemes for survival data. *Statistics
   in Medicine*, 18(17-18), 2529-2545.

8. Olson, K. R., Levy, J. K., Norby, B., Crandall, M. M., Broadhurst, J. E.,
   Jacks, S., Barton, R. C. and Zimmerman, M. S. (2015). Inconsistent
   identification of pit bull-type dogs by shelter staff. *The Veterinary
   Journal*, 206, 197-202.

9. Sinski, J., Carini, R. M. and Weber, J. D. (2016). Putting (big) black dog
   syndrome to the test: evidence from a large metropolitan shelter.
   *Anthrozoös*, 29(4). DOI: 10.1080/08927936.2016.1228769.

10. Sculley, D., Holt, G., Golovin, D., Davydov, E., Phillips, T., Ebner, D.,
    Chaudhary, V., Young, M., Crespo, J.-F. and Dennison, D. (2015). Hidden
    technical debt in machine learning systems. *Advances in Neural Information
    Processing Systems 28*, 2503-2511.

11. Lundberg, S. M. and Lee, S.-I. (2017). A unified approach to interpreting
    model predictions. *Advances in Neural Information Processing Systems 30*.

12. Mitchell, M., Wu, S., Zaldivar, A., Barnes, P., Vasserman, L., Hutchinson, B.,
    Spitzer, E., Raji, I. D. and Gebru, T. (2019). Model cards for model
    reporting. *Proceedings of the Conference on Fairness, Accountability, and
    Transparency (FAT\* '19)*. DOI: 10.1145/3287560.3287596.

13. Obermeyer, Z., Powers, B., Vogeli, C. and Mullainathan, S. (2019). Dissecting
    racial bias in an algorithm used to manage the health of populations.
    *Science*, 366(6464), 447-453. DOI: 10.1126/science.aax2342.

### Additional technical references used in the implementation

14. Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q. and Liu,
    T.-Y. (2017). LightGBM: a highly efficient gradient boosting decision tree.
    *Advances in Neural Information Processing Systems 30*.

15. Chen, T. and Guestrin, C. (2016). XGBoost: a scalable tree boosting system.
    *Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge
    Discovery and Data Mining*, 785-794. DOI: 10.1145/2939672.2939785.

16. Davidson-Pilon, C. (2019). lifelines: survival analysis in Python. *Journal of
    Open Source Software*, 4(40), 1317. DOI: 10.21105/joss.01317.

### Data sources

17. City of Austin. Austin Animal Center Intakes. City of Austin Open Data Portal,
    dataset `wter-evkm`. `https://data.austintexas.gov/resource/wter-evkm.json`

18. City of Austin. Austin Animal Center Outcomes. City of Austin Open Data
    Portal, dataset `9t4d-g238`.
    `https://data.austintexas.gov/resource/9t4d-g238.json`

19. National Weather Service. Web service API.
    `https://www.weather.gov/documentation/services-web-api`

20. RescueGroups.org. Adoptable Pet Data API.
    `https://rescuegroups.org/services/adoptable-pet-data-api/`
