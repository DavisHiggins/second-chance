# SecondChance content

Every string in the product. Copy them; do not write new ones. Where a value is
interpolated it is written `{like_this}` and the source field is named.

House style: plain words, short sentences, no exclamation marks, no "AI" as a
noun, no em dashes. We say "the model", never "the algorithm" or "the AI". We say
"predicted", never "determined". We never say an animal is "unlikely to be
adopted"; we say the model expects them to "wait longer".

---

## The use policy. verbatim, everywhere it appears

**Short form** (banner, one line):

> Scores route help toward animals. They must never be used to justify
> euthanasia, intake refusal, or reduced care.

**Full form** (footer, `/model`, printed exports):

> SecondChance predicts how long an animal is likely to wait for adoption so
> that staff attention, foster recruitment, photography and outreach can go to
> the animals who need them most.
>
> A low predicted adoption probability is a request for more help, not less. This
> score must never be used to justify euthanasia, to refuse an intake, to
> withhold medical or behavioural care, or to deprioritise any animal for any
> resource. Every prediction in this system exists to increase what an animal
> receives.
>
> If you are being asked to use this tool to reduce care for an animal, the tool
> is being misused. Say so.

---

## Navigation and shell

| Element | String |
|---|---|
| Wordmark | SecondChance |
| Nav: dashboard | Dashboard |
| Nav: queue | Queue |
| Nav: discover | Discover |
| Nav: planner | Planner |
| Nav: model | Model |
| Freshness, fresh | Data current as of {data_as_of, "d MMM yyyy, HH:mm"} |
| Freshness, stale | Data is {hours} hours old |
| Freshness, fallback | Showing sample data |
| Model chip | Model {model_version} |
| Density toggle | Comfortable / Compact |
| Theme toggle | Light / Dark |

Footer, column one heading: **About this tool**

> SecondChance forecasts time to adoption for animals at the Austin Animal
> Center. It was built as a semester project for DTSC 3601 at UNC Charlotte, on
> public shelter records covering October 2013 to March 2022. It is a research
> prototype, not a production system.

Footer, column two heading: **Where the data comes from**

- Austin Animal Center Intakes, City of Austin Open Data Portal
- Austin Animal Center Outcomes, City of Austin Open Data Portal
- Daily weather observations, National Weather Service
- Current adoptable listings, RescueGroups.org

Footer, column three heading: **How to use it**, then the full use policy.

---

## Dashboard

| Element | String |
|---|---|
| Page title | Today at the shelter |
| Page subtitle | {census} animals in care. {needs_attention} the model expects to wait longest. |
| Hero label | animals need attention this week |
| Hero support | out of {census} currently in care, ranked by predicted 60-day stay risk |
| Hero button | Open the queue |
| Donut title | Expected wait, whole population |
| Donut bands | Under 7 days / 7 to 30 days / 30 to 60 days / Over 60 days |
| Tile 1 | Animals in care |
| Tile 2 | Median days to adoption |
| Tile 3 | Adopted within 30 days |
| Tile 4 | Predicted long stay |
| Forecast title | Population over the next 30 days |
| Forecast subtitle, model | Central estimate with an 80 percent interval |
| Forecast subtitle, naive | Seasonal baseline projection with an 80 percent interval. This is a seasonal average, not a trained forecasting model. |
| Forecast capacity line | Typical operating capacity |
| Segments title | Where the wait is longest |
| Segments subtitle | Median predicted days to adoption by life stage |
| Health title | Model health |
| Health row 1 | Discrimination |
| Health row 2 | Calibration error |
| Health row 3 | Input drift |
| Health row 4 | Last retrained |

Delta chip suffixes: `vs 30 days ago`, `vs this month last year`.

---

## Queue

