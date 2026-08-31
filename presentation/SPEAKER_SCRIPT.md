# Speaker script, five minutes

Timings are cumulative and assume roughly 150 words a minute, which is a
comfortable presenting pace. The script is written to be spoken, not read, so it
is deliberately looser than the paper. Practise once against a timer; if you are
past 3:25 when you reach slide 7, cut the second half of slide 8 and go straight
to slide 9.

The speaker notes embedded in the `.pptx` are the same text, so you can present
from Presenter View instead of this file.

---

## Slide 1. Title (0:00 to 0:25)

> SecondChance predicts how long a shelter animal will wait for adoption, so that
> scarce staff attention goes to the animals who need it most.
>
> Nine years of Austin Animal Center records. 136,898 shelter episodes. Everything
> I am going to show you was evaluated on 20,165 animals the model never saw.
>
> I want to show you four things in five minutes, and the second one is the one I
> would defend hardest.

*Do not read the subtitle aloud. It is on the slide.*

---

## Slide 2. The problem (0:25 to 0:55)

> The binding constraint at a shelter is not kennel space. It is attention.
>
> Someone has to photograph an animal well enough that a stranger stops scrolling.
> Someone has to recruit a foster. Someone has to notice that a dog has been in
> the same run since February. That work is finite, and right now it is allocated
> by whoever happens to notice.
>
> So the question is: on the day an animal arrives, how long will it wait? Three
> predictions. Will it go home this week. Will it still be here in two months. And
> the whole curve in between.
>
> All of it from what is knowable at the intake desk. Nothing that requires
> someone to stand and watch the animal, because that data does not exist.

---

## Slide 3. The data (0:55 to 1:25)

> Austin publishes intakes and outcomes as two separate event logs, with no
> episode key between them, and nine percent of animals come through more than
> once.
>
> So the first real job was sequence alignment inside each animal, and every join
> decision is counted. 99.1 percent close cleanly. Zero negative durations. Zero
> species mismatches.
>
> And this is the check I would keep if I could only keep one. Train the entire
> model on randomly shuffled labels. It comes back at 0.5023. Nothing in those 56
> features encodes the outcome.

*If asked about the 622 "suspected lost paperwork": an intake in 2015 with no
outcome by 2022 is a missing form, not a seven-year resident. The threshold is
the 99.5th percentile of observed stays, 289 days, derived from the data.*

---

## Slide 4. The headline finding (1:25 to 2:05)

**Slow down here. This is the slide.**

> This is the finding I would defend hardest.
>
> Fifty-one percent of exits from this shelter are not adoptions. Transfers to
> rescue partners, returns to owner. And an animal transferred on day three cannot
> be adopted from Austin on day thirty. It has left the risk set entirely.
>
> Treat that as ordinary censoring, which is what the shelter analytics field
> does, and you overstate 30-day adoption by 23.7 percentage points. That is a 72
> percent relative error.
>
> By one year, the standard estimator says 98.8 percent of animals arriving at
> this shelter are adopted. The correct figure is 48.3.
>
> That is not a rounding error. Those two numbers describe different shelters.

*Pause after "different shelters."*

---

## Slide 5. The models (2:05 to 2:45)

> Four targets, four models, strictly temporal split. Train through 2018,
> calibrate on 2019, test on 2020 to 2022.
>
> 0.803 AUC on 30-day adoption, 0.765 on long-stay risk. And an expected
> calibration error of 0.023, which matters more than the AUC does, because the
> number on the screen gets read as a percentage by a person who is about to act
> on it.
>
> But the metric I actually care about is the last one. The top 50 of the
> long-stay queue contains 4.2 times as many true long-stay animals as a random
> 50. Forty-eight percent of that top 50 really did stay past sixty days, against
> a base rate of eleven point six.
>
> That is the number a shelter director would ask for.

---

## Slide 6. The language model (2:45 to 3:25)

> Austin records breed as free text. 2,736 distinct strings, and you need 1,651 of
> them to cover 99 percent of dogs.
>
> But they are compositional, so splitting on Austin's own convention collapses
> that to 254 atomic tokens, which a language model labels once, at temperature
> zero, for size, weight, coat, energy, and the two breed labels that carry real
> housing consequences. It resolves 100 percent of dog and cat strings.
>
> And here the result splits, which is the interesting part. On long-stay risk it
> beats a hand-written keyword baseline by 0.012 AUC, decisively, p below 0.001.
> On 30-day adoption it beats it by 0.0003, which is nothing.
>
> Reporting only the flattering half would have been easy. This version tells you
> which question the extra machinery is actually worth deploying for.
>
> Weather, our fourth data source, did not help either target, and we say that
> too.

---

## Slide 7. Monitoring (3:25 to 4:05)

