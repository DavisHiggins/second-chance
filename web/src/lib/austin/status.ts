import type { DataQualityCounts } from "./current-inventory";
import { ARCHIVE_INTAKES, ARCHIVE_OUTCOMES, CURRENT_INTAKES, CURRENT_OUTCOMES } from "./datasets";
import { AUSTIN_TIME_ZONE, hoursSinceUtc, toUtcMs } from "./time";

/**
 * The one status object the header and the data-details drawer both read.
 *
 * The previous build had a boolean called `usingFallback` that was hardcoded
 * to true, so the site permanently announced sample data while presenting a
 * three-year-old fixture as the current shelter. The replacement is an
 * explicit mode with no silent state: there is no value of this type that
 * describes stale or synthetic data as live.
 *
 * Five different clocks are involved and the drawer names each one:
 *
 * - `publisherUpdatedAt`  when Austin says it last wrote the dataset
 *                         (`rowsUpdatedAt` from the portal metadata; UTC)
 * - `intakesUpdatedAt` /  the newest row-level `timestamp` in each feed
 *   `outcomesUpdatedAt`   (floating, Austin wall clock)
 * - `latestEventAt`       the newest intake or outcome event in the rows
 * - `retrievedAt`         when this site last fetched the feeds (UTC)
 * - `snapshotAt`          the moment the open-stay roster was computed (UTC)
 *
 * A fresh request does not create a fresh publication: `retrievedAt` may be
 * seconds old while the publisher timestamp is an hour old, and only the
 * latter says how current the data is.
 */

export type DataMode = "live" | "delayed" | "unavailable" | "historical_demo";

/** Whether a validated model is actually producing the scores on screen. */
export type ScoringStatus = "live" | "in_progress" | "unavailable";

export interface SourceDataset {
  id: string;
  label: string;
  href: string;
  role: "current" | "archive";
  rowsRetrieved: number | null;
  /** Newest row-level `timestamp`, floating Austin time. */
  latestSourceTimestamp: string | null;
  /** The portal's `rowsUpdatedAt`, UTC ISO, when the metadata call succeeded. */
  publisherUpdatedAt: string | null;
}

export interface DataStatus {
  mode: DataMode;
  /** Newest row-level timestamp per feed. Floating Austin wall-clock time. */
  intakesUpdatedAt: string | null;
  outcomesUpdatedAt: string | null;
  /** Newest intake or outcome event across both feeds. Floating Austin time. */
  latestEventAt: string | null;
  /** Earliest of the two feeds' portal `rowsUpdatedAt`, UTC ISO. */
  publisherUpdatedAt: string | null;
  /** When this site last read the feeds successfully. UTC ISO. */
  retrievedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  /** When the open-stay roster was computed. UTC ISO. */
  snapshotAt: string | null;
  /** Hours between the publisher's last write and the retrieval. */
  publisherAgeHours: number | null;
  sourceTimeZone: string;
  /** How long a computed snapshot is reused before the feeds are re-read. */
  cacheIntervalSeconds: number;
  sourceDatasetIds: string[];
  sources: SourceDataset[];

  currentEpisodeCount: number;
  ambiguousEpisodeCount: number;
  orphanedIntakeCount: number;
  orphanedOutcomeCount: number;

  modelVersion: string | null;
  modelTrainedAt: string | null;
  scoringStatus: ScoringStatus;
  /** Why scoring is not live, when it is not. Rendered to the user verbatim. */
  scoringNote: string | null;

  /** Present when mode is delayed or unavailable. Plain language, no stack. */
  problem: string | null;
}

/**
 * Austin says the current feeds refresh hourly. Three hours allows for a
 * missed refresh or two without crying wolf; beyond that the data is stale
 * enough that a user planning their day should be told.
 */
export const FRESH_WINDOW_HOURS = 3;

