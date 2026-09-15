import type { RiskBand } from "@/lib/model/registry.server";
import { TRIAGE_LABEL } from "@/lib/model/horizon";

/**
 * How model internals are named and coloured on screen.
 *
 * Feature names, bands and their colours are decided once, here, because
 * the alternative is what the previous build did: each view invented its own
 * label and its own cut-off, so the same animal could read as "serious" in one
 * place and "warning" in another, and a feature was called three things on
 * three pages.
 *
 * Band labels come from the horizon module so the queue, the planner and the
 * record page agree. They describe outreach triage, not urgency of care.
 *
 * This module is deliberately free of server imports so client components can
 * use it. The `RiskBand` import is a type and is erased at build time.
 */

/* -------------------------------------------------------------------------- */
/* Bands                                                                       */
/* -------------------------------------------------------------------------- */

export const BAND_LABEL: Record<RiskBand, string> = TRIAGE_LABEL;

export const BAND_COLOR: Record<RiskBand, string> = {
  critical: "var(--status-critical)",
  serious: "var(--status-serious)",
  warning: "var(--status-warning)",
  ok: "var(--status-good)",
};

/** The band as a status tone, so the shared icon set can be used unchanged. */
export function bandTone(band: RiskBand): "good" | "warning" | "serious" | "critical" {
  return band === "ok" ? "good" : band;
}

/** What the band meant at intake, in words. Always past tense: the estimate
 *  was made on arrival and is not re-made as the stay goes on. */
export const BAND_SENTENCE: Record<RiskBand, string> = {
  critical:
    "At intake, among the arrivals the model rated most likely to still be here after 60 days.",
  serious: "At intake, rated more likely than most arrivals to still be here after 60 days.",
  warning: "At intake, rated somewhat more likely than average to wait past 60 days.",
  ok: "At intake, rated at no greater long-stay risk than the shelter average.",
};

/* -------------------------------------------------------------------------- */
/* Feature names                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The plain-English name for each numeric feature.
 *
 * One-hot columns are not listed: they follow the `group__level` convention the
 * training script emits and are expanded by the parser below, so adding a new
 * breed or intake reason in Python does not require an edit here.
 */
const NUMERIC_PHRASE: Record<string, string> = {
  age_at_intake_days: "Age when it arrived",
  age_known: "Whether an age was recorded",
  altered_at_intake: "Already spayed or neutered on arrival",
  intake_month: "Month it arrived",
  intake_day_of_week: "Day of the week it arrived",
  intake_hour: "Time of day it arrived",
  month_sin: "Time of year it arrived",
  month_cos: "Time of year it arrived",
  breed_is_mixed: "Recorded as a mixed breed",
  color_is_black: "Black in its coat",
  census_at_intake: "How full the shelter was that day",
  intakes_last_7d: "How busy the previous week had been",
  prior_intakes: "Whether it had been in before",
};

/** `group__level` prefixes, in the words the group is described in on screen. */
const GROUP_PREFIX: Record<string, string> = {
  species: "Species",
  intakereason: "Reason it came in",
  condition: "Condition on arrival",
  breed: "Breed",
  sex: "Sex",
  rawtype: "Recorded as",
};

/** "domestic_shorthair" becomes "Domestic shorthair"; "med_attn" is spelled out. */
const LEVEL_OVERRIDE: Record<string, string> = {
  __missing__: "not recorded",
  missing: "not recorded",
  med_attn: "needs medical attention",
  aco___impound: "animal control impound",
  aco___owner_surrender: "animal control owner surrender",
  community_animal___program: "community animal programme",
  community_animal___field_services: "community animal field services",
  chihuahua___smooth: "Chihuahua, smooth coat",
  chihuahua___long_hair: "Chihuahua, long hair",
  poodle___miniature: "Miniature poodle",
};

function humaniseLevel(level: string): string {
  const override = LEVEL_OVERRIDE[level];
  if (override) return override;
  // Triple underscore is the training script's escape for a separator in the
  // source value; collapse it before the ordinary word split.
  const spaced = level.replace(/___/g, " ").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The name a person should see for a model feature.
 *
 * Falls back to a readable version of the raw column rather than hiding an
 * unknown feature: a name nobody recognises on screen is a prompt to fix the
 * mapping, whereas a silently dropped row is a prompt to fix nothing.
 */
export function featurePhrase(feature: string): string {
  const numeric = NUMERIC_PHRASE[feature];
  if (numeric) return numeric;

  const separator = feature.indexOf("__");
  if (separator > 0) {
    const group = feature.slice(0, separator);
    const level = feature.slice(separator + 2);
    const prefix = GROUP_PREFIX[group];
    if (prefix) return `${prefix}: ${humaniseLevel(level)}`;
  }

  const single = /^species_(dog|cat)$/.exec(feature);
  if (single) return `Species: ${single[1] === "dog" ? "Dog" : "Cat"}`;

  return humaniseLevel(feature);
}

/**
 * Collapses features that mean the same thing to a reader.
 *
 * `month_sin` and `month_cos` are one idea encoded as two columns; showing
 * both in a top-five list spends two of the five slots saying "time of year".
 */
export function mergeDrivers(
  drivers: readonly { feature: string; gain: number }[],
): { feature: string; label: string; gain: number }[] {
  const merged = new Map<string, { feature: string; label: string; gain: number }>();

  for (const driver of drivers) {
    const label = featurePhrase(driver.feature);
    const existing = merged.get(label);
    if (existing) existing.gain += driver.gain;
    else merged.set(label, { feature: driver.feature, label, gain: driver.gain });
  }

  return [...merged.values()].sort((a, b) => b.gain - a.gain);
}
