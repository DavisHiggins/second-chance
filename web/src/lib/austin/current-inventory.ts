import type { DataQualityFlag, Episode, EpisodeBuildResult, Species } from "./types";
import { daysInCareAt, isCompanionSpecies, parseSourceTimestamp } from "./types";
import { openEpisodesAt } from "./build-episodes";

/**
 * The current shelter roster, derived from open episodes.
 *
 * Two labels are deliberately kept apart here, because conflating them is the
 * thing the handoff is most emphatic about. An open intake record means the
 * shelter took an animal in and has not published an outcome. It does not mean
 * the animal is available for adoption. Austin publishes no adoptable-listing
 * dataset at all, so nothing in this module may claim adoptability, and the
 * type below has no field that could be mistaken for it.
 */

/** A single animal currently on the roster, ready to render. Contains no
 *  address, no found location, and no invented prediction. */
export interface CurrentStay {
  episodeId: string;
  animalId: string;
  name: string | null;
  species: Species;
  rawType: string | null;
  breed: string | null;
  color: string | null;
  sex: string | null;
  alteredAtIntake: boolean | null;
  intakeReason: string | null;
  condition: string | null;
  intakeAt: string;
  daysInCare: number;
  ageAtIntakeDays: number | null;
  /** Age now, derived from age at intake plus the wait. Null when unknown. */
  currentAgeDays: number | null;
  lifeStage: LifeStage;
  dataQualityFlags: DataQualityFlag[];
  /** True when the intake is old enough that the record may simply never have
   *  been closed. Shown to the user rather than silently trusted. */
  possiblyStale: boolean;
}

export type LifeStage = "juvenile" | "adult" | "senior" | "unknown";

/**
 * Life stage from age in days. The cut points differ by species because a
 * seven-year-old cat is middle-aged and a seven-year-old great dane is not,
 * but the feed does not carry weight or size, so one canine cut point is the
 * honest limit of what this data supports.
 */
export function lifeStageFor(species: Species, ageDays: number | null): LifeStage {
  if (ageDays === null) return "unknown";
  if (species === "Cat") {
    if (ageDays < 365) return "juvenile";
    return ageDays >= 3650 ? "senior" : "adult";
  }
  if (species === "Dog") {
    if (ageDays < 365) return "juvenile";
    return ageDays >= 2920 ? "senior" : "adult";
  }
  return "unknown";
}

/** Past this, an open record is more likely unclosed than genuinely waiting. */
const STALE_OPEN_DAYS = 365;

export interface DataQualityCounts {
  currentEpisodeCount: number;
  companionEpisodeCount: number;
  nonCompanionEpisodeCount: number;
  ambiguousEpisodeCount: number;
  orphanedIntakeCount: number;
  orphanedOutcomeCount: number;
  preCutoverOutcomeCount: number;
  duplicateIntakeKeyCount: number;
  toleranceMatchedCount: number;
  staleOpenEpisodeCount: number;
  rejectedRowCount: number;
  totalIntakeRows: number;
  totalOutcomeRows: number;
}

export interface CurrentInventory {
  asOf: string;
  /** Companion animals only. This is the number the product reports. */
  stays: CurrentStay[];
  /** Open non-companion episodes, kept for data-quality transparency only. */
  nonCompanionOpen: number;
  quality: DataQualityCounts;
  speciesBreakdown: Record<string, number>;
}

function toCurrentStay(episode: Episode, asOf: string): CurrentStay {
  const daysInCare = daysInCareAt(episode.intakeAt, asOf) ?? 0;
  const currentAgeDays =
    episode.ageAtIntakeDays === null ? null : episode.ageAtIntakeDays + daysInCare;

  return {
    episodeId: episode.episodeId,
    animalId: episode.animalId,
    name: episode.name,
    species: episode.species,
    rawType: episode.rawType,
    breed: episode.breed,
    color: episode.color,
    sex: episode.sex,
    alteredAtIntake: episode.alteredAtIntake,
    intakeReason: episode.intakeReason,
    condition: episode.condition,
    intakeAt: episode.intakeAt,
    daysInCare,
    ageAtIntakeDays: episode.ageAtIntakeDays,
    currentAgeDays,
    lifeStage: lifeStageFor(episode.species, currentAgeDays),
    dataQualityFlags: episode.dataQualityFlags,
    possiblyStale: daysInCare > STALE_OPEN_DAYS,
  };
}

/**
 * Builds the current roster from a completed episode build.
 *
 * `asOf` is explicit rather than implicit so a historical snapshot can be
 * asked for and tested. The regression cases in the handoff depend on being
 * able to ask "who was actually here on 4 March 2022" and get an answer that
 * excludes the animals who had already gone home.
 */
export function buildCurrentInventory(
  build: EpisodeBuildResult,
  asOf: string = new Date().toISOString(),
): CurrentInventory {
  const open = openEpisodesAt(build.episodes, asOf);

  const companion = open.filter((episode) => isCompanionSpecies(episode.species));
  const nonCompanion = open.length - companion.length;

  const stays = companion
    .map((episode) => toCurrentStay(episode, asOf))
    .sort((a, b) => b.daysInCare - a.daysInCare);

  const speciesBreakdown: Record<string, number> = {};
  for (const episode of open) {
    const key = episode.rawType ?? "Unknown";
    speciesBreakdown[key] = (speciesBreakdown[key] ?? 0) + 1;
  }

  const preCutoverOutcomeCount = build.orphanOutcomes.filter(
    (o) => o.reason === "pre_cutover_intake",
  ).length;

  return {
    asOf,
    stays,
    nonCompanionOpen: nonCompanion,
    speciesBreakdown,
    quality: {
      currentEpisodeCount: open.length,
      companionEpisodeCount: companion.length,
      nonCompanionEpisodeCount: nonCompanion,
      ambiguousEpisodeCount: build.counts.ambiguous,
      orphanedIntakeCount: build.counts.orphanedIntakes,
      orphanedOutcomeCount: build.counts.orphanedOutcomes,
      preCutoverOutcomeCount,
      duplicateIntakeKeyCount: build.counts.duplicateIntakeKeys,
      toleranceMatchedCount: build.counts.toleranceMatched,
      staleOpenEpisodeCount: stays.filter((s) => s.possiblyStale).length,
      rejectedRowCount: build.counts.rejectedIntakeRows + build.counts.rejectedOutcomeRows,
      totalIntakeRows: build.counts.intakeRows,
      totalOutcomeRows: build.counts.outcomeRows,
    },
  };
}

/** Longest-waiting first. The descriptive ordering used whenever model scores
 *  are unavailable, so the queue is still useful without predictions. */
export function byLongestWait(stays: CurrentStay[]): CurrentStay[] {
  return stays.slice().sort((a, b) => b.daysInCare - a.daysInCare);
}

/** Guards against an as-of time in the future, which would silently include
 *  animals who have not arrived and inflate every count. */
export function clampAsOf(requested: string | undefined, latestSource: string | null): string {
  const now = Date.now();
  const requestedMs = requested ? (parseSourceTimestamp(requested) ?? Date.parse(requested)) : now;
  const latestMs = latestSource ? parseSourceTimestamp(latestSource) : null;
  const ceiling = latestMs !== null ? Math.min(now, latestMs) : now;
  const chosen = Number.isNaN(requestedMs) ? ceiling : Math.min(requestedMs, ceiling);
  return new Date(chosen).toISOString();
}