> Here is the thing I did not expect.
>
> The model was frozen on 2018 data and then met March 2020, when Austin's shelter
> changed how it operated. Intake volume fell 37 percent.
>
> Its ability to rank animals barely moved. Mean monthly AUC was 0.778 before and
> 0.789 after.
>
> What broke was calibration. In July 2020 it was predicting a 30-day adoption
> rate 7.6 percentage points above what actually happened.
>
> Discrimination and calibration fail separately, and here calibration failed
> first and harder. If you monitor AUC alone, you see a perfectly healthy model
> for months while the numbers on the shelter's screen quietly stop meaning
> anything.
>
> Input drift caught it a full quarter earlier, and it had to, because the 30-day
> label does not exist for 30 days. Outcome monitoring is structurally six weeks
> behind its own cause.

---

## Slide 8. The pipeline (4:05 to 4:35)

*Move quickly here. This slide is comprehensiveness, not argument.*

> Quickly, the system, because the brief asks for a lifecycle rather than a
> notebook.
>
> Four public APIs ingested on a schedule into an append-only S3 landing zone that
> keeps every raw response forever. Redshift Serverless for the joins. Bedrock for
> any breed token the reference has not seen. SageMaker for training, with every
> model registered against its data cutoff and its feature hash.
>
> An API where every single response carries the model version, the data freshness
> and the use policy. And a weekly monitoring job behind six CloudWatch alarms.
>
> Thirty-four dollars a month, because the endpoint is transient rather than
> persistent.

---

## Slide 9. The constraint (4:35 to 5:00)

**Slow down again.**

> One thing I want to be explicit about.
>
> Dogs carrying a bully-type breed label wait significantly longer here, and the
> model is both worse for them and under-confident about them. Because the queue
> routes help toward low scores, that error puts them higher in the queue, which
> is the safer direction, but it is still an error and it is in the model card.
>
> And the label itself is a staff guess. Olson and colleagues measured 50 percent
> sensitivity against DNA. So this is a finding about a label, not about animals.
>
> The same machinery could be pointed the other way. The 2002 paper that founded
> this literature framed exactly this prediction problem as adoption versus
> euthanasia.
>
> So the use policy ships in every API response, there is no screen anywhere in
> the product that surfaces an animal for removal, and the public page shows no
> probability at all.
>
> A low predicted adoption probability is a request for more help, not less.

---

## Slide 10. Close (5:00)

> Four things I would defend. The estimator error. Calibration failing before
> discrimination. The language model earning its place on one target and not the
> other. And three whole classes of feature that will silently break a drift
> detector.
>
> Three things I would not claim. I have no behavioural data, which is where the
> remaining signal is. Breed is a staff guess. And I can show that the queue finds
> the right animals, but not that acting on it changes what happens to them.
>
> That last one needs a prospective study, and it is what I would do next.
>
> Thank you.

---

## If you run over

Cut in this order:

1. Slide 8, second half. Say "four APIs in, monitored weekly, thirty-four dollars
   a month" and move on. Saves 20 seconds.
2. Slide 6, the weather sentence. Saves 8 seconds.
3. Slide 2, the "three predictions" list. The slide shows it. Saves 15 seconds.

Never cut slide 4 or slide 9. Those are the two that make the project what it is.

## If you run under

Add, in this order:

1. On slide 3, the 622 lost-paperwork episodes and how the threshold was derived.
2. On slide 5, that LightGBM does not beat logistic regression on the long-stay
   target, p equals 0.82, and that you report it because that kind of result
   usually disappears.
3. On slide 7, the year-over-year reference and why quarter-over-quarter failed.

## Likely questions, and short answers

**"Why not just use length of stay as a regression target?"**
Because a third of the animals in any snapshot have not left yet, so their
duration is not observed. Regression forces you either to drop them, which biases
you toward fast outcomes, or to treat their current elapsed time as final, which
is simply wrong.

**"Isn't 0.80 AUC quite modest?"**
Yes, and I would be suspicious of much more from administrative records alone.
Protopopova and colleagues showed the remaining signal is behavioural, and none
of it exists in any public export. The relevant question is whether the top of
the queue is useful, and 4.2 times better than chance at depth 50 is useful.

**"What happens when the shelter acts on the queue?"**
I do not know, and neither does anyone else from this kind of data. The queue
changes which animals get help, which changes their outcomes, which changes next
year's training data. That is a real feedback loop, it is in the model card, and
answering it properly needs a prospective study.

**"Why LightGBM over XGBoost?"**
Marginally better on the 30-day target, +0.0028 with p below 0.001, and more
consistent calibration. The margin is small enough that the choice is not load
bearing, and I say so in the paper.

**"How do you know the breed labels from the language model are right?"**
I do not, entirely, and that is why the paper reports the comparison against a
keyword baseline rather than asserting quality. What I can say is that the
reference resolves 100 percent of the strings, that the labels were produced at
temperature zero from a versioned prompt, and that any refresh requires a human
audit before it reaches production.
