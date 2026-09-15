import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import interventionsFixture from "@/data/interventions.json";
import { getCurrentShelterData } from "@/lib/austin/current.server";
import { loadScoringModel, riskBand, scoreEpisodes, type RiskBand } from "@/lib/model/registry.server";
import type { CurrentStay } from "@/lib/austin/current-inventory";
import { lifeStageFor } from "@/lib/austin/current-inventory";
import { VIEW_CACHE_SECONDS, type DataStatus, type ScoringStatus } from "@/lib/austin/status";
import type { Episode } from "@/lib/austin/types";
import { isAdoptionOutcome, parseSourceTimestamp } from "@/lib/austin/types";
import { austinNowFloating } from "@/lib/austin/time";
import {
  ANIMALS_IN_CARE,
  ADOPTED_WITHIN_30D,
  CURRENT_QUEUE,
  LONG_STAY_OBSERVED,
  MEDIAN_DAYS_TO_ADOPTION,
  adoptedWithinDays,
  medianDaysToAdoption,
  monthlySeries,
  observedLongStayRate,
  outcomeMix,
  segmentByLifeStage,
  type MeasuredMetric,
  type MetricDefinition,
  type MonthlyPoint,
  type OutcomeMix,
  type SegmentRow,
} from "@/lib/austin/metrics";

/**
 * The page-facing view of the shelter.
 *
 * Pages call this and nothing else. It is the seam where live source data,
 * model output and metric definitions come together, and it is deliberately
 * the only place that decides what a page is allowed to claim: when scoring is
 * not live, no view model here carries a probability, so no page can render
 * one by accident.
 */

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export const USE_POLICY = {
  intended_use:
    "Prioritise photography, foster placement, behaviour support, adoption events and outreach for animals a validated model estimates may be at greater risk of a long stay.",
  prohibited_use:
    "This score must never inform euthanasia, intake refusal, or any decision that reduces the care an animal receives. A high predicted long-stay risk is a request for more help, not less.",
} as const;

/** A current stay with whatever the model was able to say about it. */
export interface ScoredStay extends CurrentStay {
  pLongStay60d: number | null;
  pAdopt30d: number | null;
  riskBand: RiskBand | null;
  /** Why no prediction, when there is none. Rendered to the user verbatim. */
  predictionUnavailableReason: string | null;
}

export interface ShelterMetrics {
  animalsInCare: MeasuredMetric<number>;
  medianDaysToAdoption: MeasuredMetric<number | null>;
  adoptedWithin30d: MeasuredMetric<number | null>;
  observedLongStay: MeasuredMetric<number | null>;
  outcomes: MeasuredMetric<OutcomeMix[]>;
}

/** A stay that closed recently, kept so a stale deep link can say so. */
export interface RecentlyClosed {
  episodeId: string;
  animalId: string;
  name: string | null;
  outcomeAt: string;
  /** "Adopted", "Transfer", … as the feed words it, adoption variants folded. */
  outcome: string;
}

export interface ShelterView {
  status: DataStatus;
  scoringStatus: ScoringStatus;
  /** Companion-animal stays open right now, longest wait first. */
  stays: ScoredStay[];
  metrics: ShelterMetrics;
  trends: MonthlyPoint[];
  segments: SegmentRow[];
  /** The twelve-month window every dashboard rate is computed over. */
  window: { start: string; end: string };
  /** Stays closed in the last sixty days, for deep links that outlived them. */
  recentlyClosed: RecentlyClosed[];
  /** Rows the model declined to score, with the reason, for transparency. */
  unscored: { reason: string; count: number }[];
  /** Population-level feature importance, shared by every explanation panel.
   *  One copy per view, not one per animal: it is the same list for all of
   *  them, and duplicating it is both misleading and expensive. */
  modelDrivers: { feature: string; gain: number }[];
  definitions: MetricDefinition[];
}

/** The rolling window every rate on the dashboard is computed over. Twelve
 *  months is long enough to smooth a seasonal swing and short enough to still
 *  describe the shelter as it operates now. */
const TREND_WINDOW_DAYS = 365;

/** How far back a closed stay stays addressable by its deep link. */
const RECENTLY_CLOSED_DAYS = 60;

function isoDaysAgo(from: string, days: number): string {
  const base = parseSourceTimestamp(from) ?? Date.parse(from);
  return new Date(base - days * 86_400_000).toISOString().replace("Z", "");
}

function metricWindow(asOf: string): { start: string; end: string } {
  return { start: isoDaysAgo(asOf, TREND_WINDOW_DAYS), end: asOf.replace("Z", "") };
}

function buildMetrics(episodes: Episode[], asOf: string, inCare: number): ShelterMetrics {
  const { start: windowStart, end: windowEnd } = metricWindow(asOf);

  return {
    animalsInCare: { value: inCare, n: inCare, definition: ANIMALS_IN_CARE },
    medianDaysToAdoption: medianDaysToAdoption(episodes, windowStart, windowEnd),
    adoptedWithin30d: adoptedWithinDays(episodes, 30, windowStart, windowEnd, windowEnd),
    observedLongStay: observedLongStayRate(episodes, 60, windowStart, windowEnd),
    outcomes: outcomeMix(episodes, windowStart, windowEnd),
  };
}

