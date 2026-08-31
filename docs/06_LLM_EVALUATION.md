# Language model evaluation

Where a language model is used in this project, what it produced, what that was
checked against, and what it was worth.

The short version: a model was used **once, offline, over 254 breed tokens**, to
produce a versioned file that a human can read and a reviewer can diff. Nothing at
serving time calls a language model to score an animal. The labels it produced
were measured against a hand-written keyword baseline on the actual prediction
task, and the result splits: **decisive on one target, nothing on the other**, and
both halves are reported.

---

## 1. What the model is asked to do

Austin records breed as free text. In nine years there are **2,736 distinct breed
strings**, and you need **1,651 of them** to cover 99 percent of dogs. One-hot
encoding that is hopeless, and it throws away everything a breed actually tells
you: a Great Pyrenees and a Chihuahua are two unrelated columns rather than
"very large, thick coated, guardian" and "toy, short coated, companion".

The move that makes this tractable is that Austin's strings are **compositional**.
`Labrador Retriever/Pit Bull Mix` is two atomic breeds plus a mix marker. Splitting
on slashes and stripping the `Mix` suffix collapses the whole corpus:

| | Count |
|---|---|
| Distinct breed strings, all species | 2,736 |
| Distinct breed strings, dogs and cats | 2,525 |
| **Distinct atomic tokens after splitting** | **254** |

So the model labels 254 tokens, once, and the composition rules that turn tokens
back into a row are ordinary code with no model in them at all.

Eleven attributes per token: kennel club group, size class, typical adult weight,
coat length, grooming burden, energy level, and five binary flags (bully type,
brachycephalic, guardian or working, breed-specific-legislation risk, recognised
purebred).

---

## 2. How it was run

| | |
|---|---|
| Model | `anthropic.claude-3-5-sonnet-20241022-v2:0` via Amazon Bedrock |
| Temperature | 0 |
| Batch size | 25 tokens per request |
| Prompt | `LABELING_PROMPT` in `src/secondchance/labeling/breed_llm.py`, hashed into the output |
| Output | `data/reference/breed_attributes_llm.psv`, pipe separated, one row per token |
| Retries | Two attempts per batch; the only observed failure mode is a reply wrapped in a code fence |
| Cost | $0.42 for the whole reference; about one cent a month afterwards |

Temperature zero because this is a lookup table, not a piece of writing. The same
token asked twice should produce the same row, and if it does not, that is the
finding.

The prompt is hashed and the hash is written into the file's header alongside the
model id and the timestamp. A label can therefore be traced to the exact text that
produced it, which matters because a prompt edit silently invalidates every label
made under the old one.

---

## 3. Coverage, measured

| Measure | Result |
|---|---|
| Atomic tokens in the dog and cat corpus | 254 |
| Tokens present in the reference | **254 (100%)** |
| Unresolved tokens | **0** |
| Dog and cat rows where every named token resolved | **100.00%** |
| All rows including birds, bats and livestock | 94.23% |

The 5.77 percent that do not resolve are the non-dog, non-cat animals Austin also
takes in, which are excluded from the modelling cohort anyway. Their breed columns
are left missing rather than filled with a default, because an unresolvable string
must not end up looking like a toy, hairless, calm dog.

---

## 4. Accuracy against published standards

Coverage is not correctness. A reference can resolve every string and describe
them all wrongly, so twenty-five tokens were checked by hand against published
kennel club and breed registry standards.

| Attribute | Agreement |
|---|---|
| Typical adult weight inside the published range | **25 / 25 (100%)** |
| Size class exactly right | **22 / 25 (88%)** |

The three size disagreements are worth naming rather than rounding away:

| Token | Reference | Published | Comment |
|---|---|---|---|
| Shih Tzu | small (12 lb) | toy | AKC places it in the Toy group; 12 lb is at the toy/small boundary |
| Pug | small (17 lb) | toy | Same boundary. 17 lb is heavier than most of the Toy group |
| Maine Coon | small (15 lb) | medium | 15 lb is correct for the breed; the size *class* is the disagreement |

All three are boundary calls on an ordinal scale rather than errors of fact, and
in all three the weight, which is the continuous feature the model actually uses,
is right. That is the useful shape of this result: the model is reliable on the
measurable attribute and slightly inconsistent on the categorical one that
requires a convention.

**The audit is reproducible.** The twenty-five tokens, their published ranges and
the comparison are in `tests/test_labeling.py`, which fails the build if an edit to
the reference breaks one of them.

---

## 5. Was it worth it? The comparison that matters

Coverage and hand-audits establish that the labels are reasonable. Neither
establishes that they help. So the reference is compared against a **hand-written
keyword baseline** on the real prediction task, on the held-out test block.

The baseline is a genuine attempt rather than a straw man:
`src/secondchance/labeling/rule_baseline.py` is 21 lines of regular expressions
covering size keywords, coat keywords and the four risk flags. It resolves a size
class for **75.8 percent** of distinct strings against the reference's 100 percent.

