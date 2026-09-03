/**
 * The canonical shelter-episode model.
 *
 * Austin publishes two incompatible schemas either side of the May 2025
 * ShelterBuddy cutover. Rather than teach every view about both, each source
 * gets an adapter that produces this one shape. Raw source values are kept
 * alongside the normalized ones (`rawType` next to `species`) so a mapping
 * decision stays auditable instead of disappearing into the adapter.
 *
 * An episode is one stay: an arrival, and the departure that closed it if
 * there was one. It is not an animal. An animal that comes back three times
 * has three episodes, which is why nothing here is keyed on animal id alone.
 */

export type SourceSystem = "legacy_archive" | "shelterbuddy";

/** Normalized species. Everything that is not a cat or a dog is "other": the
 *  current feed carries bats, goats and reptiles, and they are not adoption
 *  candidates even though they are genuine intakes. */
export type Species = "Dog" | "Cat" | "Other";

export type JoinStatus =
  | "matched"
  | "open"
  | "ambiguous"
  | "orphaned_intake"
  | "orphaned_outcome";

export type JoinConfidence = "high" | "low";

/**
 * Explicit anomalies found while building an episode. These are counted and
 * surfaced in the data-details drawer rather than quietly cleaned away.
 */
export type DataQualityFlag =
  | "missing_species"
  | "missing_date_of_birth"
  | "negative_duration"
  | "outcome_before_intake"
  | "tolerance_matched"
  | "pre_cutover_intake"
  | "species_changed_between_events"
  | "implausible_age"
  | "stale_open_episode"
  | "duplicate_intake_key";

export interface Episode {
  /** Stable across refreshes. Composed from source system, animal and intake
   *  time, which is unique in both feeds. Never the animal id alone. */
  episodeId: string;
  sourceSystem: SourceSystem;
  /** The source row id that opened the episode. */
  sourceEventId: string;

  animalId: string;
  intakeAt: string;
  species: Species;
  /** The source value before normalization: "Kitten", "Bat - Little Brown Myotis". */
  rawType: string | null;

  name: string | null;
  sex: string | null;
  alteredAtIntake: boolean | null;
  breed: string | null;
  color: string | null;
  intakeReason: string | null;
  condition: string | null;

  dateOfBirth: string | null;
  ageAtIntakeDays: number | null;

  outcomeAt: string | null;
  outcomeType: string | null;
  /** Days between intake and outcome for a closed episode. Null while open. */
  closedDaysInCare: number | null;
  /** The value the source reported, kept so the derived one can be validated. */
  reportedDaysInShelter: number | null;

  sourceUpdatedAt: string | null;
  joinStatus: JoinStatus;
  joinConfidence: JoinConfidence;
  dataQualityFlags: DataQualityFlag[];
}

/** An outcome that could not be attached to any intake. Counted, never dropped. */
export interface OrphanOutcome {
  sourceEventId: string;
  animalId: string;
  outcomeAt: string;
  outcomeType: string | null;
  claimedIntakeAt: string | null;
  reason: "pre_cutover_intake" | "no_matching_intake";
}

export interface EpisodeBuildResult {
  episodes: Episode[];
  orphanOutcomes: OrphanOutcome[];
  counts: {
    intakeRows: number;
    outcomeRows: number;
    episodes: number;
    matched: number;
    open: number;
    ambiguous: number;
    orphanedIntakes: number;
    orphanedOutcomes: number;
    /** Intakes sharing an (animal, timestamp) key. Zero in the current feed. */
    duplicateIntakeKeys: number;
    toleranceMatched: number;
    rejectedIntakeRows: number;
    rejectedOutcomeRows: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Species and outcome vocabulary                                             */
/* -------------------------------------------------------------------------- */

/**
 * ShelterBuddy splits juveniles into their own type. A kitten is a cat and a
 * puppy is a dog; keeping them separate would silently halve every cat metric.
 */
const SPECIES_BY_RAW_TYPE: Record<string, Species> = {
  cat: "Cat",
  kitten: "Cat",
  dog: "Dog",
  puppy: "Dog",
};

export function normalizeSpecies(rawType: string | null | undefined): Species {
  if (!rawType) return "Other";
  return SPECIES_BY_RAW_TYPE[rawType.trim().toLowerCase()] ?? "Other";
}

/** True for the species this product is actually about. Wildlife and livestock
 *  intakes are real and are counted in data quality, but they are not part of
 *  an adoption metric. */
export function isCompanionSpecies(species: Species): boolean {
  return species === "Dog" || species === "Cat";
}

/**
 * Adoption covers far more than the literal string "Adopted".
 *
 * The current feed carries Adopted, Adopted Altered, Adopted Unaltered,
 * Adopted Offsite, Adopted Offsite(Altered), Adopted Offsite(Unaltered) and
 * Adopted to Finder. Matching only the exact word would miss roughly 840
 * genuine adoptions out of 8,700, quietly understating every adoption rate on
 * the site by about ten percent.
 */
export function isAdoptionOutcome(outcomeType: string | null | undefined): boolean {
  if (!outcomeType) return false;
  const value = outcomeType.trim().toLowerCase();
  if (value.startsWith("adopted")) return true;
  // The archive uses different words for the same event.
  return value === "adoption" || value === "rto-adopt";
}

/** Outcomes that close a stay without the animal going to an adopter. Kept
 *  separate so they never contaminate a time-to-adoption statistic. */
export function isCompetingExit(outcomeType: string | null | undefined): boolean {
  return Boolean(outcomeType) && !isAdoptionOutcome(outcomeType);
}

/* -------------------------------------------------------------------------- */
/* Time helpers                                                                */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

/**
 * Socrata sends floating timestamps with no zone ("2026-09-02T14:35:00.000").
 * They are Austin local time. Appending Z would shift every reading by five or
 * six hours and change which day an intake landed on, so the string is parsed
 * as-is and only ever compared against other values from the same source.
 */
export function parseSourceTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = Date.parse(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

export function daysBetween(startIso: string, endIso: string): number | null {
  const start = parseSourceTimestamp(startIso);
  const end = parseSourceTimestamp(endIso);
  if (start === null || end === null) return null;
  return (end - start) / MS_PER_DAY;
}

/** Whole days an animal has been waiting as of a chosen moment. */
export function daysInCareAt(intakeIso: string, asOfIso: string): number | null {
  const days = daysBetween(intakeIso, asOfIso);
  return days === null ? null : Math.max(0, Math.floor(days));
}