async function loadShelterView(): Promise<ShelterView> {
  const [data, model] = await Promise.all([getCurrentShelterData(), loadScoringModel()]);

  if (!data.inventory) {
    const now = austinNowFloating();
    return {
      status: data.status,
      scoringStatus: data.status.scoringStatus,
      stays: [],
      metrics: buildMetrics([], now, 0),
      trends: [],
      segments: [],
      window: metricWindow(now),
      recentlyClosed: [],
      unscored: [],
      modelDrivers: [],
      definitions: [ANIMALS_IN_CARE, MEDIAN_DAYS_TO_ADOPTION, ADOPTED_WITHIN_30D, LONG_STAY_OBSERVED, CURRENT_QUEUE],
    };
  }

  const openIds = new Set(data.inventory.stays.map((stay) => stay.episodeId));
  const openEpisodes = data.episodes.filter((episode) => openIds.has(episode.episodeId));

  const scored = scoreEpisodes(model, data.episodes, openEpisodes);

  const stays: ScoredStay[] = data.inventory.stays.map((stay) => {
    const score = scored.scores.get(stay.episodeId);
    return {
      ...stay,
      pLongStay60d: score?.pLongStay60d ?? null,
      pAdopt30d: score?.pAdopt30d ?? null,
      riskBand: riskBand(score?.pLongStay60d ?? null),
      predictionUnavailableReason: score?.unavailableReason ?? null,
    };
  });

  const asOf = data.inventory.asOf;
  const window = metricWindow(asOf);
  const closedSince = isoDaysAgo(asOf, RECENTLY_CLOSED_DAYS);
  const recentlyClosed: RecentlyClosed[] = data.episodes
    .filter(
      (episode) =>
        episode.joinStatus === "matched" &&
        episode.outcomeAt !== null &&
        episode.outcomeAt >= closedSince,
    )
    .map((episode) => ({
      episodeId: episode.episodeId,
      animalId: episode.animalId,
      name: episode.name,
      outcomeAt: episode.outcomeAt as string,
      outcome: isAdoptionOutcome(episode.outcomeType) ? "Adopted" : (episode.outcomeType ?? "Closed"),
    }));

  return {
    status: data.status,
    scoringStatus: scored.scoringStatus,
    stays,
    metrics: buildMetrics(data.episodes, asOf, data.inventory.stays.length),
    trends: monthlySeries(data.episodes, asOf),
    segments: segmentByLifeStage(
      data.episodes,
      (species, age) => lifeStageFor(species, age),
      window.start,
      window.end,
    ),
    window,
    recentlyClosed,
    unscored: scored.unscored,
    modelDrivers: scored.drivers,
    definitions: [
      ANIMALS_IN_CARE,
      MEDIAN_DAYS_TO_ADOPTION,
      ADOPTED_WITHIN_30D,
      LONG_STAY_OBSERVED,
      CURRENT_QUEUE,
    ],
  };
}

/**
 * The view cache boundary. Reused for `VIEW_CACHE_SECONDS` (thirty minutes)
 * before the feeds are re-read; Austin writes hourly, so the worst case is
 * about ninety minutes behind the publisher and the drawer shows the actual
 * publisher time so nobody has to guess.
 *
 * This wraps the derived view rather than the source rows, and that placement
 * is the whole point. The two current feeds are 6.6MB and 7.4MB of JSON;
 * Next's data cache refuses anything over 2MB, so caching them was a silent
 * no-op that also surfaced as an unhandled rejection in development. Worse,
 * every route then rebuilt seventeen thousand episodes and re-ran the
 * occupancy sweep for itself. The finished view is a few hundred kilobytes,
 * so it caches cleanly and the expensive join and scoring happen once an hour
 * instead of once per page.
 *
 * A failed read is deliberately not cached. `loadShelterView` throws when the
 * feed could not be read, so the rejection never reaches the cache, and the
 * unavailable state is rebuilt below. Otherwise a thirty-second outage at
 * Austin would pin the whole site to "data unavailable" for an hour.
 */
class FeedUnavailableError extends Error {
  readonly view: ShelterView;

  constructor(view: ShelterView) {
    super(view.status.problem ?? "The Austin feed could not be read.");
    this.name = "FeedUnavailableError";
    this.view = view;
  }
}

const loadCachedShelterView = unstable_cache(
  async (): Promise<ShelterView> => {
    const view = await loadShelterView();
    if (!view.status.retrievedAt) throw new FeedUnavailableError(view);
    return view;
  },
  ["shelter-view-v2"],
  { revalidate: VIEW_CACHE_SECONDS, tags: ["austin"] },
);

async function loadShelterViewOrUnavailable(): Promise<ShelterView> {
  try {
    return await loadCachedShelterView();
  } catch (cause) {
    if (cause instanceof FeedUnavailableError) return cause.view;
    // Rebuilt rather than rethrown, so a failure renders the unavailable
    // state instead of a framework error page.
    return loadShelterView();
  }
}

