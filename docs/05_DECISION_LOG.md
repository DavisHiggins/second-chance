# Decision log

Every choice in this project that could reasonably have gone the other way, what
it cost, and what happened when it was wrong.

The entries below are in the order the decisions were made rather than in order of
importance, because that is the order in which the reasons make sense. Several of
them were wrong the first time, and those are the useful ones: a log that only
records the decisions that worked is a log that has been tidied.

---

## 1. Reconstruct episodes rather than join on animal ID

**The choice.** Austin publishes intakes and outcomes as two separate event logs
with no episode key between them. The obvious move is a join on `animal_id`.

**Why not.** Roughly one animal in eleven comes through the door more than once.
A plain join gives every intake crossed with every outcome: four rows for an
animal with two visits, each with a duration that looks entirely plausible. There
is no error, no warning, and every downstream number is wrong.

So each intake is paired with the earliest outcome at or after it and strictly
before that animal's next arrival. **42 candidate matches were rejected** by that
second condition, which is 42 episodes a naive join would have closed with the
wrong outcome.

**Cost.** A module rather than a line of SQL, plus the audit that defends it.

**What it bought.** 99.10 percent of episodes close cleanly, zero negative
durations, zero species mismatches, and a count for every decision the join made.
`tests/test_episodes.py` is the largest test file in the project for this reason.

---

## 2. Flag suspiciously old open episodes rather than treat them all as censored

**The choice.** 1,229 episodes have no outcome row. The textbook answer is that
they are all right-censored observations.

**Why not.** Most of them are, and those are honest. But an intake in 2015 with no
outcome by 2022 does not describe an animal that lived at the shelter for seven
years. It describes an outcome form that was never filed.

**What went wrong before this was noticed.** The shelter census feature was
computed by sweeping arrivals and departures. Never-closed episodes never
departed, so they accumulated: by 2021 the sweep reported a phantom occupancy of
several hundred animals that were not in the building. The model was learning a
trend that was a fact about Austin's paperwork.

**The rule.** Open episodes longer than the 99.5th percentile of *observed* stays
are flagged. That threshold is **289.08 days**, derived from the data rather than
chosen, and it flags **622 episodes**. Flagged episodes are excluded from the
modelling cohort and are given an assumed exit at the threshold for the occupancy
sweep only.

**What it bought.** A census feature that describes the building.

---

## 3. Treat competing exits as competing risks, not as censoring

**The choice.** The shelter analytics literature almost universally reports a
cause-specific Kaplan-Meier curve for time to adoption, treating a transfer or a
return to owner as censoring.

**Why not.** Censoring means "we stopped observing this animal, but it was still
at risk." An animal transferred to a rescue partner on day three is not still at
risk of being adopted from Austin on day thirty. It has left.

**What that costs, measured.**

| Day | Cause-specific KM | Aalen-Johansen CIF | Overstatement |
|---|---|---|---|
| 7 | 0.258 | 0.176 | +47% |
| 30 | 0.566 | 0.329 | **+72%** |
| 90 | 0.875 | 0.448 | +95% |
| 365 | 0.988 | 0.483 | **+104%** |

At one year the standard estimator says 98.8 percent of animals arriving at this
shelter are adopted. The correct figure is 48.3. Those two numbers describe
different shelters.

**Cost.** A second estimator, and per-prediction competing hazards in the
discrete-time model rather than one. Getting that second hazard wrong is what
produced the calibration failure in entry 7.

**What it bought.** The finding this project is built on.

---

## 4. Split by time, never at random

**The choice.** Train through 2018, calibrate on 2019, test on 2020 to January
2022.

**Why.** A random split is worth roughly a free 0.02 AUC here, because the
shelter's population is autocorrelated in time and neighbouring weeks look alike.
More importantly it answers the wrong question: nobody deploys a model to predict
last March.

