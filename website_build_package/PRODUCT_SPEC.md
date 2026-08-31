# SecondChance product specification

Six routes. Every screen, component, state and acceptance criterion is here.
Where a number appears on screen, this document names the field in `data/` or
`MEASURED_RESULTS.json` it comes from.

---

## Global shell

Present on every route.

### Header (sticky, 64px, `--surface-card`, hairline bottom border)

Left to right:

1. **Wordmark.** "SecondChance" in `--text-subtitle` weight 600, with the mark: a
   16px circle outline in slot 1 blue, three quarters closed, opening at the top
   right. It is a second chance, so the circle is not finished.
2. **Primary navigation.** Dashboard, Queue, Discover, Planner, Model. Active
   item carries the sliding 2px underline from `ANIMATION_SPEC.md` section 7.
3. **Spacer.**
4. **Freshness chip.** Reads `metadata.data_as_of`. Renders per
   `ANIMATION_SPEC.md` section 9. Text: "Data current as of 4 Mar 2022, 11:25".
   In static mode this shows the fixture's own timestamp and a "sample data"
   qualifier. Never show a live-looking timestamp for bundled data.
5. **Model version chip.** Reads `metadata.model_version`. Monospace,
   `--text-caption`, `--surface-sunken` background. Clicking it routes to
   `/model`.
6. **Density toggle** and **theme toggle**, both icon buttons, both persisted.

### Footer

Three columns: what this is, data sources with links, and the use policy in full.
The use policy text is in `CONTENT.md` and must appear verbatim.

### The use-policy banner

On `/`, `/queue` and `/planner`, directly under the page title, a single-line
banner in `--surface-sunken` with an info icon:

> Scores route help toward animals. They must never be used to justify
> euthanasia, intake refusal, or reduced care.

`--text-small`, `--ink-secondary`, always visible, not dismissible.

---

## Route 1. Operations dashboard (`/`)

The screen a shelter director opens at 8am. Build this first.

### 1.1 Hero row

Full width panel, `--radius-xl`, `--surface-raised`, `--elev-2`, `--space-6`
padding.

**Left, 60 percent:** the hero number.

- Value: count of animals in `data/queue.json` with
  `p_long_stay_60d >= 0.5`.
- Rendered at `--text-hero`, counting up once per `ANIMATION_SPEC.md` section 2.
- Label beneath, `--text-subtitle`, `--ink-secondary`: "animals need attention
  this week".
- Supporting line, `--text-small`, `--ink-muted`: "out of {total} currently in
  care · ranked by predicted 60-day stay risk".
- Primary button: "Open the queue" routes to `/queue`.

**Right, 40 percent:** a 180px donut of the current population by predicted
outcome band, using sequential ramp steps 250, 400, 550 and 700 for the four
bands (under 7 days, 7 to 30, 30 to 60, over 60). Centre of the donut carries the
total count. Legend to the right with direct value labels, so the ramp never has
to be read by eye.

### 1.2 Stat tile row. four tiles

Each: `--radius-lg`, `--surface-card`, `--elev-1`, `--space-5` padding, a 40px
sparkline, and a delta chip.

| Tile | Value | Sparkline | Delta |
|---|---|---|---|
| Animals in care | `metadata.current_census` | 12-month census from `data/trends.json` | vs 30 days ago |
| Median days to adoption | `metadata.median_days_to_adoption` | 12-month median | vs 30 days ago |
| 30-day adoption rate | `metadata.adoption_rate_30d` | 12-month rate | vs same month last year |
| Predicted long-stay | count where `p_long_stay_60d >= 0.5` | 12-month count | vs 30 days ago |

Delta chip: arrow icon, signed percentage, `good` colour when the direction is
good for the animals and `serious` when it is not. **Direction is per-metric, not
per-sign**: census going up is not good news; adoption rate going up is. Hardcode
the polarity per tile; do not infer it.

### 1.3 Thirty-day population forecast

Full width, `--radius-lg` card, 320px chart.

- Line chart from `data/forecast.json`. Historic census as a solid slot 1 line,
  forecast as the same colour dashed, with a shaded 80 percent interval band at
  12 percent opacity.
- Vertical hairline marks "today", labelled.
- A dotted horizontal line at `metadata.capacity_reference` labelled "typical
  operating capacity". Where the forecast band crosses it, the crossing point is
  direct-labelled.
- Crosshair plus tooltip showing date, central estimate, and interval.
- Table view toggle in the card header.

**Honest-state requirement:** if `forecast.json` carries
`"method": "seasonal_naive"`, the card subtitle must say so. The forecast in the
shipped fixture is a seasonal baseline, not a trained model, and the UI says that
plainly rather than implying more than was built.

### 1.4 Two-up row

**Left panel, "Where the wait is longest".** Horizontal bar chart of median predicted
days by life stage, from `data/segments.json`. Six bars, sequential ramp ordered
by value, direct-labelled at the end of each bar.

