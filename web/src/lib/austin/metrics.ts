import type { Episode, Species } from "./types";
import { daysBetween, isAdoptionOutcome, isCompanionSpecies, parseSourceTimestamp } from "./types";

/**
 * Aggregate metrics, each with its population and window written down.
 *
 * Every function here returns the definition alongside the number. A median
 * that does not say which animals it covers or what window it looks at is not
 * a measurement, it is a decoration, and the data-details drawer renders these
 * definitions verbatim so a user can always see what a figure counts.
 */

export interface MetricDefinition {
  id: string;
  label: string;
  /** Plain-English statement of exactly what is counted. */
  definition: string;
  /** What is deliberately left out, and why. */
  exclusions: string;
}

export interface MeasuredMetric<T> {
  value: T;
  /** Rows the value was computed from. A tiny n is shown, not hidden. */
  n: number;
  definition: MetricDefinition;
}

const MS_PER_DAY = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Closed, confidently joined, companion-animal episodes. The base population
 *  for every outcome statistic below. */
function analysable(episodes: Episode[]): Episode[] {
  return episodes.filter(
    (episode) =>
      episode.joinStatus === "matched" &&
      isCompanionSpecies(episode.species) &&
      episode.outcomeAt !== null &&
      episode.closedDaysInCare !== null &&
      episode.closedDaysInCare >= 0,
  );
}

function withinWindow(episode: Episode, windowStart: string, windowEnd: string): boolean {
  const intake = parseSourceTimestamp(episode.intakeAt);
  const start = parseSourceTimestamp(windowStart);
  const end = parseSourceTimestamp(windowEnd);
  if (intake === null || start === null || end === null) return false;
  return intake >= start && intake <= end;
}

/* -------------------------------------------------------------------------- */

export const MEDIAN_DAYS_TO_ADOPTION: MetricDefinition = {
  id: "median-days-to-adoption",
  label: "Median days to adoption",
  definition:
    "The middle value of intake-to-adoption duration for cats and dogs who arrived in the selected window and whose stay ended in an adoption.",
  exclusions:
    "Transfers to rescue partners, returns to an owner, and euthanasia are excluded. They end a stay but they are not adoptions, and averaging them together would describe no real outcome at all.",
};

export function medianDaysToAdoption(
  episodes: Episode[],
  windowStart: string,
  windowEnd: string,
): MeasuredMetric<number | null> {
  const durations = analysable(episodes)
    .filter((e) => isAdoptionOutcome(e.outcomeType) && withinWindow(e, windowStart, windowEnd))
    .map((e) => e.closedDaysInCare as number);

  return {
    value: median(durations),
    n: durations.length,
    definition: MEDIAN_DAYS_TO_ADOPTION,
  };
}

export const ADOPTED_WITHIN_30D: MetricDefinition = {
  id: "adopted-within-30d",
  label: "Adopted within 30 days",
  definition:
    "The share of cat and dog stays beginning in the selected window that ended in an adoption within 30 days of intake.",
  exclusions:
    "Stays that began less than 30 days before the data was retrieved are excluded entirely, because they have not yet had a full 30 days in which an adoption could happen. Counting them would drag the rate down purely because they are recent.",
};

/**
 * Rate of adoption within a horizon, with censoring handled explicitly.
 *
 * An episode that started 5 days ago cannot yet have failed to be adopted
 * within 30. Including it as a negative is the most common way this number
 * gets quietly understated, so the observation window is closed off before the
 * rate is taken.
 */
export function adoptedWithinDays(
  episodes: Episode[],
  horizonDays: number,
  windowStart: string,
  windowEnd: string,
  observedThrough: string,
): MeasuredMetric<number | null> {
  const observedMs = parseSourceTimestamp(observedThrough);
  const eligible = episodes.filter((episode) => {
    if (!isCompanionSpecies(episode.species)) return false;
    if (episode.joinStatus === "ambiguous") return false;
    if (!withinWindow(episode, windowStart, windowEnd)) return false;

    const intakeMs = parseSourceTimestamp(episode.intakeAt);
    if (intakeMs === null || observedMs === null) return false;
    // The full horizon must have elapsed for this episode to be judged.
    return observedMs - intakeMs >= horizonDays * MS_PER_DAY;
  });

  if (eligible.length === 0) {
    return { value: null, n: 0, definition: ADOPTED_WITHIN_30D };
  }

  const adopted = eligible.filter((episode) => {
    if (!isAdoptionOutcome(episode.outcomeType)) return false;
    const duration = episode.closedDaysInCare;
    return duration !== null && duration <= horizonDays;
  }).length;

  return {
    value: adopted / eligible.length,
    n: eligible.length,
    definition: ADOPTED_WITHIN_30D,
  };
}

export const LONG_STAY_OBSERVED: MetricDefinition = {
  id: "long-stay-observed",
  label: "Stays longer than 60 days",
  definition:
    "The share of completed cat and dog stays in the window that lasted more than 60 days, whatever the outcome was.",
  exclusions:
    "This is what happened, not what a model expects to happen. Predicted long-stay risk is a separate figure and is never mixed into this one.",
};

export function observedLongStayRate(
  episodes: Episode[],
  thresholdDays: number,
  windowStart: string,
  windowEnd: string,
): MeasuredMetric<number | null> {
  const closed = analysable(episodes).filter((e) => withinWindow(e, windowStart, windowEnd));
  if (closed.length === 0) return { value: null, n: 0, definition: LONG_STAY_OBSERVED };

  const long = closed.filter((e) => (e.closedDaysInCare as number) > thresholdDays).length;
  return { value: long / closed.length, n: closed.length, definition: LONG_STAY_OBSERVED };
}