| Element | String |
|---|---|
| Page title | Needs attention |
| Page subtitle | {count} animals ranked by how likely the model thinks they are to still be here in 60 days. Work from the top. |
| Filter: species | All animals / Dogs / Cats |
| Filter: threshold | Show animals above {value} risk |
| Filter: sort | Sort by risk / Sort by days waiting / Sort by arrival date |
| Search placeholder | Search by name or ID |
| Unnamed animal | Unnamed |
| Days label | days |
| Probability label | chance of adoption in 30 days |
| Expand | Why this animal |
| Collapse | Hide |
| Mark actioned | Mark as handled |
| Undo toast | {name} marked as handled. |
| Undo button | Undo |
| Detail link | Full profile |
| Empty, no filter | No animals are currently above the risk threshold. That is good news. |
| Empty, filtered | No animals match these filters. |
| Clear filters | Clear filters |

Expanded card headings: **What is driving this**, **What would help**,
**Predicted wait**.

---

## Driver labels

The API sends a `label`. This table is the fallback and the source of the
phrasing, so the tone stays consistent if a new feature appears.

| Feature | Raises the chance | Lowers the chance |
|---|---|---|
| `age_at_intake_days` | young for its species | {age} old |
| `age_band` | in the age range adopters ask for | outside the age range adopters ask for |
| `animal_type` | species adopters ask for more often | species adopters ask for less often |
| `intake_type` | surrendered by an owner, so history is known | arrived as a stray with no history |
| `intake_condition` | arrived in normal condition | arrived {condition} |
| `sex_upon_intake` | already sterilised on arrival | sex not recorded on arrival |
| `has_name` | arrived with a name | arrived without a name |
| `name_is_shelter_assigned` | came in with an owner's name | named by staff, so nobody was looking for them |
| `breed_bully_type` | not a bully-type breed | carries a bully-type breed label |
| `breed_bsl_risk` | no housing restrictions typically attached | breed often restricted by landlords and insurers |
| `breed_size_ordinal` | a size adopters ask for | larger than most adopters ask for |
| `breed_coat_ordinal` | longer coat | shorter coat |
| `color_has_black` | coat colour | coat colour |
| `shelter_census_at_intake` | arrived when the shelter had room | arrived when the shelter was full |
| `prior_intake_count` | first visit | has been here {n} times before |
| `intakes_prior_30d` | arrived in a quiet month | arrived during a busy month |

Note on `color_has_black`: the phrasing is deliberately neutral in both columns.
This dataset does not support the folk belief that black animals wait longer, and
the interface should not imply otherwise. See the model page copy below.

---

## Animal detail

| Element | String |
|---|---|
| Back link | Back to the queue |
| Prediction panel title | Predicted wait |
| Interval note | Range shows the 95 percent interval |
| Plain reading | About {n} in 10 animals like this one go home within 30 days. |
| Low confidence caveat | This animal is unlike most of what the model was trained on, so treat this number as a rough guide and lean on staff judgement. |
| Curve title | Chance of going home, over time |
| Curve note | The remaining share leave by another route, such as transfer to a rescue partner or return to an owner. |
| Drivers title | Why this prediction |
| Interventions title | What would help |
| Evidence, measured | Measured in this dataset |
| Evidence, assumed | Assumption, not measured here |
| Timeline title | History |
| Similar title | Animals like this one, and what happened |
| Similar outcome | {outcome} after {days} days |

---

## Discover

| Element | String |
|---|---|
| Page title | Meet the ones who have been waiting |
| Page subtitle | These animals have been at the shelter longest. Every one of them is ready to go home today. |
| Sort default label | Longest waiting first |
| Filter chips | Dogs / Cats / Small / Medium / Large / Under a year / Over seven |
| Waiting badge | Waiting {days} days |
| Card CTA | Meet {name} |
| Empty | No animals match what you are looking for right now. Try widening the filters. |

Nothing on this route mentions the model, a score, a probability, or a risk band.

---

## Planner

| Element | String |
|---|---|
| Page title | This week's outreach plan |
| Page subtitle | Turn the queue into a list of jobs your team can actually finish. |
| Capacity input label | How many animals can your team feature this week? |
| Channel heading | Which channels are available? |
| Generate button | Build the plan |
| Plan heading | {n} animals across {m} channels |
| Time estimate | About {hours} hours of staff time |
| Expected effect heading | What this buys you |
| Measured line | Working the top {k} of the queue reaches animals who are {lift}x more likely to become long-stay residents than a randomly chosen {k}. That figure is measured on held-out data. |
| Assumption line | The effect of the intervention itself is an assumption, not a measurement. Adjust it below to see how the plan changes. |
| Export CSV | Download as CSV |
| Print | Printable version |