**The deliberately uncomfortable part.** The test block spans March 2020, when
Austin's shelter changed how it operated and intake volume fell 37 percent. That
is the point. A model evaluated only on data from its own era tells you nothing
about what happens when the world moves.

**What it cost.** The reported numbers are lower than a random split would have
produced, and lower than most of the published comparisons.

---

## 5. Calibrate, and report calibration as a headline metric

**The choice.** An isotonic calibrator fitted on the validation block, and
expected calibration error reported next to AUC everywhere.

**Why.** The number that reaches a person is a probability, not a ranking. "This
animal has a 34 percent chance of being adopted within thirty days" gets read as
34 percent by someone who is about to act on it. An uncalibrated boosted tree
gives a good ranking and a badly wrong number.

**Measured.** Raw LightGBM on the 30 day target: ECE 0.0323, calibration slope
0.894. After isotonic: **ECE 0.0230, slope 0.969.** The AUC moves by 0.0003.

**What it bought.** Entry 8 below, which is only visible because calibration is
measured separately from discrimination.

---

## 6. Label breed tokens with an LLM, offline, into a versioned file

**The choice.** Austin records breed as free text: 2,736 distinct strings, and you
need 1,651 of them to cover 99 percent of dogs. Rather than one-hot encoding them
or hand-writing keyword rules, a language model describes them.

**The move that makes it cheap.** The strings are compositional.
"Labrador Retriever/Pit Bull Mix" is two atomic breeds plus a mix marker.
Splitting on Austin's own convention collapses 2,736 strings to **254 atomic
tokens**, labelled once, at temperature zero, into a file. It resolves 100 percent
of dog and cat strings, and the marginal cost afterwards is the dozen genuinely
new breed strings Austin records in a month. **One cent a month.**

**What the result actually was, both halves.** Against a hand-written keyword
baseline: **long stay +0.0122 AUC, p < 0.001**, which is decisive. **30 day
adoption +0.0003, p = 0.732**, which is nothing.

Reporting only the first would have been easy and is why the second is in the
paper. The honest summary is that the extra machinery is worth deploying for one
question and not the other.

**Cost.** A reference file that has to be versioned, reviewed and audited, plus
`docs/06_LLM_EVALUATION.md` to defend it.

---

## 7. Model both cause-specific hazards, not just adoption

**What went wrong.** The first discrete-time survival model estimated only the
adoption hazard and reported `1 - prod(1 - h_adopt)`. Its calibration was wildly
off: in the top decile it predicted 0.9859 against an observed 0.6513.

**Why.** That formula answers "how fast would adoption happen in a world where
transfers and returns to owner did not exist." In this data, 51 percent of exits
are exactly those things.

**The fix.** Two joint cause-specific hazards, with the correct discrete-time
construction:

```
S(j)   = prod over k <= j of (1 - h_adopt(k) - h_other(k))
CIF(j) = sum  over k <= j of S(k-1) * h_adopt(k)
```

**Measured after the fix.** Mean predicted 30 day incidence: naive 0.6381,
corrected 0.4032, observed **0.3724**. The correction moves the prediction from
71 percent above the truth to 8 percent above it.

**The lesson worth keeping.** This bug produced numbers in an entirely plausible
range. Only comparing the prediction against the observed rate, decile by decile,
made it visible.

---

## 8. Monitor calibration and discrimination separately

**What was expected.** That the 2020 shift would show up as an AUC collapse.

**What happened.** Mean monthly AUC before March 2020: **0.7775**. After:
**0.7894**. Discrimination did not degrade at all; it marginally improved.

What broke was calibration. In July 2020 the model predicted a 30 day adoption
rate **7.6 percentage points** above what actually happened.

**The consequence for the design.** Both are alarmed, and the calibration alarm is
not the secondary one. A dashboard watching AUC alone would have shown a healthy
model for months while the numbers on the shelter's screen quietly stopped meaning
anything.

---

## 9. Monitor input drift as the leading indicator