export const ANIMALS_IN_CARE: MetricDefinition = {
  id: "animals-in-care",
  label: "Open shelter stays",
  definition:
    "Cat and dog stays that had begun as of the selected time and had no recorded outcome by that time. Inferred from the public intake and outcome feeds, not read from an official roster.",
  exclusions:
    "Wildlife and livestock intakes, and any stay whose intake-to-outcome join was not confident, are excluded. A public intake record is not proof that an animal is currently available for adoption.",
};

export const CURRENT_QUEUE: MetricDefinition = {
  id: "current-queue",
  label: "Current queue",
  definition:
    "Open stays ordered by how long the animal has been waiting, or by predicted long-stay risk when a validated current model is scoring.",
  exclusions:
    "Ambiguous joins and closed stays never appear. When no validated model is available the ordering is descriptive only, and is labelled as such.",
};

/* -------------------------------------------------------------------------- */

export interface OutcomeMix {
  outcomeType: string;
  n: number;
  share: number;
}

/** Where stays actually end, grouped. Adoption variants are collapsed into one
 *  bucket so the chart does not split a single real outcome across six slices. */
export function outcomeMix(
  episodes: Episode[],
  windowStart: string,
  windowEnd: string,
): MeasuredMetric<OutcomeMix[]> {
  const closed = analysable(episodes).filter((e) => withinWindow(e, windowStart, windowEnd));
  const counts = new Map<string, number>();

  for (const episode of closed) {
    const bucket = isAdoptionOutcome(episode.outcomeType)
      ? "Adopted"
      : (episode.outcomeType ?? "Unknown");
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const mix = [...counts.entries()]
    .map(([outcomeType, n]) => ({ outcomeType, n, share: closed.length === 0 ? 0 : n / closed.length }))
    .sort((a, b) => b.n - a.n);

  return {
    value: mix,
    n: closed.length,
    definition: {
      id: "outcome-mix",
      label: "How stays end",
      definition:
        "Completed cat and dog stays in the window, grouped by outcome. All adoption variants the feed uses are counted as one Adopted bucket.",
      exclusions: "Open stays are excluded, because their outcome is not yet known.",
    },
  };
}

export interface MonthlyPoint {
  month: string;
  intakes: number;
  adoptions: number;
  medianDaysToAdoption: number | null;
}

/** Monthly intake and adoption counts, for the trend chart. Built from the
 *  episode set already in memory rather than a second network round trip. */
export function monthlySeries(episodes: Episode[]): MonthlyPoint[] {
  const buckets = new Map<string, { intakes: number; adoptionDurations: number[] }>();

  const ensure = (month: string) => {
    let bucket = buckets.get(month);
    if (!bucket) {
      bucket = { intakes: 0, adoptionDurations: [] };
      buckets.set(month, bucket);
    }
    return bucket;
  };

  for (const episode of episodes) {
    if (!isCompanionSpecies(episode.species)) continue;
    if (episode.joinStatus === "ambiguous") continue;

    ensure(episode.intakeAt.slice(0, 7)).intakes += 1;

    if (episode.outcomeAt && isAdoptionOutcome(episode.outcomeType)) {
      const duration = episode.closedDaysInCare;
      if (duration !== null && duration >= 0) {
        ensure(episode.outcomeAt.slice(0, 7)).adoptionDurations.push(duration);
      }
    }
  }

  return [...buckets.entries()]
    .map(([month, bucket]) => ({
      month,
      intakes: bucket.intakes,
      adoptions: bucket.adoptionDurations.length,
      medianDaysToAdoption: median(bucket.adoptionDurations),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface SegmentRow {
  dimension: string;
  level: string;
  n: number;
  medianDaysToAdoption: number | null;
  adoptionShare: number | null;
}

/** Where waits are longest, by a chosen grouping. Purely observed: no model
 *  output is involved, so this stays truthful when scoring is unavailable. */
export function segmentByLifeStage(
  episodes: Episode[],
  lifeStageOf: (species: Species, ageDays: number | null) => string,
): SegmentRow[] {
  const buckets = new Map<string, { durations: number[]; total: number; adopted: number }>();

  for (const episode of analysable(episodes)) {
    const level = lifeStageOf(episode.species, episode.ageAtIntakeDays);
    let bucket = buckets.get(level);
    if (!bucket) {
      bucket = { durations: [], total: 0, adopted: 0 };
      buckets.set(level, bucket);
    }
    bucket.total += 1;
    if (isAdoptionOutcome(episode.outcomeType)) {
      bucket.adopted += 1;
      bucket.durations.push(episode.closedDaysInCare as number);
    }
  }

  return [...buckets.entries()]
    .map(([level, bucket]) => ({
      dimension: "life stage",
      level,
      n: bucket.total,
      medianDaysToAdoption: median(bucket.durations),
      adoptionShare: bucket.total === 0 ? null : bucket.adopted / bucket.total,
    }))
    .sort((a, b) => (b.medianDaysToAdoption ?? -1) - (a.medianDaysToAdoption ?? -1));
}

/** Days between two source timestamps, re-exported so callers do not reach
 *  into the type module for one helper. */
export { daysBetween };