**Right panel, "Model health".** Four rows, each an icon, a label, a value and a
status colour, from `MEASURED_RESULTS.json`:

- Discrimination: `targets.adopted_within_30d.models.lightgbm.test_calibrated.roc_auc`
- Calibration error: the same object's `ece`
- Input drift: `drift.top_drifting_features_post_shift[0].psi` with its status
- Last retrained: `metadata.model_trained_at`

Each row links to the matching section of `/model`.

### Acceptance criteria

- Hero number counts up once, never on re-render.
- Every tile shows a unit.
- Forecast band is visible and the interval appears in the tooltip.
- The whole route renders from `data/` with the network disabled.
- Tab order runs header, hero button, each tile, each chart's table toggle.

---

## Route 2. Needs-attention queue (`/queue`)

### 2.1 Controls row

One row above the list: species filter (All, Dogs, Cats), a risk-threshold
slider (0.3 to 0.9, default 0.5), a sort control (risk, days waiting, arrival
date), and a search box. Filters live in the URL query string so a view can be
sent to a colleague.

### 2.2 The list

One row per animal, 88px comfortable, 64px compact.

Left to right:

1. **Risk bar.** 4px vertical bar, full row height, coloured by band: `critical`
   above 0.7, `serious` 0.5 to 0.7, `warning` 0.3 to 0.5, slot 3 aqua below.
2. **Photo** (56px, `--radius-md`) or, where none exists, a monogram tile in
   `--surface-sunken` with the animal's initial. Do not use a stock photo of a
   different animal.
3. **Identity block.** Name (or "Unnamed" in `--ink-muted` italic), then
   `--text-small` `--ink-secondary`: "{breed} · {age_band} · {sex}".
4. **Days waiting.** `--text-title` tabular, with "days" beneath in
   `--text-caption`.
5. **Probability meter.** 120px horizontal bar per `ANIMATION_SPEC.md` section 6,
   with the value as a whole percent beside it and the uncertainty interval as a
   lighter band behind the fill.
6. **Top driver chip.** The single largest SHAP contributor from
   `drivers[0].feature`, phrased in plain language via the map in `CONTENT.md`.
   Example: "1 year old · lowers chance".
7. **Actions.** Icon buttons: expand, mark actioned, open detail.

### 2.3 The expanded explanation card

Opens inline per `ANIMATION_SPEC.md` section 5.

- **Left:** a horizontal diverging bar chart of the top six SHAP drivers.
  Positive contributions in slot 1 blue extending right, negative in slot 8 red
  extending left, from a centred zero axis. Each bar direct-labelled with the
  plain-language phrase and the signed contribution.
- **Right:** the recommended intervention, from `data/interventions.json`, keyed
  on the animal's dominant driver. Each recommendation carries an expected effect
  and, crucially, a source: either "measured in this dataset" with the figure, or
  "shelter practice, not measured here". **Never present an unmeasured
  recommendation as if it were measured.**
- **Beneath:** the animal's predicted survival curve as a small line chart, with
  the 7, 14 and 30 day points marked.

### Acceptance criteria

- Reorder animates via `layout`, not a re-mount.
- The threshold slider updates the list within one frame of release; it does not
  re-run the entrance animation.
- Filters survive a page reload through the query string.
- Every driver chip reads as plain English, never as a raw feature name.
- Marking actioned is reversible for 5 seconds via an undo toast.

---

## Route 3. Animal detail (`/animals/:id`)

Two columns from 1024px, stacked below.

**Left (60 percent):**

- Photo, or the monogram tile at 320px.
- Name, breed, age, sex, colour, intake type, intake date, days in care.
- **Predicted wait panel.** Three stat blocks for 7, 14 and 30 day adoption
  probability, each with its interval. Beneath, the survival curve with a shaded
  band and a plain-language reading: "About 3 in 10 animals like this one go home
  within 30 days."
- **Why this prediction.** The same diverging SHAP chart as the queue's expanded
  card, at full width.

**Right (40 percent), sticky:**

- **What would help.** Ranked interventions with their sourcing.
- **Timeline.** Intake, any prior visits, and the current day, as a vertical
  timeline. Repeat visitors show every prior episode with its outcome.
- **Similar animals.** Three cards of animals with the closest feature profile
  and a known outcome, each showing what actually happened. This is the single
  most persuasive element on the page for a sceptical staff member, because it
  replaces a probability with three real cases.

### Acceptance criteria

- Deep links work. `/animals/A786884` loads directly.
- A missing photo never leaves a hole; the monogram tile is the same size.
- Every probability shows its interval.
- The page carries the use policy in the footer of the prediction panel.

---

## Route 4. Discover (`/discover`)

The public-facing view. Different tone: warm, spacious, no jargon. No probability
is shown to the public as a number.

