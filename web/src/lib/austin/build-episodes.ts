import type {
  DataQualityFlag,
  Episode,
  EpisodeBuildResult,
  OrphanOutcome,
} from "./types";
import {
  daysBetween,
  normalizeSpecies,
  parseSourceTimestamp,
} from "./types";
import type { ShelterBuddyIntakeRow, ShelterBuddyOutcomeRow } from "./schemas";
import { SHELTERBUDDY_CUTOVER } from "./datasets";

/**
 * Builds shelter episodes from the current ShelterBuddy feeds.
 *
 * The join here is exact, not heuristic, and that is worth stating plainly
 * because the previous version of this product got it wrong. Every outcome row
 * in `gsvs-ypi7` carries an `intake_date`, and it matches the `source_date` of
 * the intake row it closes, for the same `animal_id`. So an episode is closed
 * by looking up one key, not by guessing at the nearest timestamp.
 *
 * That also settles the repeat-visitor problem that broke the old fixture. An
 * animal with three intakes has three episodes; the outcome names which stay
 * it ends, so an outcome can never close the wrong one and can never close two.
 *
 * `(animal_id, source_date)` was verified unique across all 16,989 intake rows,
 * so it is safe as a primary key. Duplicates are still counted rather than
 * assumed away, because "verified today" is not "guaranteed forever".
 */

const MS_PER_HOUR = 3_600_000;

/**
 * How far back a tolerance match may reach when an outcome names an intake
 * time that does not exist exactly.
 *
 * Kept deliberately tight. Only 11 animals in the current feed have both an
 * unmatched intake and an unmatched outcome, so this path is a rounding
 * correction, not a load-bearing part of the join. Anything it matches is
 * marked low confidence and excluded from operational counts.
 */
const TOLERANCE_HOURS = 36;

function intakeKey(animalId: string, intakeAt: string): string {
  return `${animalId}|${intakeAt}`;
}

export function shelterBuddyEpisodeId(animalId: string, intakeAt: string): string {
  return `sb:${animalId}:${intakeAt}`;
}

function ageInDays(dateOfBirth: string | null, intakeAt: string): number | null {
  if (!dateOfBirth) return null;
  const days = daysBetween(dateOfBirth, intakeAt);
  if (days === null) return null;
  // A negative age means the birth date is after the intake, which is a source
  // error rather than a newborn. Report it as unknown instead of as a number.
  return days < 0 ? null : Math.floor(days);
}

/** Roughly 40 years. Beyond this the date of birth is a data-entry artefact. */
const IMPLAUSIBLE_AGE_DAYS = 14_600;

interface WorkingOutcome {
  row: ShelterBuddyOutcomeRow;
  claimedIntakeAt: string | null;
  used: boolean;
}