/** Memoised for the duration of one render, on top of the hourly view cache. */
export const getShelterView = cache(loadShelterViewOrUnavailable);

/* -------------------------------------------------------------------------- */
/* Orderings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The queue order.
 *
 * When a validated model is scoring, the queue is ranked by long-stay risk,
 * which is the whole point of the product. When it is not, the queue falls
 * back to longest wait, which is descriptive, obviously true, and still
 * useful. It never fabricates an ordering and calls it a prediction.
 */
export function queueOrder(stays: ScoredStay[], scoringStatus: ScoringStatus): ScoredStay[] {
  const byWait = (list: ScoredStay[]) => list.slice().sort((a, b) => b.daysInCare - a.daysInCare);
  if (scoringStatus !== "live") return byWait(stays);

  return stays.slice().sort((a, b) => {
    const left = a.pLongStay60d;
    const right = b.pLongStay60d;
    // Unscored animals sort last rather than being treated as zero risk.
    if (left === null && right === null) return b.daysInCare - a.daysInCare;
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left;
  });
}

/** Whether the product may say the words "the model estimates". */
export function hasLiveScoring(view: ShelterView): boolean {
  return view.scoringStatus === "live" && view.stays.some((stay) => stay.pLongStay60d !== null);
}

/** The top of the queue, for the dashboard preview. Empty unless scoring is
 *  live, because a "needs attention now" list with no model behind it is just
 *  a list of long waits wearing a prediction's clothes. */
export function needsAttentionNow(view: ShelterView, limit = 5): ScoredStay[] {
  if (!hasLiveScoring(view)) return [];
  return queueOrder(view.stays, view.scoringStatus)
    .filter((stay) => stay.pLongStay60d !== null)
    .slice(0, limit);
}

/**
 * The projection the public grid receives.
 *
 * `ScoredStay` carries `pLongStay60d`, `riskBand` and the unavailable reason.
 * The Discover cards never render any of them, but passing whole stays to a
 * client component serialises every field into the page payload, where anyone
 * can read the model's estimate for a named animal in devtools. The promise
 * that a member of the public is not shown a risk score has to hold in the
 * bytes, not only in the markup, so the public route gets a type that has no
 * field to leak.
 */
export interface PublicStay {
  episodeId: string;
  animalId: string;
  name: string | null;
  species: string;
  breed: string | null;
  intakeAt: string;
  daysInCare: number;
  currentAgeDays: number | null;
  possiblyStale: boolean;
}

export function toPublicStays(stays: readonly ScoredStay[]): PublicStay[] {
  return stays.map((stay) => ({
    episodeId: stay.episodeId,
    animalId: stay.animalId,
    name: stay.name,
    species: stay.species,
    breed: stay.breed,
    intakeAt: stay.intakeAt,
    daysInCare: stay.daysInCare,
    currentAgeDays: stay.currentAgeDays,
    possiblyStale: stay.possiblyStale,
  }));
}

export function findStay(view: ShelterView, id: string): ScoredStay {
  const match =
    view.stays.find((stay) => stay.episodeId === id) ??
    view.stays.find((stay) => stay.animalId === id);
  if (!match) throw new NotFoundError(`No current record for ${id}`);
  return match;
}

/** Why a deep link found nothing, so the page can say something useful. */
export type MissingRecord =
  | { kind: "closed"; record: RecentlyClosed }
  | { kind: "invalid" }
  | { kind: "unknown" };

const EPISODE_ID = /^sb:[^:]+:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const ANIMAL_ID = /^[A-Za-z]?\d{1,10}$/;

export function explainMissing(view: ShelterView, id: string): MissingRecord {
  const closed =
    view.recentlyClosed.find((row) => row.episodeId === id) ??
    view.recentlyClosed
      .filter((row) => row.animalId === id)
      .sort((a, b) => b.outcomeAt.localeCompare(a.outcomeAt))[0];
  if (closed) return { kind: "closed", record: closed };
  if (!EPISODE_ID.test(id) && !ANIMAL_ID.test(id)) return { kind: "invalid" };
  return { kind: "unknown" };
}

/* -------------------------------------------------------------------------- */

export interface InterventionChannel {
  channel: string;
  label: string;
  rationale: string;
  /**
   * "historical": a historical association in Austin data supports the
   * pairing of animal characteristic and channel. It does not measure the
   * effect of the action. "assumed": nothing in the data speaks to it.
   * There is no "measured" value because no intervention evaluation exists.
   */
  evidence: "historical" | "assumed";
  evidence_detail: string;
  staff_minutes: number;
  time_note: string;
}

/** Outreach channels. Each row states whether a historical association in
 *  the Austin data supports it or whether it is an assumption, and the planner
 *  shows that label wherever the channel appears. */
export function getInterventionChannels(): InterventionChannel[] {
  return (interventionsFixture as { channels: InterventionChannel[] }).channels;
}
