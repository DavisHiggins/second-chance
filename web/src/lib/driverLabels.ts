import type { Direction, Driver } from "@/types/api";

/**
 * The API sends a human-readable `label` on every driver and the client does not
 * translate feature names. This table is the fallback, and the source of the
 * phrasing, so the tone holds if a feature arrives without one.
 *
 * Phrasing is verbatim from CONTENT.md. Note `color_has_black`: the wording is
 * deliberately neutral in both directions. This dataset does not support the
 * folk belief that black animals wait longer, and the interface must not imply
 * otherwise.
 */
const DRIVER_PHRASES: Record<string, { raises: string; lowers: string }> = {
  age_at_intake_days: {
    raises: "young for its species",
    lowers: "older than adopters usually ask for",
  },
  age_at_intake_log: {
    raises: "young for its species",
    lowers: "older than adopters usually ask for",
  },
  age_band: {
    raises: "in the age range adopters ask for",
    lowers: "outside the age range adopters ask for",
  },
  animal_type: {
    raises: "species adopters ask for more often",
    lowers: "species adopters ask for less often",
  },
  intake_type: {
    raises: "surrendered by an owner, so history is known",
    lowers: "arrived as a stray with no history",
  },
  intake_condition: {
    raises: "arrived in normal condition",
    lowers: "arrived in poor condition",
  },
  sex_upon_intake: {
    raises: "already sterilised on arrival",
    lowers: "sex not recorded on arrival",
  },
  has_name: {
    raises: "arrived with a name",
    lowers: "arrived without a name",
  },
  name_length: {
    raises: "arrived with a name",
    lowers: "arrived without a name",
  },
  name_is_shelter_assigned: {
    raises: "came in with an owner's name",
    lowers: "named by staff, so nobody was looking for them",
  },
  breed_bully_type: {
    raises: "not a bully-type breed",
    lowers: "carries a bully-type breed label",
  },
  breed_bsl_risk: {
    raises: "no housing restrictions typically attached",
    lowers: "breed often restricted by landlords and insurers",
  },
  breed_size_ordinal: {
    raises: "a size adopters ask for",
    lowers: "larger than most adopters ask for",
  },
  breed_coat_ordinal: {
    raises: "longer coat",
    lowers: "shorter coat",
  },
  color_has_black: {
    raises: "coat colour",
    lowers: "coat colour",
  },
  shelter_census_at_intake: {
    raises: "arrived when the shelter had room",
    lowers: "arrived when the shelter was full",
  },
  prior_intake_count: {
    raises: "first visit",
    lowers: "has been here before",
  },
  intakes_prior_30d: {
    raises: "arrived in a quiet month",
    lowers: "arrived during a busy month",
  },
  adoptions_prior_30d: {
    raises: "arrived in a month when adoptions were running high",
    lowers: "arrived in a month when adoptions were running low",
  },
};

/**
 * An unknown feature never renders as a raw column name. It falls back to a
 * phrase that is honest about being unspecific rather than leaking
 * `breed_coat_ordinal` onto a kennel manager's screen.
 */
export function driverPhrase(driver: Pick<Driver, "feature" | "label" | "direction">): string {
  if (driver.label && driver.label.trim().length > 0) return driver.label;
  return fallbackPhrase(driver.feature, driver.direction);
}

export function fallbackPhrase(feature: string, direction: Direction): string {
  const entry = DRIVER_PHRASES[feature];
  if (entry) return entry[direction];
  return direction === "raises"
    ? "another measured factor, raises the chance"
    : "another measured factor, lowers the chance";
}

/** "1 year old · lowers chance", the chip form used in the queue. */
export function driverChipText(driver: Pick<Driver, "feature" | "label" | "direction">): string {
  return `${driverPhrase(driver)} · ${driver.direction} chance`;
}

export const DRIVER_FEATURES = Object.keys(DRIVER_PHRASES);