- Hero: "Meet the ones who have been waiting", with a count.
- Filter chips: species, size, age, "good with other pets", "been here longest".
- Card grid, 3 up at 1280px, 2 at 768px, 1 below. Each card: photo, name, one
  plain sentence about the animal, and a "waiting N days" badge.
- **Sort defaults to longest waiting**, which is the entire point of the page.
- Each card links to a public version of the detail page that shows the story and
  the days waiting, and does not show the model's probability. A member of the
  public does not need to be told an animal is statistically unlikely to be
  adopted; that framing hurts the animal.

### Acceptance criteria

- No probability, no risk score, no model language anywhere on this route.
- Images lazy-load with reserved aspect ratio and a blurred placeholder.
- Cards are keyboard reachable and the whole card is the link target.

---

## Route 5. Outreach planner (`/planner`)

Turns the queue into a week of work.

- **Capacity input.** "How many animals can your team feature this week?"
  Number input, default 20.
- **Channel mix.** Checkboxes for photography, foster recruitment, adoption
  event, behaviour support, medical, social media. Each carries a per-animal time
  estimate from `data/interventions.json`.
- **Generated plan.** A table of the top N animals with a suggested channel each,
  chosen by matching the animal's dominant driver to the channel that addresses
  it. Grouped by channel with a total time estimate per group.
- **Expected effect panel.** Uses the measured lift from `MEASURED_RESULTS.json`:
  "Working the top 50 of the queue reaches animals who are
  {lift_at_50}× more likely to become long-stay than a randomly chosen 50."
  That figure is measured; anything about what the intervention *achieves* is
  labelled as an assumption, with the assumed rate shown and adjustable.
- **Export** to CSV and a printable view.

### Acceptance criteria

- The measured lift figure is read from the results file, never hardcoded.
- Every assumed number is visibly marked as an assumption and is editable.
- The printable view fits on one page at Letter size.

---

## Route 6. Model transparency (`/model`)

Driven entirely by `MEASURED_RESULTS.json`. This route is the argument that the
rest of the product can be trusted.

### 6.1 Summary strip

Four figures: held-out AUC, calibration error, episodes trained on, evaluation
period. Each with a one-line plain-language gloss.

### 6.2 How well it works

- Grouped bar chart of AUC by target and model, with bootstrap intervals, from
  `targets.*.models.*.test_calibrated`.
- Calibration plot: predicted against observed, fifteen bins, with the diagonal.
- Precision-at-k curve for the long-stay queue.

### 6.3 Who it works for

The subgroup table from `subgroup_metrics.csv`: attribute, level, n, AUC,
calibration gap. Rows where the absolute calibration gap exceeds 0.04 are flagged
with the `warning` status and an explanatory note. **Do not hide the weak
subgroups.** The point of this section is that they are visible.

### 6.4 What it keys on

The SHAP importance chart and the age partial-dependence curve.

### 6.5 When it stops working

The monthly performance timeline from `monthly_performance.csv`, with the warning
and critical bands shaded, and the March 2020 marker. Beneath it, prose from
`CONTENT.md` explaining what happened and what the system did about it.

### 6.6 What it must not be used for

The use policy in full, at `--text-body`, in a bordered panel.

### Acceptance criteria

- Every figure on this route traces to a field in the results file. No literals.
- The subgroup table is sortable and has a visible caption naming the sample.
- If a field is absent from the results file, the component renders "not
  measured" rather than a zero.

---

## Empty, loading and error states

Every list and chart needs all four. Specify once, reuse everywhere.

| State | Treatment |
|---|---|
| Loading | Skeleton of the final shape after 400ms, per `ANIMATION_SPEC.md` section 8 |
| Empty (no data yet) | Illustration-free. Icon, one line of what would go here, and one action |
| Empty (filtered to nothing) | "No animals match these filters" plus a "clear filters" button |
| Error | `critical` icon, what failed in plain language, a retry button, and, where a fixture exists, "showing sample data instead" |

An error state never shows a stack trace and never shows a blank card.

---

## Responsive

| Breakpoint | Layout |
|---|---|
| under 640px | single column, header collapses to a drawer, tables become stacked cards |
| 640 to 1023px | two column stat tiles, charts full width |
| 1024 to 1279px | full layout, sticky sidebar on detail |
| 1280px and up | max content width 1440px, centred |

The queue is the hardest one. Below 640px, each row becomes a card: photo and
name on the first line, days waiting and probability meter on the second, driver
chip on the third.

---

## Performance budget

- First contentful paint under 1.2s on a mid-range laptop.
- Total JavaScript under 350KB gzipped. Recharts is the biggest dependency;
  import only the components used.
- No layout shift after first paint. Cumulative layout shift under 0.05.
- The queue must stay smooth at 1,000 rows. Virtualise above 200.