**Why it is not optional.** The 30 day label does not exist for 30 days and the
60 day label does not exist for 60. Outcome monitoring is structurally six weeks
behind its own cause.

**Measured lead time.** Input drift flagged the shift a full quarter before
performance monitoring could have. The first performance WARNING was 2020-01 and
the first CRITICAL was 2020-07; the input-drift detector fired in 2020 Q2 on
`intake_type`, PSI 0.317.

---

## 10. Three drift features excluded, three different ways

The first version of the drift detector reported CRITICAL in **every quarter**,
which is the same as reporting nothing. Three separate causes, each with its own
fix.

**Monotone time features.** `intake_year` and `days_since_series_start` rise
forever, so a later window has no overlap at all with an earlier reference and PSI
saturates whether or not anything changed. **Fix:** excluded from the deployed
model entirely, which also cost nothing: including them was worth **-0.0055 AUC**
on the 30 day target (p < 0.001), because a tree cannot split a feature outside
the range it was trained on.

**Shelter-level covariates.** Every animal arriving in one week shares almost the
same `shelter_census_at_intake`, so the quantile bins are razor thin. A 10 percent
move reads as the same saturated CRITICAL as a 40 percent one. **Fix:** measured
as a relative change in level, warning at 15 percent and critical at 30. On the
2020 block that reports `intakes_prior_7d` **-36.8 percent CRITICAL** and
`species_census` **-13.2 percent OK**, which is a distinction a shelter director
can act on.

**Calendar-cycle features.** `intake_doy_sin` in Q3 cannot resemble Q2 no matter
how stable the shelter is. **Fix:** the reference window is the same quarter a
year earlier, not the quarter just gone.

**What it bought.** A detector that is quiet when nothing has happened. The
measured false alarm rate across the stable year 2019 is **3 of 12 months**, which
is still higher than ideal and is reported rather than tuned away.

---

## 11. Do not promote models automatically

**The choice.** `MODEL_APPROVAL_MODE` defaults to manual. The gate computes the
comparison, writes down what it would do, and stops.

**The worked example that decided it.** In the retraining experiment the automatic
rule compared a champion at AUC 0.7702 / ECE 0.0394 against a challenger at 0.7933
/ 0.0318 and returned **PROMOTE**. The challenger looked better because it had
been calibrated on the post-shift distribution the evaluation window was drawn
from. That is a property of the evaluation window, not of the model, and promoting
on it would have been wrong.

**Cost.** Someone has to look at an email.

---

## 12. Retrain nothing on the drift alarm alone

**Measured.** Retraining on the post-shift data moved validation AUC from 0.8134
to **0.8145** and moved ECE from 0.0448 to **0.0499**. Better ranking, worse
calibration, and per entry 5 the calibration is the part that reaches a person.

**What it bought.** A concrete answer to "the drift detector fired, should we
retrain?" that is not automatically yes.

---

## 13. Give the language model a second-opinion role, not a decision

**The choice.** When the monitoring job raises an alert, a model reads the numbers
and answers three questions: is this a model problem or a world problem, what
drove that answer, and what should a human check first. It cannot change the
status and it is explicitly told not to recommend retraining.

**Why the role and not more.** A monitoring alert saying "PSI 0.317 on
intake_type" is correct and useless at 7am. One that adds "the intake mix shifted,
which is consistent with an operational change rather than a broken feed" is a
starting point. Neither is a decision.

**The failure mode it is designed around.** A model that can silence its own alarm
is worse than no second opinion at all, so the review is stored beside the numbers
rather than in place of them, and a failed review never fails the monitoring run.

---

## 14. Ship the use policy in every API response

**The choice.** Every scoring response carries a `use_policy` object naming the
intended use and the prohibited one, in words, in the payload.

**Why in the payload.** A banner in a front-end can be deleted in a commit nobody
reviews. A field the API always returns cannot be removed without changing
`serve/handler.py`, which shows up in a diff, and `tests/test_serve.py` fails the
build if it goes missing.