Three configurations, otherwise identical models:

### 30 day adoption

| Breed handling | AUC |
|---|---|
| No breed structure | 0.7955 |
| Keyword baseline | 0.7999 |
| **LLM reference** | **0.8002** |

| Comparison | AUC difference | p |
|---|---|---|
| LLM vs keyword baseline | **+0.0003** | **0.732** |
| LLM vs no breed structure | +0.0047 | < 0.001 |
| Keyword vs no breed structure | +0.0043 | 0.002 |

### Long-stay risk past 60 days

| Breed handling | AUC |
|---|---|
| No breed structure | 0.7322 |
| Keyword baseline | 0.7545 |
| **LLM reference** | **0.7667** |

| Comparison | AUC difference | p |
|---|---|---|
| LLM vs keyword baseline | **+0.0122** | **< 0.001** |
| LLM vs no breed structure | +0.0345 | < 0.001 |

**The honest reading.** On long-stay risk the language model beats a competent
keyword baseline decisively. On 30 day adoption it beats it by three ten-thousandths
of an AUC point, which is nothing, and a keyword file would have done the job.

Reporting only the long-stay half would have been easy, and that is exactly why
both are in the paper. What the split says is that the extra machinery earns its
place for one question and not the other, which is a more useful thing to know
than "the LLM helped".

**Why the difference makes sense.** Long-stay risk is where breed does its
heaviest work: the animals that sit in a kennel for months are disproportionately
large, guardian-type or bully-labelled dogs, and those are precisely the
distinctions a keyword file gets crudely and a structured reference gets in
degrees. Thirty day adoption is dominated by age and intake condition, and breed
is a second-order effect there whichever way it is encoded.

---

## 6. Governance

Three rules, in the code rather than in a policy document.

**Nothing at serving time calls a model.** The reference is a file. The API reads
it. A model invoked once, offline, into an artefact a human reviews is a
fundamentally different risk than one invoked inside a request, and the second was
never necessary here.

**A new label is quarantined until a human approves it.**
`src/secondchance/labeling/handlers.py` writes newly labelled tokens to a
**pending** file, not to the live reference, and sends an alert. Promotion happens
only when someone invokes `promote_pending_reference` with the tokens they have
actually checked and their own name, which is recorded. An automated label that
feeds a decision about an animal should not reach production because a cron job
succeeded.

**An implausible volume of new tokens stops the run.** More than 200 unseen breed
tokens in one batch is not a busy month, it is a broken feed, so the function
refuses to label them and alerts instead of spending the budget describing
garbage.

**The audit is written down.** `analytics.labeling_audit` holds one row per
(token, attribute) a human checked, with the reference value, the source, and
whether they agreed. `analytics.v_labeling_audit_summary` reports the agreement
rate per attribute. That table is what makes section 4 above a claim rather than
an anecdote.

---

## 7. The second use: monitoring review

The other place a model appears is in the weekly monitoring job, and its role
there is deliberately narrow.

When the job raises a WARNING or CRITICAL, the numbers are handed to a model which
answers three questions: is this a model problem, a world problem or a pipeline
problem; which specific numbers drove that answer; and what should a human check
first. It is explicitly instructed **not** to recommend retraining.

**Why the role and not more.** An alert saying "PSI 0.317 on `intake_type`" is
correct and useless at 7am. One that adds "the intake mix shifted, which is
consistent with an operational change rather than a broken feed, so check the
shelter's intake policy before retraining" is a starting point. Neither is a
decision, and the design is careful that the second is not mistaken for one.

**What it cannot do.** It cannot change the run's status, it cannot silence an
alarm, and a failed review never fails the monitoring run: the answer is stored
beside the numbers rather than in place of them. A model that can silence its own
alarm is worse than no second opinion at all.

---

## 8. What this does not establish

**The labels are not verified, they are audited.** Twenty-five of 254 tokens were
checked against published standards. The other 229 are plausible and unchecked,
and the paper says so.

**The breed label itself is a staff guess.** This is the deeper limitation and it
has nothing to do with the language model. Olson and colleagues (2015) had 16
shelter staff identify 120 dogs and compared them against DNA: **50 percent
sensitivity** for pit bull type identification, with 67 to 78 percent inter-rater
agreement. Describing the string perfectly does not make the string true. Every
breed finding in this project is a finding about a label, and it is framed that
way throughout.

**Temperature zero is not determinism.** The same prompt at temperature zero is
very likely to return the same answer and is not guaranteed to. The mitigation is
that the output is a checked-in file rather than a live call, so whatever
variation exists was resolved once and is now fixed.

**Nothing was tested against a second model.** Running the same 254 tokens through
a different model and measuring agreement would be the obvious next check, and it
was not done. It is on the list in `docs/05_DECISION_LOG.md`.