/**
 * How long the derived view is cached before the feeds are re-read. Austin
 * writes on the hour; a thirty-minute reuse bounds the worst case at about an
 * hour and a half behind the publisher, and halves the load compared with
 * reading on every request. This is the implemented cadence and is what the
 * About and How-it-works pages state.
 */
export const VIEW_CACHE_SECONDS = 1800;

export interface StatusInput {
  intakesUpdatedAt: string | null;
  outcomesUpdatedAt: string | null;
  latestEventAt?: string | null;
  intakesPublisherUpdatedAt?: string | null;
  outcomesPublisherUpdatedAt?: string | null;
  retrievedAt: string | null;
  snapshotAt?: string | null;
  intakeRowsRetrieved: number | null;
  outcomeRowsRetrieved: number | null;
  quality: DataQualityCounts | null;
  model: {
    version: string | null;
    trainedAt: string | null;
    scoringStatus: ScoringStatus;
    note: string | null;
  };
  /** Set when a feed could not be fetched at all. */
  failure?: string | null;
}

function earliest(a: string | null | undefined, b: string | null | undefined): string | null {
  const left = toUtcMs(a);
  const right = toUtcMs(b);
  if (left === null) return b ?? null;
  if (right === null) return a ?? null;
  return left <= right ? (a as string) : (b as string);
}

export function buildDataStatus(input: StatusInput, now: number = Date.now()): DataStatus {
  const sources: SourceDataset[] = [
    {
      id: CURRENT_INTAKES.id,
      label: CURRENT_INTAKES.label,
      href: CURRENT_INTAKES.href,
      role: "current",
      rowsRetrieved: input.intakeRowsRetrieved,
      latestSourceTimestamp: input.intakesUpdatedAt,
      publisherUpdatedAt: input.intakesPublisherUpdatedAt ?? null,
    },
    {
      id: CURRENT_OUTCOMES.id,
      label: CURRENT_OUTCOMES.label,
      href: CURRENT_OUTCOMES.href,
      role: "current",
      rowsRetrieved: input.outcomeRowsRetrieved,
      latestSourceTimestamp: input.outcomesUpdatedAt,
      publisherUpdatedAt: input.outcomesPublisherUpdatedAt ?? null,
    },
    {
      id: ARCHIVE_INTAKES.id,
      label: ARCHIVE_INTAKES.label,
      href: ARCHIVE_INTAKES.href,
      role: "archive",
      rowsRetrieved: null,
      latestSourceTimestamp: null,
      publisherUpdatedAt: null,
    },
    {
      id: ARCHIVE_OUTCOMES.id,
      label: ARCHIVE_OUTCOMES.label,
      href: ARCHIVE_OUTCOMES.href,
      role: "archive",
      rowsRetrieved: null,
      latestSourceTimestamp: null,
      publisherUpdatedAt: null,
    },
  ];

  const publisherUpdatedAt = earliest(
    input.intakesPublisherUpdatedAt,
    input.outcomesPublisherUpdatedAt,
  );

  // Publisher time when the portal reported it; otherwise the newest row
  // stamp, converted through Austin's zone. Never the raw floating string
  // against the UTC clock, which is the bug this replaces.
  const intakeMs = toUtcMs(input.intakesPublisherUpdatedAt) ?? toUtcMs(input.intakesUpdatedAt);
  const outcomeMs = toUtcMs(input.outcomesPublisherUpdatedAt) ?? toUtcMs(input.outcomesUpdatedAt);
  const referenceNow = toUtcMs(input.retrievedAt) ?? now;

  const intakeAge = hoursSinceUtc(intakeMs, referenceNow);
  const outcomeAge = hoursSinceUtc(outcomeMs, referenceNow);
  const worstAge = Math.max(
    intakeAge ?? Number.POSITIVE_INFINITY,
    outcomeAge ?? Number.POSITIVE_INFINITY,
  );

  const base = {
    intakesUpdatedAt: input.intakesUpdatedAt,
    outcomesUpdatedAt: input.outcomesUpdatedAt,
    latestEventAt: input.latestEventAt ?? null,
    publisherUpdatedAt,
    retrievedAt: input.retrievedAt,
    lastSuccessfulSyncAt: input.retrievedAt,
    snapshotAt: input.snapshotAt ?? input.retrievedAt,
    publisherAgeHours: Number.isFinite(worstAge) ? worstAge : null,
    sourceTimeZone: AUSTIN_TIME_ZONE,
    cacheIntervalSeconds: VIEW_CACHE_SECONDS,
    sourceDatasetIds: sources.map((s) => s.id),
    sources,
    currentEpisodeCount: input.quality?.companionEpisodeCount ?? 0,
    ambiguousEpisodeCount: input.quality?.ambiguousEpisodeCount ?? 0,
    orphanedIntakeCount: input.quality?.orphanedIntakeCount ?? 0,
    orphanedOutcomeCount: input.quality?.orphanedOutcomeCount ?? 0,
    modelVersion: input.model.version,
    modelTrainedAt: input.model.trainedAt,
    scoringStatus: input.model.scoringStatus,
    scoringNote: input.model.note,
  };

  // Nothing was retrieved. There is no fixture to fall back to and none will
  // be introduced: the honest answer is that the data is not available.
  if (input.failure || !input.retrievedAt || !input.quality) {
    return {
      ...base,
      mode: "unavailable",
      problem:
        input.failure ??
        "The City of Austin open data feed did not respond, so current shelter records could not be loaded.",
    };
  }

  if (!Number.isFinite(worstAge)) {
    return {
      ...base,
      mode: "delayed",
      problem: "The feed responded but did not report when it was last updated.",
    };
  }

  if (worstAge > FRESH_WINDOW_HOURS) {
    const rounded = Math.round(worstAge);
    return {
      ...base,
      mode: "delayed",
      problem: `Austin last published an update about ${rounded} hours before this snapshot was taken. These feeds normally refresh every hour.`,
    };
  }

  return { ...base, mode: "live", problem: null };
}

