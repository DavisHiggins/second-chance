/**
 * Runtime validation at the Socrata boundary.
 *
 * Two habits of the SODA API drive the shapes below. First, a null column is
 * omitted from the row entirely rather than sent as null, so almost every
 * field has to be optional. Second, numbers arrive as strings
 * (`"days_in_shelter": "30"`), and booleans sometimes arrive as real booleans
 * and sometimes as the strings "true"/"false" depending on the column type.
 *
 * Raw rows are kept in their source shape here and converted in the
 * normalizers, so a mapping decision is always visible in one place rather
 * than smuggled into a parser.
 */

import { z } from "zod";

/** A Socrata floating timestamp: "2026-09-02T14:35:00.000", no zone. */
const socrataTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/, "not a Socrata timestamp");

/** Some archive columns are typed as free text and hold a date anyway. */
const looseTimestamp = z.string().min(4);

const numericString = z.string().regex(/^-?\d+(\.\d+)?$/, "not numeric");

/** Booleans arrive either as JSON booleans or as "true"/"false" strings. */
const looseBoolean = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((v) => v === "true"),
]);

/* -------------------------------------------------------------------------- */
/* ShelterBuddy, the current hourly feeds                                      */
/* -------------------------------------------------------------------------- */

export const shelterBuddyIntakeRow = z.object({
  id: z.string().min(1),
  animal_id: z.string().min(1),
  source_date: socrataTimestamp,
  type: z.string().optional(),
  source_name: z.string().optional(),
  sex: z.string().optional(),
  ispreviouslyspayedneutered: looseBoolean.optional(),
  primary_breed: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  intake_health_condition: z.string().optional(),
  date_of_birth: socrataTimestamp.optional(),
  name_at_intake: z.string().optional(),
  timestamp: socrataTimestamp.optional(),
});

export const shelterBuddyOutcomeRow = z.object({
  id: z.string().min(1),
  animal_id: z.string().min(1),
  /** The stay this outcome closes. Present on every row observed to date. */
  intake_date: socrataTimestamp.optional(),
  outcome_date: socrataTimestamp,
  outcome_status: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  sex: z.string().optional(),
  spayed_neutered: z.string().optional(),
  primary_breed: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  date_of_birth: socrataTimestamp.optional(),
  days_in_shelter: numericString.optional(),
  timestamp: socrataTimestamp.optional(),
});

export type ShelterBuddyIntakeRow = z.infer<typeof shelterBuddyIntakeRow>;
export type ShelterBuddyOutcomeRow = z.infer<typeof shelterBuddyOutcomeRow>;

/* -------------------------------------------------------------------------- */
/* Legacy archive, frozen at the May 2025 cutover                              */
/* -------------------------------------------------------------------------- */

export const legacyIntakeRow = z.object({
  animal_id: z.string().min(1),
  datetime: looseTimestamp,
  name: z.string().optional(),
  intake_type: z.string().optional(),
  intake_condition: z.string().optional(),
  animal_type: z.string().optional(),
  sex_upon_intake: z.string().optional(),
  age_upon_intake: z.string().optional(),
  breed: z.string().optional(),
  color: z.string().optional(),
  // found_location is deliberately absent: it is never selected, so it can
  // never be parsed, stored, or serialised into a page payload.
});

export const legacyOutcomeRow = z.object({
  animal_id: z.string().min(1),
  datetime: looseTimestamp,
  name: z.string().optional(),
  date_of_birth: looseTimestamp.optional(),
  outcome_type: z.string().optional(),
  outcome_subtype: z.string().optional(),
  animal_type: z.string().optional(),
  sex_upon_outcome: z.string().optional(),
  age_upon_outcome: z.string().optional(),
  breed: z.string().optional(),
  color: z.string().optional(),
});

export type LegacyIntakeRow = z.infer<typeof legacyIntakeRow>;
export type LegacyOutcomeRow = z.infer<typeof legacyOutcomeRow>;

/* -------------------------------------------------------------------------- */

export interface ParseReport<T> {
  rows: T[];
  /** Rows the schema rejected. Counted and reported, never silently dropped. */
  rejected: number;
  /** First few rejection messages, for the data-quality panel and logs. */
  sampleErrors: string[];
}

/**
 * Parses an array of unknown rows, keeping the good ones and counting the bad.
 *
 * A single malformed row must not blank the whole dashboard, but the count has
 * to surface: silently discarding source rows is how a data product starts
 * lying. The caller puts `rejected` into the data-quality metrics.
 */
export function parseRows<T>(schema: z.ZodType<T>, raw: unknown[]): ParseReport<T> {
  const rows: T[] = [];
  const sampleErrors: string[] = [];
  let rejected = 0;

  for (const candidate of raw) {
    const result = schema.safeParse(candidate);
    if (result.success) {
      rows.push(result.data);
    } else {
      rejected += 1;
      if (sampleErrors.length < 5) {
        sampleErrors.push(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
    }
  }

  return { rows, rejected, sampleErrors };
}
