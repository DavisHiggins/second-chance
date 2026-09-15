/**
 * The metric registry: one definition per number the product shows.
 *
 * Cards, chart help, animal details, the data drawer and the How-it-works
 * page all read from here, so a figure cannot mean one thing on the
 * dashboard and another on the model page. Each entry keeps one sentence for
 * the visible label and the rest for a disclosure. Values are never stored
 * here; only the meaning of a value is.
 *
 * Client-safe: plain data, no imports.
 */

export interface MetricEntry {
  id: MetricId;
  title: string;
  /** One sentence, always visible. */
  meaning: string;
  unit: string;
  /** Formula or cohort in plain words. */
  formula: string;
  /** The date window, or where the window is decided. */
  window: string;
  /** Sample and exclusions. */
  sample: string;
  /** What it is good for. */
  use: string;
  /** What it cannot tell you. */
  limitation: string;
  /** Data or model context. */
  source: string;
}

export type MetricId =
  | "open-stays"
  | "days-waiting"
  | "median-days-to-adoption"
  | "adopted-within-30d"
  | "long-stay-observed"
  | "p-long-stay"
  | "p-adopt-30d"
  | "monthly-events"
  | "life-stage-median"
  | "outcome-share"
  | "sample-size"
  | "roc-auc"
  | "pr-auc"
  | "ece"
  | "calibration-line"
  | "brier"
  | "log-loss"
  | "precision-at-50"
  | "lift-at-50"
  | "subgroup-gap"
  | "feature-importance"
  | "cumulative-incidence"
  | "hazard-ratio"
  | "staff-time"
  | "scenario-adoptions";