**The related refusals.** No field in the prediction payload is named anything a
person could read as a removal recommendation, and there is a test asserting that
by substring. The public discovery page shows no probability at all.

**Why this much.** Lepper, Kass and Hart in 2002 framed exactly this prediction
problem as adoption versus euthanasia. The machinery is the same. The difference
is entirely in what the output is allowed to be used for, so that has to be
enforced rather than intended.

---

## 15. Report the fairness gap rather than closing it

**Measured.** On the 30 day target, dogs carrying a bully-type breed label:
**AUC 0.754** against 0.807 for other dogs, with a calibration gap of **-0.048**,
meaning the model is under-confident about them.

**Why it is not "fixed".** Two reasons, and both are honest rather than
convenient.

The direction of the error is the safer one. The queue routes help toward low
adoption scores, so under-confidence pushes these dogs higher in the queue.
Correcting the calibration would move them down.

And the label itself is a staff guess. Olson and colleagues measured **50 percent
sensitivity** for staff identification of pit bull type dogs against DNA. A
correction applied to a label that is wrong half the time is not a correction.

**What was done instead.** It is in the model card, it is in the paper, it is in
the subgroup table that the monitoring job recomputes from live predictions, and
it is stated out loud in the presentation.

---

## 16. Report the null results

Three things were measured and did not work, and all three are in the paper.

**Weather.** Four data sources were required by the brief and weather was the
fourth. On the covered window: 30 day **+0.0005, p = 0.710**; long stay
**+0.0017, p = 0.514**.

**Shelter load as a feature block.** Adding it to animal and intake features was
worth **+0.0006 AUC, p = 0.628** on the 30 day target.

**LightGBM over logistic regression on long-stay risk.** **-0.0007, p = 0.822.**
The boosted model does not beat a linear one on that target, and the paper says
so, because a result like that usually disappears between the analysis and the
write-up.

**The near-miss worth recording.** Weather initially appeared to gain **+0.0133
AUC** on long stay. It was the missingness indicator: the station record stops
before the shelter record does, so "weather is missing" was acting as a post-2020
era flag. Restricting the comparison to the covered window removed it.

---

## 17. Keep the raw layer append-only and never edit it

**The choice.** Every API response is stored as it arrived, forever, with the
object key and the fetch timestamp beside it. Nothing is deduplicated or corrected
in place.

**Why.** Reprocessing a year of history against a fixed parser is only possible if
the original bytes are still there. The cost is 18 GB and $0.42 a month.

---

## 18. Two implementations of the episode logic, checked against each other

**The choice.** `src/secondchance/episodes.py` in Python and
`sql/03_episodes.sql` in Redshift do the same thing.

**Why this is not just duplicated work.** They exist for different reasons: Python
builds the research dataset from a downloaded export, SQL builds the production
table the scoring and monitoring jobs read. Having both means the pairing rule can
be checked rather than trusted, which is what
`analytics.v_pipeline_reconciliation` does. A non-empty result there means one of
the two is wrong and neither should be believed until it is known which.

**Cost.** The rule has to be maintained in two languages.

---

## Things that would change with more time

- **A prospective study.** The queue finds the right animals. Whether acting on it
  changes what happens to them is unanswerable from this data, and it is the
  question a shelter would actually ask.
- **Multi-shelter validation.** Everything here is Austin. The episode logic is
  generic and Socrata hosts dozens of municipal shelters, so this is a matter of
  time rather than of method.
- **Reconsider Kinesis.** At $12.40 it is the second largest line in the cost
  model and buys delivery guarantees this volume does not need. A plain S3 write
  would be $0.40.
- **A calibration-aware retraining trigger.** The current gate compares two static
  snapshots. Entry 12 suggests the interesting signal is the trajectory of the
  calibration gap rather than its level at any one moment.
