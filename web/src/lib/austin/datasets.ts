/**
 * The four City of Austin datasets, and the schema break between them.
 *
 * Austin moved the shelter onto ShelterBuddy on 5 May 2025. The two archive
 * datasets stop there and never move again; the two current datasets start
 * there and refresh hourly. They do not share an animal-ID namespace: the
 * archive keys animals as "A843491", ShelterBuddy keys them as "32459". An
 * animal present on both sides of the cutover cannot be linked, so the two
 * eras are kept as separate analytical universes rather than concatenated.
 *
 * IDs have safe defaults and may be overridden by environment so a broken
 * upstream dataset can be repointed without a deploy. The app token is read
 * only in client.server.ts and is never exposed with a NEXT_PUBLIC_ prefix.
 */

export const SOCRATA_DOMAIN = "data.austintexas.gov";

/** The day Austin cut over to ShelterBuddy. Archive rows stop, current rows start. */
export const SHELTERBUDDY_CUTOVER = "2025-05-05";

export interface DatasetRef {
  id: string;
  label: string;
  /** Which source system's schema the rows follow. */
  system: "legacy_archive" | "shelterbuddy";
  /** Human-facing page on the open data portal. */
  href: string;
  /** Column the rows are ordered and paged by. Must be stable. */
  orderColumn: string;
  /** Whether the feed is still being written to. */
  refresh: "hourly" | "frozen";
}

function datasetId(envKey: string, fallback: string): string {
  const value = process.env[envKey];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function portalHref(id: string, name: string): string {
  return `https://${SOCRATA_DOMAIN}/Health-and-Community-Services/${name}/${id}`;
}

export const CURRENT_INTAKES: DatasetRef = {
  id: datasetId("AUSTIN_CURRENT_INTAKES_ID", "pyqf-r2dc"),
  label: "Austin Animal Center Intakes",
  system: "shelterbuddy",
  href: portalHref(datasetId("AUSTIN_CURRENT_INTAKES_ID", "pyqf-r2dc"), "Austin-Animal-Center-Intakes"),
  orderColumn: "id",
  refresh: "hourly",
};

export const CURRENT_OUTCOMES: DatasetRef = {
  id: datasetId("AUSTIN_CURRENT_OUTCOMES_ID", "gsvs-ypi7"),
  label: "Austin Animal Center Outcomes",
  system: "shelterbuddy",
  href: portalHref(datasetId("AUSTIN_CURRENT_OUTCOMES_ID", "gsvs-ypi7"), "Austin-Animal-Center-Outcomes"),
  orderColumn: "id",
  refresh: "hourly",
};

export const ARCHIVE_INTAKES: DatasetRef = {
  id: datasetId("AUSTIN_ARCHIVE_INTAKES_ID", "wter-evkm"),
  label: "Austin Animal Center Intakes (1 Oct 2013 to 5 May 2025)",
  system: "legacy_archive",
  href: portalHref(datasetId("AUSTIN_ARCHIVE_INTAKES_ID", "wter-evkm"), "Austin-Animal-Center-Intakes"),
  orderColumn: ":id",
  refresh: "frozen",
};

export const ARCHIVE_OUTCOMES: DatasetRef = {
  id: datasetId("AUSTIN_ARCHIVE_OUTCOMES_ID", "9t4d-g238"),
  label: "Austin Animal Center Outcomes (1 Oct 2013 to 5 May 2025)",
  system: "legacy_archive",
  href: portalHref(datasetId("AUSTIN_ARCHIVE_OUTCOMES_ID", "9t4d-g238"), "Austin-Animal-Center-Outcomes"),
  orderColumn: ":id",
  refresh: "frozen",
};

export const ALL_DATASETS: readonly DatasetRef[] = [
  CURRENT_INTAKES,
  CURRENT_OUTCOMES,
  ARCHIVE_INTAKES,
  ARCHIVE_OUTCOMES,
] as const;

/**
 * Columns fetched from each current feed. Selecting explicitly keeps the
 * payload small and, more importantly, means `found_address` is never
 * requested: an exact address of where a stray was picked up has no place in
 * this product and cannot leak from a field we do not ask for.
 */
export const CURRENT_INTAKE_COLUMNS = [
  "id",
  "animal_id",
  "source_date",
  "type",
  "source_name",
  "sex",
  "ispreviouslyspayedneutered",
  "primary_breed",
  "primary_color",
  "secondary_color",
  "intake_health_condition",
  "date_of_birth",
  "name_at_intake",
  "timestamp",
] as const;

export const CURRENT_OUTCOME_COLUMNS = [
  "id",
  "animal_id",
  "intake_date",
  "outcome_date",
  "outcome_status",
  "type",
  "name",
  "sex",
  "spayed_neutered",
  "primary_breed",
  "primary_color",
  "secondary_color",
  "date_of_birth",
  "days_in_shelter",
  "timestamp",
] as const;