const ENTRIES: MetricEntry[] = [
  {
    id: "open-stays",
    title: "Open shelter stays",
    meaning:
      "Cat and dog intake episodes with no confidently matched recorded outcome as of the snapshot.",
    unit: "stays",
    formula:
      "Count of companion-animal intake rows whose intake is on or before the snapshot and which have no matched outcome on or before it. A repeat arrival is a new stay.",
    window: "As of the snapshot time shown in the data details.",
    sample:
      "Wildlife and livestock are excluded. Ambiguous joins are excluded. Records open for more than a year are counted but flagged as possibly stale.",
    use: "A rough size for the population that may need review.",
    limitation:
      "Not verified adoption availability and not exact kennel occupancy: Austin publishes intake and outcome events, not a roster.",
    source: "Derived from the two current ShelterBuddy feeds.",
  },
  {
    id: "days-waiting",
    title: "Days waiting",
    meaning: "Whole days from this stay's intake to the snapshot, for an inferred open stay.",
    unit: "days",
    formula:
      "Snapshot time minus intake time, both read on Austin's clock, rounded down to whole days.",
    window: "Intake to snapshot.",
    sample: "Open stays only.",
    use: "Finding long waits.",
    limitation:
      "A record the shelter never closed keeps accruing days; past a year it is flagged as possibly stale rather than trusted.",
    source: "Intake `source_date` in the current feed; the snapshot time is this site's.",
  },
  {
    id: "median-days-to-adoption",
    title: "Median days to adoption",
    meaning:
      "The middle wait among animals actually adopted in the cohort: about half waited less and half more.",
    unit: "days",
    formula: "Median of intake-to-adoption durations over adopted, confidently matched stays.",
    window: "Stays that began in the trailing twelve months.",
    sample:
      "Adoptions only. Transfers, returns to owner, euthanasia and open stays are not in the sample.",
    use: "Comparing observed adoption timelines across periods or groups.",
    limitation:
      "It is not every animal's expected wait: animals still waiting and animals who left another way are not counted.",
    source: "Current feeds; adoption variants are folded into one bucket.",
  },
  {
    id: "adopted-within-30d",
    title: "Adopted within 30 days, observed",
    meaning:
      "Eligible arrivals adopted by day 30, divided by arrivals that have had a full 30 days in which to be adopted.",
    unit: "share of eligible arrivals",
    formula:
      "Adopted with duration ≤ 30 days ÷ arrivals with at least 30 days between intake and the snapshot.",
    window: "Arrivals in the trailing twelve months, excluding the most recent 30 days.",
    sample:
      "Arrivals too recent to have had 30 days are excluded, not counted as failures. Other exits within 30 days count as not adopted.",
    use: "Historical early-adoption frequency.",
    limitation: "A recent change in practice shows up only after 30 days have elapsed.",
    source: "Current feeds.",
  },
  {
    id: "long-stay-observed",
    title: "Stays longer than 60 days, observed",
    meaning: "Completed stays lasting more than 60 days, divided by completed stays.",
    unit: "share of completed stays",
    formula: "Completed stays with duration > 60 ÷ completed stays in the cohort.",
    window: "Stays that began in the trailing twelve months.",
    sample: "Completed, confidently matched cat and dog stays, whatever the outcome.",
    use: "How often long stays happened in completed history.",
    limitation:
      "It is not the fraction of animals currently here who are past 60 days, and it is not a prediction.",
    source: "Current feeds.",
  },
  {
    id: "p-long-stay",
    title: "Predicted long-stay probability",
    meaning:
      "The model's estimate, made from what was known at intake, that the total stay exceeds 60 days.",
    unit: "probability",
    formula:
      "Calibrated output of the long-stay model for the stay's intake-time inputs. Bands: 60% and above, 40%, 25%.",
    window: "Answered at intake; not re-asked as the stay continues.",
    sample: "Cats and dogs with a recorded date of birth. Others show as unavailable.",
    use: "Ranking which arrivals may deserve earlier attention.",
    limitation:
      "A 70% estimate means roughly 70 of 100 comparable scored cases would pass 60 days if calibration holds. It is not certainty, temperament or an animal's value, and for an animal already past 60 days it is history, not a forecast.",
    source: "Published model artifact; version and evaluation on the How it works page.",
  },
  {
    id: "p-adopt-30d",
    title: "Predicted 30-day adoption probability",
    meaning: "Estimated probability of adoption by day 30 counting from intake.",
    unit: "probability",
    formula: "Calibrated output of the 30-day adoption model for intake-time inputs.",
    window: "Day 0 to day 30 from arrival.",
    sample: "Cats and dogs with a recorded date of birth.",
    use: "A second view of the same arrival: fast exit rather than long stay.",
    limitation:
      "Not \"within the next 30 days\" for an animal already here, and not one minus the long-stay probability.",
    source: "Published model artifact.",
  },
  {
    id: "monthly-events",
    title: "Monthly intakes and adoptions",
    meaning: "Separate counts of arrival events and adoption events in each month.",
    unit: "events per month",
    formula: "Intakes by intake month; adoptions by outcome month.",
    window: "Every complete month in the current feeds; the current month is marked partial.",
    sample: "Cats and dogs, confident joins.",
    use: "Seasonality and pressure.",
    limitation:
      "The two lines involve different animals. Dividing them is not an adoption rate; the tile uses a cohort rate instead.",
    source: "Current feeds.",
  },
  {
    id: "life-stage-median",
    title: "Life-stage adoption median",
    meaning: "Median days to adoption among adopted animals in each age group.",
    unit: "days",
    formula: "Median over adopted stays, grouped by life stage at intake.",
    window: "Stays that began in the trailing twelve months.",
    sample: "The adopted count is shown beside each median; the completed count is the share's denominator.",
    use: "Comparing observed timelines by age.",
    limitation:
      "A short median among successful adoptions can coexist with a low adoption share: the two answer different questions.",
    source: "Current feeds.",
  },
  {
    id: "outcome-share",
    title: "Outcome share",
    meaning: "Each recorded ending, divided by completed stays in the window.",
    unit: "share of completed stays",
    formula: "Completed stays with that outcome ÷ completed stays.",
    window: "Stays that began in the trailing twelve months.",
    sample:
      "Adopted folds every adoption variant. Transfer, return to owner, euthanasia and other statuses keep the feed's own wording.",
    use: "Where stays actually end.",
    limitation: "Transfer is not adoption. Open stays have no outcome and are not included.",
    source: "Current outcomes feed.",
  },
  {
    id: "sample-size",
    title: "Sample size",
    meaning: "The number of eligible stays or adoptions behind that specific figure.",
    unit: "stays",
    formula: "Count of rows contributing to the calculation, after exclusions.",
    window: "Same as the figure it accompanies.",
    sample: "Stated as \"based on … stays\" or \"… adoptions\" where the distinction matters.",
    use: "Judging how much to trust a figure.",
    limitation: "A small sample can move sharply when a few records change.",
    source: "Computed alongside each figure.",
  },
  {
    id: "roc-auc",
    title: "ROC AUC",
    meaning:
      "How often the model ranks a randomly chosen positive case above a randomly chosen negative one.",
    unit: "0.5 to 1",
    formula: "Area under the ROC curve on the held-out test block.",
    window: "Held-out test arrivals, dates on the How it works page.",
    sample: "Stays with an observable outcome.",
    use: "Ranking quality.",
    limitation: "0.694 does not mean 69.4% of predictions are correct.",
    source: "Published model artifact.",
  },
  {
    id: "pr-auc",
    title: "Average precision",
    meaning: "Summarises precision against recall as the selection threshold changes.",
    unit: "0 to 1",
    formula:
      "Average precision (scikit-learn), not the trapezoidal precision–recall area. Compare with the event rate: a model with no skill scores about the base rate.",
    window: "Held-out test block.",
    sample: "Same as ROC AUC.",
    use: "How well the top of the ranking concentrates true cases when the event is rare.",
    limitation: "False alarms and missed cases trade off; this is one summary of that trade.",
    source: "Published model artifact.",
  },
  {
    id: "ece",
    title: "Expected calibration error",
    meaning:
      "The average gap between predicted and observed rates across probability groups, weighted by group size.",
    unit: "probability points",
    formula: "Ten equal-width bins; per-bin |observed − predicted| weighted by bin share.",
    window: "Held-out test block, after calibration.",
    sample: "Same as ROC AUC.",
    use: "Whether the printed percentages mean what they say.",
    limitation:
      "0.047 is about 4.7 percentage points on that evaluation, not a ±4.7-point interval on any one animal.",
    source: "Published model artifact.",
  },
  {
    id: "calibration-line",
    title: "Calibration slope and intercept",
    meaning:
      "A straight line fitted to observed rate against predicted rate across ten deciles; ideal is slope 1, intercept 0.",
    unit: "unitless / probability points",
    formula:
      "observed = intercept + slope × predicted, fitted by least squares on decile means. A slope below 1 means predictions are more spread than outcomes; a positive intercept means observed rates sit above predictions at the low end.",
    window: "Held-out test block.",
    sample: "Same as ROC AUC.",
    use: "Naming the shape of a calibration problem.",
    limitation: "Neither value alone proves probabilities are trustworthy.",
    source: "Published model artifact; the fit is on the untransformed probability scale.",
  },
  {
    id: "brier",
    title: "Brier score",
    meaning: "Average squared difference between predicted probabilities and binary outcomes.",
    unit: "0 (best) to 1",
    formula: "mean((p − y)²).",
    window: "Held-out test block.",
    sample: "Same as ROC AUC.",
    use: "Overall probability quality; lower is better in a comparable population.",
    limitation: "Reflects both ranking and calibration, and depends on the base rate.",
    source: "Published model artifact.",
  },
  {
    id: "log-loss",
    title: "Log loss",
    meaning: "Probability error that penalises confident wrong predictions strongly.",
    unit: "nats, lower is better",
    formula: "−mean(y·ln p + (1−y)·ln(1−p)).",
    window: "Held-out test block.",
    sample: "Same as ROC AUC.",
    use: "Comparing models on the same evaluation problem.",
    limitation: "Not a percentage or an adoption rate.",
    source: "Published model artifact.",
  },
  {
    id: "precision-at-50",
    title: "Precision in the top 50",
    meaning: "Of the 50 highest-ranked evaluation cases, the share that actually had the outcome.",
    unit: "share",
    formula: "Positives among the top 50 by predicted probability ÷ 50.",
    window: "Held-out test block.",
    sample: "The 50 highest scores in the block.",
    use: "What a short worked list would have contained, historically.",
    limitation: "Retrospective evaluation, not demonstrated outreach success on today's queue.",
    source: "Published model artifact.",
  },
  {
    id: "lift-at-50",
    title: "Lift in the top 50",
    meaning: "The top-50 outcome rate divided by the evaluation base rate.",
    unit: "multiple",
    formula: "Precision in the top 50 ÷ overall positive rate in the block.",
    window: "Held-out test block.",
    sample: "Same as precision in the top 50.",
    use: "How concentrated the outcome is at the top of the ranking.",
    limitation:
      "A lift of 5× describes concentration of the outcome. It does not mean 5× more adoptions caused by the tool, and today's queue is not guaranteed the same figure.",
    source: "Published model artifact.",
  },
  {
    id: "subgroup-gap",
    title: "Subgroup calibration gap",
    meaning: "Mean predicted rate minus observed rate within a group, in percentage points.",
    unit: "percentage points",
    formula: "mean(p) − mean(y) for the group's test rows.",
    window: "Held-out test block.",
    sample: "Group sizes are shown beside each gap; small groups move easily.",
    use: "Whether the model over- or under-states risk for a kind of animal.",
    limitation: "Uncertainty is not estimated for small groups, so a small gap is not proof of fairness.",
    source: "Published model artifact.",
  },
  {
    id: "feature-importance",
    title: "Feature importance",
    meaning: "How much the model uses an input across the evaluated population.",
    unit: "share of shown gain",
    formula: "LightGBM gain importance, normalised over the inputs shown.",
    window: "Training data.",
    sample: "Whole training population.",
    use: "Which inputs the model leans on.",
    limitation: "Not causation, not direction of effect, and not an explanation of any single animal.",
    source: "Published model artifact.",
  },
  {
    id: "cumulative-incidence",
    title: "Cumulative adoption incidence",
    meaning: "The share estimated to have been adopted by a given day, accounting for competing exits.",
    unit: "share",
    formula: "Aalen–Johansen cumulative incidence with transfer, return and euthanasia as competing events.",
    window: "Archive study, October 2013 to March 2022.",
    sample: "Legacy archive stays under the previous shelter system.",
    use: "Historical context for how quickly groups were adopted.",
    limitation: "Archived values describe that period; they are not current rates.",
    source: "Earlier archive study.",
  },
  {
    id: "hazard-ratio",
    title: "Hazard ratio",
    meaning: "The relative instantaneous adoption rate under a fitted survival model.",
    unit: "multiple",
    formula: "Cox proportional-hazards coefficient, exponentiated.",
    window: "Archive study.",
    sample: "At-risk archive stays.",
    use: "Historical association between a characteristic and adoption speed.",
    limitation: "Not an adoption probability and not proof that an action changes outcomes.",
    source: "Earlier archive study.",
  },
  {
    id: "staff-time",
    title: "Estimated staff time",
    meaning: "The sum of assumed task times for the actions in a plan.",
    unit: "minutes",
    formula: "Σ assumed minutes per assigned action.",
    window: "This plan.",
    sample: "The rows in the plan.",
    use: "Rough workload planning.",
    limitation: "Coordination time, not the time to place an animal or complete care.",
    source: "Assumptions in the intervention catalogue.",
  },
  {
    id: "scenario-adoptions",
    title: "Scenario additional adoptions",
    meaning: "A hypothetical count from explicit assumptions about benefit and eligible animals.",
    unit: "animals",
    formula:
      "Σ over eligible animals of min(assumed percentage-point increase, 100% − baseline), where baseline is the intake-time 30-day estimate if the window is still open and zero otherwise.",
    window: "The 30-day horizon from intake, for animals still inside it; hypothetical for others.",
    sample: "Animals in the plan.",
    use: "Sizing an assumption, not measuring an outcome.",
    limitation: "Never achieved impact or a validated forecast.",
    source: "Planner assumptions set by the user.",
  },
];

const BY_ID: Record<string, MetricEntry> = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

export function metric(id: MetricId): MetricEntry {
  return BY_ID[id];
}

export function allMetrics(): readonly MetricEntry[] {
  return ENTRIES;
}

/** Labels for data-quality states, shared with the drawer and detail page. */
export const QUALITY_LABELS = {
  ambiguous: {
    title: "Ambiguous pairing",
    body: "An outcome named an intake time that did not match exactly. The stay is excluded from every count rather than guessed at.",
  },
  unmatchedOutcome: {
    title: "Unmatched outcome",
    body: "An outcome with no intake in the current feed. Almost all are animals admitted before the May 2025 cutover, whose intake lives in the frozen archive under a different ID format.",
  },
  possiblyStale: {
    title: "Possibly stale open record",
    body: "Open for more than a year. It may be a genuine long stay or a record never closed. Possibly stale is not proof the animal has left.",
  },
  missingAge: {
    title: "Missing intake age",
    body: "No date of birth was recorded, so age at intake is unknown and the model declines to score the stay. Unknown is not zero.",
  },
  unavailable: {
    title: "Unavailable prediction",
    body: "The model did not produce an estimate for this stay. The wait and record are still real and still shown.",
  },
} as const;