/** A status for the archive-only views, which are genuinely historical and
 *  must never borrow the live label. */
export function historicalStatus(dataAsOf: string, note: string): DataStatus {
  const status = buildDataStatus({
    intakesUpdatedAt: dataAsOf,
    outcomesUpdatedAt: dataAsOf,
    retrievedAt: null,
    intakeRowsRetrieved: null,
    outcomeRowsRetrieved: null,
    quality: null,
    model: { version: null, trainedAt: null, scoringStatus: "unavailable", note },
  });

  return { ...status, mode: "historical_demo", problem: null };
}

/** The most trustworthy "data as of" instant, as a UTC ISO string. */
export function dataAsOf(status: DataStatus): string | null {
  return status.publisherUpdatedAt ?? status.retrievedAt;
}

/** The header sentence for each mode. Kept next to the enum so a new mode
 *  cannot be added without deciding what the user is told. */
export function statusHeadline(status: DataStatus, formatTime: (iso: string) => string): string {
  switch (status.mode) {
    case "live": {
      const at = dataAsOf(status);
      return at ? `Live Austin feed · published ${formatTime(at)}` : "Live Austin feed";
    }
    case "delayed": {
      const at = dataAsOf(status);
      return at ? `Austin feed delayed · last published ${formatTime(at)}` : "Austin feed delayed";
    }
    case "historical_demo": {
      const at = status.intakesUpdatedAt;
      return at ? `Historical demonstration · data from ${formatTime(at)}` : "Historical demonstration";
    }
    case "unavailable":
    default:
      return "Live data unavailable";
  }
}

/** Tone for the status chip, reusing the existing status colour roles. */
export function statusTone(mode: DataMode): "good" | "warning" | "serious" | "critical" {
  switch (mode) {
    case "live":
      return "good";
    case "delayed":
      return "warning";
    case "historical_demo":
      return "serious";
    case "unavailable":
    default:
      return "critical";
  }
}