export function buildShelterBuddyEpisodes(
  intakeRows: ShelterBuddyIntakeRow[],
  outcomeRows: ShelterBuddyOutcomeRow[],
  options: { asOf?: string; rejectedIntakeRows?: number; rejectedOutcomeRows?: number } = {},
): EpisodeBuildResult {
  const asOf = options.asOf ?? new Date().toISOString();

  /* ---- index the outcomes by the stay they claim to close ---------------- */

  const outcomesByIntakeKey = new Map<string, WorkingOutcome[]>();
  const outcomesByAnimal = new Map<string, WorkingOutcome[]>();

  for (const row of outcomeRows) {
    const working: WorkingOutcome = {
      row,
      claimedIntakeAt: row.intake_date ?? null,
      used: false,
    };

    if (working.claimedIntakeAt) {
      const key = intakeKey(row.animal_id, working.claimedIntakeAt);
      const bucket = outcomesByIntakeKey.get(key);
      if (bucket) bucket.push(working);
      else outcomesByIntakeKey.set(key, [working]);
    }

    const byAnimal = outcomesByAnimal.get(row.animal_id);
    if (byAnimal) byAnimal.push(working);
    else outcomesByAnimal.set(row.animal_id, [working]);
  }

  /* ---- walk the intakes, oldest first ------------------------------------ */

  const seenIntakeKeys = new Set<string>();
  const episodes: Episode[] = [];
  let duplicateIntakeKeys = 0;
  let toleranceMatched = 0;

  const orderedIntakes = intakeRows
    .slice()
    .sort((a, b) => (parseSourceTimestamp(a.source_date) ?? 0) - (parseSourceTimestamp(b.source_date) ?? 0));

  for (const row of orderedIntakes) {
    const key = intakeKey(row.animal_id, row.source_date);
    if (seenIntakeKeys.has(key)) {
      // Two intake rows for the same animal at the same instant. The feed has
      // none today; if one appears it is counted and the duplicate skipped
      // rather than allowed to produce two competing episodes.
      duplicateIntakeKeys += 1;
      continue;
    }
    seenIntakeKeys.add(key);

    const flags: DataQualityFlag[] = [];
    const species = normalizeSpecies(row.type);
    if (!row.type) flags.push("missing_species");

    const dateOfBirth = row.date_of_birth ?? null;
    if (!dateOfBirth) flags.push("missing_date_of_birth");

    const ageAtIntakeDays = ageInDays(dateOfBirth, row.source_date);
    if (ageAtIntakeDays !== null && ageAtIntakeDays > IMPLAUSIBLE_AGE_DAYS) {
      flags.push("implausible_age");
    }

    /* -- exact match first ------------------------------------------------ */

    let match: WorkingOutcome | undefined = outcomesByIntakeKey
      .get(key)
      ?.find((candidate) => !candidate.used);

    let joinConfidence: Episode["joinConfidence"] = "high";

    /* -- then a bounded tolerance match ----------------------------------- */

    if (!match) {
      const intakeMs = parseSourceTimestamp(row.source_date);
      if (intakeMs !== null) {
        const candidates = (outcomesByAnimal.get(row.animal_id) ?? []).filter((candidate) => {
          if (candidate.used) return false;
          const outcomeMs = parseSourceTimestamp(candidate.row.outcome_date);
          if (outcomeMs === null || outcomeMs < intakeMs) return false;
          // The outcome must name an intake time close to this one, or name
          // none at all. It must never be attached just because it is nearby.
          if (!candidate.claimedIntakeAt) return false;
          const claimedMs = parseSourceTimestamp(candidate.claimedIntakeAt);
          if (claimedMs === null) return false;
          return Math.abs(claimedMs - intakeMs) <= TOLERANCE_HOURS * MS_PER_HOUR;
        });

        candidates.sort(
          (a, b) =>
            (parseSourceTimestamp(a.row.outcome_date) ?? 0) -
            (parseSourceTimestamp(b.row.outcome_date) ?? 0),
        );

        if (candidates.length > 0) {
          match = candidates[0];
          joinConfidence = "low";
          toleranceMatched += 1;
          flags.push("tolerance_matched");
        }
      }
    }

    if (match) match.used = true;

    /* -- assemble --------------------------------------------------------- */

    const outcomeAt = match?.row.outcome_date ?? null;
    let closedDaysInCare: number | null = null;

    if (outcomeAt) {
      const duration = daysBetween(row.source_date, outcomeAt);
      if (duration === null) {
        closedDaysInCare = null;
      } else if (duration < 0) {
        // An outcome before its own intake cannot be trusted to close it.
        flags.push("outcome_before_intake");
        flags.push("negative_duration");
        closedDaysInCare = null;
      } else {
        closedDaysInCare = duration;
      }
    }

    const outcomeSpecies = match ? normalizeSpecies(match.row.type) : species;
    if (match && outcomeSpecies !== species) flags.push("species_changed_between_events");

    const reported = match?.row.days_in_shelter;
    const reportedDaysInShelter = reported === undefined ? null : Number(reported);

    const isOpen = match === undefined;
    if (isOpen && parseSourceTimestamp(row.source_date) !== null) {
      const waiting = daysBetween(row.source_date, asOf);
      // An episode still open a year later is more likely a record Austin
      // never closed than an animal still waiting. Flagged, not deleted.
      if (waiting !== null && waiting > 365) flags.push("stale_open_episode");
    }

    episodes.push({
      episodeId: shelterBuddyEpisodeId(row.animal_id, row.source_date),
      sourceSystem: "shelterbuddy",
      sourceEventId: row.id,
      animalId: row.animal_id,
      intakeAt: row.source_date,
      species,
      rawType: row.type ?? null,
      name: row.name_at_intake ?? match?.row.name ?? null,
      sex: row.sex ?? null,
      alteredAtIntake: row.ispreviouslyspayedneutered ?? null,
      breed: row.primary_breed ?? null,
      color: [row.primary_color, row.secondary_color].filter(Boolean).join("/") || null,
      intakeReason: row.source_name ?? null,
      condition: row.intake_health_condition ?? null,
      dateOfBirth,
      ageAtIntakeDays,
      outcomeAt,
      outcomeType: match?.row.outcome_status ?? null,
      closedDaysInCare,
      reportedDaysInShelter: Number.isFinite(reportedDaysInShelter) ? reportedDaysInShelter : null,
      sourceUpdatedAt: row.timestamp ?? null,
      joinStatus: isOpen ? "open" : joinConfidence === "low" ? "ambiguous" : "matched",
      joinConfidence,
      dataQualityFlags: flags,
    });
  }

  /* ---- whatever is left over --------------------------------------------- */

  const cutoverMs = parseSourceTimestamp(`${SHELTERBUDDY_CUTOVER}T00:00:00`);
  const orphanOutcomes: OrphanOutcome[] = [];

  for (const bucket of outcomesByAnimal.values()) {
    for (const candidate of bucket) {
      if (candidate.used) continue;

      // The large majority of these are animals admitted under the old system
      // and released under the new one. Their intake row lives in the frozen
      // archive under a different id namespace and can never be joined here.
      const claimedMs = parseSourceTimestamp(candidate.claimedIntakeAt);
      const preCutover = claimedMs !== null && cutoverMs !== null && claimedMs < cutoverMs;

      orphanOutcomes.push({
        sourceEventId: candidate.row.id,
        animalId: candidate.row.animal_id,
        outcomeAt: candidate.row.outcome_date,
        outcomeType: candidate.row.outcome_status ?? null,
        claimedIntakeAt: candidate.claimedIntakeAt,
        reason: preCutover ? "pre_cutover_intake" : "no_matching_intake",
      });
    }
  }

  const matched = episodes.filter((e) => e.joinStatus === "matched").length;
  const open = episodes.filter((e) => e.joinStatus === "open").length;
  const ambiguous = episodes.filter((e) => e.joinStatus === "ambiguous").length;

  return {
    episodes,
    orphanOutcomes,
    counts: {
      intakeRows: intakeRows.length,
      outcomeRows: outcomeRows.length,
      episodes: episodes.length,
      matched,
      open,
      ambiguous,
      // An intake that is still open is not orphaned; it is in progress. Only
      // an intake that can never be closed would be, and this feed has none.
      orphanedIntakes: 0,
      orphanedOutcomes: orphanOutcomes.length,
      duplicateIntakeKeys,
      toleranceMatched,
      rejectedIntakeRows: options.rejectedIntakeRows ?? 0,
      rejectedOutcomeRows: options.rejectedOutcomeRows ?? 0,
    },
  };
}

/**
 * The episodes that were genuinely open at a chosen moment.
 *
 * The rule the old fixture broke: an episode is active at a moment only when
 * it started on or before that moment and has no outcome on or before it.
 * Checking only "has no outcome recorded now" is what put three already-adopted
 * animals on the front page as though they were still waiting.
 *
 * Ambiguous joins are excluded. If the join is not confident, the animal does
 * not belong in an operational count.
 */
export function openEpisodesAt(episodes: Episode[], asOf: string): Episode[] {
  const asOfMs = parseSourceTimestamp(asOf) ?? Date.parse(asOf);
  if (Number.isNaN(asOfMs)) return [];

  return episodes.filter((episode) => {
    if (episode.joinStatus === "ambiguous") return false;

    const intakeMs = parseSourceTimestamp(episode.intakeAt);
    if (intakeMs === null || intakeMs > asOfMs) return false;

    if (episode.outcomeAt) {
      const outcomeMs = parseSourceTimestamp(episode.outcomeAt);
      if (outcomeMs !== null && outcomeMs <= asOfMs) return false;
    }

    return true;
  });
}
