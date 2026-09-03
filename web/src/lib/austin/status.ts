import type { DataQualityCounts } from "./current-inventory";
import { parseSourceTimestamp } from "./types";
import { ARCHIVE_INTAKES, ARCHIVE_OUTCOMES, CURRENT_INTAKES, CURRENT_OUTCOMES } from "./datasets";

/**
 * The one status object the header and the data-details drawer both read.
 *
 * The previous build had a boolean called `usingFallback` that was hardcoded
 * to true, so the site permanently announced sample data while presenting a
 * three-year-old fixture as the current shelter. The replacement is an
 * explicit mode with no silent state: there is no value of this type that
 * describes stale or synthetic data as live.
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
  latestSourceTimestamp: string | null;
}

export interface DataStatus {
  mode: DataMode;
  intakesUpdatedAt: string | null;
  outcomesUpdatedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  retrievedAt: string | null;
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
const FRESH_WINDOW_HOURS = 3;

function hoursSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const parsed = parseSourceTimestamp(iso) ?? Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return (now - parsed) / 3_600_000;
}

export interface StatusInput {
  intakesUpdatedAt: string | null;
  outcomesUpdatedAt: string | null;
  retrievedAt: string | null;
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

export function buildDataStatus(input: StatusInput, now: number = Date.now()): DataStatus {
  const sources: SourceDataset[] = [
    {
      id: CURRENT_INTAKES.id,
      label: CURRENT_INTAKES.label,
      href: CURRENT_INTAKES.href,
      role: "current",
      rowsRetrieved: input.intakeRowsRetrieved,
      latestSourceTimestamp: input.intakesUpdatedAt,
    },
    {
      id: CURRENT_OUTCOMES.id,
      label: CURRENT_OUTCOMES.label,
      href: CURRENT_OUTCOMES.href,
      role: "current",
      rowsRetrieved: input.outcomeRowsRetrieved,
      latestSourceTimestamp: input.outcomesUpdatedAt,
    },
    {
      id: ARCHIVE_INTAKES.id,
      label: ARCHIVE_INTAKES.label,
      href: ARCHIVE_INTAKES.href,
      role: "archive",
      rowsRetrieved: null,
      latestSourceTimestamp: null,
    },
    {
      id: ARCHIVE_OUTCOMES.id,
      label: ARCHIVE_OUTCOMES.label,
      href: ARCHIVE_OUTCOMES.href,
      role: "archive",
      rowsRetrieved: null,
      latestSourceTimestamp: null,
    },
  ];

  const base = {
    intakesUpdatedAt: input.intakesUpdatedAt,
    outcomesUpdatedAt: input.outcomesUpdatedAt,
    retrievedAt: input.retrievedAt,
    lastSuccessfulSyncAt: input.retrievedAt,
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

  const intakeAge = hoursSince(input.intakesUpdatedAt, now);
  const outcomeAge = hoursSince(input.outcomesUpdatedAt, now);
  const worstAge = Math.max(intakeAge ?? Number.POSITIVE_INFINITY, outcomeAge ?? Number.POSITIVE_INFINITY);

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
      problem: `Austin last published an update ${rounded} hours ago. These feeds normally refresh every hour.`,
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

/** The header sentence for each mode. Kept next to the enum so a new mode
 *  cannot be added without deciding what the user is told. */
export function statusHeadline(status: DataStatus, formatTime: (iso: string) => string): string {
  switch (status.mode) {
    case "live": {
      const at = status.intakesUpdatedAt ?? status.retrievedAt;
      return at ? `Live Austin feed · updated ${formatTime(at)}` : "Live Austin feed";
    }
    case "delayed": {
      const at = status.lastSuccessfulSyncAt ?? status.intakesUpdatedAt;
      return at ? `Austin feed delayed · last update ${formatTime(at)}` : "Austin feed delayed";
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