---

## Model page

Page title: **How this model works, and where it does not**

Section 1, **What it does**:

> SecondChance estimates four things for every animal at intake: the chance of
> being adopted within 7, 14 and 30 days, and the chance of still being in the
> shelter after 60 days. It also produces a full curve of adoption chance over
> time, and an expected number of days in care.

Section 2, **How well it works**:

> The numbers below come from a held-out test block: animals who arrived between
> January 2020 and January 2022, none of whom the model saw during training. The
> model was trained on arrivals through December 2018 and calibrated on 2019.
> Testing across that gap is deliberate. A model evaluated only on data from its
> own era tells you nothing about what happens when the world moves.

Section 3, **Who it works for**:

> A model that works well on average can still work badly for a particular group
> of animals, and that is exactly the failure that matters here. The table below
> breaks performance down by species, life stage, intake condition, and by two
> breed labels that carry real consequences in the housing market.
>
> Two results are worth naming directly. The model is less accurate for
> bully-type breeds than for other dogs, and it slightly under-predicts their
> adoption chances, which means the queue puts them higher than their actual
> outcomes justify. Since the queue routes help toward animals, erring in that
> direction is the safer of the two errors, but it is still an error and it is
> reported rather than hidden.
>
> The second result is a negative one. Black coat colour is widely believed in
> shelter work to slow adoption. In this dataset it does not. Animals with black
> in their coat were adopted at a very slightly higher rate than animals without
> it, and the model's accuracy is essentially the same for both. We report this
> because a tool that quietly encoded the folk belief would have made it true.

Section 4, **What it keys on**:

> Age at intake is by far the strongest signal, and its shape is not a straight
> line. Intake condition and intake type come next. Breed structure matters much
> more for predicting a long stay than for predicting a fast adoption, which is
> an intuitive result once you see it: breed does not stop an animal being
> adopted quickly, but it does predict who is still there in two months.

Section 5, **When it stops working**:

> In March 2020 the Austin shelter changed how it operated. Intake volume fell,
> the population in care fell, and foster placement rose sharply. The model, which
> had been trained on 2018 data, kept ranking animals about as well as before:
> its ability to tell a fast adoption from a slow one barely moved. What broke was
> calibration. In July 2020 the model was predicting a 30-day adoption rate 12
> percentage points above what actually happened.
>
> That is the failure mode worth understanding. A model can keep its ranking and
> lose its meaning, and a dashboard that shows probabilities will keep showing
> confident, wrong numbers the whole time. Monitoring only the ranking metric
> would have missed it.

Section 6, **What it must not be used for**: the full use policy.

---

## Error and empty states

| Situation | String |
|---|---|
| Network failure | We could not reach the prediction service. Showing sample data instead. |
| Retry button | Try again |
| Animal not found | We do not have a record for that animal. |
| Queue unavailable | The queue is being rebuilt. Showing the last version we have. |
| Field required | This field is required |
| Age out of range | Enter an age between 0 and 12,000 days |
| Generic error | Something went wrong on our side. Reference {request_id}. |

---

## Accessibility strings

| Element | String |
|---|---|
| Chart role description | Chart. {summary} |
| Table toggle | View as table |
| Chart toggle | View as chart |
| Skip link | Skip to main content |
| Risk bar label | Risk band: {band} |
| Sort ascending | Sorted by {column}, ascending |
| Loading region | Loading {what} |
| Live region, filter applied | Showing {n} of {total} animals |

Chart summaries are written per chart, not generated. Example for the forecast:

> Chart. Shelter population from {start} to {end}, with a 30-day projection.
> Population is projected to reach {value} by {date}, with an 80 percent interval
> from {low} to {high}.
