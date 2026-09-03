import type { Episode } from "@/lib/austin/types";
import { parseSourceTimestamp } from "@/lib/austin/types";

/**
 * Feature derivation, shared in spirit with the training script.
 *
 * The training script and this module must agree exactly, or the probabilities
 * on screen will not be the ones the model was evaluated on. Two things keep
 * them honest. First, the derived values below are deliberately simple and
 * few: everything is a number, a flag, or a plain string, and nothing depends
 * on a library-specific encoder. Second, the artifact carries the feature spec
 * itself, so category lists and column order come from training rather than
 * being retyped here. A golden-vector test compares both implementations on
 * real rows and fails the build if they diverge.
 *
 * Every value is knowable at intake. Nothing reads an outcome, because a model
 * that peeks at how the stay ended would score beautifully and be useless.
 */

/** The intermediate values a feature spec is allowed to reference. */
export interface DerivedRow {
  ageAtIntakeDays: number | null;
  ageKnown: number;
  species: string;
  rawType: string;
  alteredAtIntake: number | null;
  sex: string;
  intakeMonth: number;
  intakeDayOfWeek: number;
  intakeHour: number;
  monthSin: number;
  monthCos: number;
  intakeReason: string;
  condition: string;
  breed: string;
  breedIsMixed: number;
  colorIsBlack: number;
  censusAtIntake: number;
  intakesLast7d: number;
  priorIntakes: number;
}

const MS_PER_DAY = 86_400_000;

function cleanCategory(value: string | null | undefined): string {
  if (value === null || value === undefined) return "__missing__";
  const trimmed = value.trim();
  return trimmed.length === 0 ? "__missing__" : trimmed;
}

/** "Domestic Shorthair Mix" and "Labrador Retriever/Pit Bull" both mean mixed. */
function isMixedBreed(breed: string): number {
  const value = breed.toLowerCase();
  return value.includes("mix") || value.includes("/") ? 1 : 0;
}

/** Black coat is tested explicitly because shelter folklore says it slows
 *  adoption. The archive model found it did not; keeping the feature means the
 *  new model can be asked the same question rather than assuming an answer. */
function hasBlack(color: string): number {
  return color.toLowerCase().includes("black") ? 1 : 0;
}

/**
 * Context that depends on the whole episode set rather than one row: how full
 * the shelter was, how busy the week had been, and whether this animal had
 * been in before. Computed once for the set and passed in.
 */
export interface EpisodeContext {
  censusAtIntake: Map<string, number>;
  intakesLast7d: Map<string, number>;
  priorIntakes: Map<string, number>;
}

/**
 * Builds the contextual counts for a set of episodes.
 *
 * The census sweep is the reason this is done in bulk: for each intake we need
 * how many other stays were open at that instant, which is a sorted walk over
 * every arrival and departure rather than a per-row lookup.
 */
export function buildEpisodeContext(episodes: Episode[]): EpisodeContext {
  const events: { at: number; delta: number }[] = [];
  for (const episode of episodes) {
    const intake = parseSourceTimestamp(episode.intakeAt);
    if (intake === null) continue;
    events.push({ at: intake, delta: 1 });

    const outcome = episode.outcomeAt ? parseSourceTimestamp(episode.outcomeAt) : null;
    if (outcome !== null) events.push({ at: outcome, delta: -1 });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  // Occupancy at every instant something happened.
  const occupancyAt: { at: number; census: number }[] = [];
  let running = 0;
  for (const event of events) {
    running += event.delta;
    occupancyAt.push({ at: event.at, census: running });
  }

  const censusFor = (at: number): number => {
    let low = 0;
    let high = occupancyAt.length - 1;
    let answer = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (occupancyAt[mid].at <= at) {
        answer = occupancyAt[mid].census;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return answer;
  };

  const intakeTimes = episodes
    .map((episode) => parseSourceTimestamp(episode.intakeAt))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const countInWindow = (at: number, windowMs: number): number => {
    // Arrivals strictly before this one, within the window.
    const from = at - windowMs;
    let low = 0;
    let high = intakeTimes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (intakeTimes[mid] < from) low = mid + 1;
      else high = mid;
    }
    const start = low;
    low = 0;
    high = intakeTimes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (intakeTimes[mid] < at) low = mid + 1;
      else high = mid;
    }
    return low - start;
  };

  const byAnimal = new Map<string, number[]>();
  for (const episode of episodes) {
    const at = parseSourceTimestamp(episode.intakeAt);
    if (at === null) continue;
    const list = byAnimal.get(episode.animalId);
    if (list) list.push(at);
    else byAnimal.set(episode.animalId, [at]);
  }
  for (const list of byAnimal.values()) list.sort((a, b) => a - b);

  const censusAtIntake = new Map<string, number>();
  const intakesLast7d = new Map<string, number>();
  const priorIntakes = new Map<string, number>();

  for (const episode of episodes) {
    const at = parseSourceTimestamp(episode.intakeAt);
    if (at === null) continue;

    censusAtIntake.set(episode.episodeId, censusFor(at));
    intakesLast7d.set(episode.episodeId, countInWindow(at, 7 * MS_PER_DAY));

    const times = byAnimal.get(episode.animalId) ?? [];
    priorIntakes.set(episode.episodeId, times.filter((t) => t < at).length);
  }

  return { censusAtIntake, intakesLast7d, priorIntakes };
}

/** Turns one episode into the flat intermediate row a feature spec reads. */
export function deriveRow(episode: Episode, context: EpisodeContext): DerivedRow {
  const intakeMs = parseSourceTimestamp(episode.intakeAt);
  const date = intakeMs === null ? null : new Date(intakeMs);

  // getUTC* is correct here: source timestamps are parsed as if UTC precisely
  // so that the clock reading survives unchanged, which is what Austin local
  // time means in this feed.
  const month = date ? date.getUTCMonth() + 1 : 0;
  const breed = cleanCategory(episode.breed);
  const color = cleanCategory(episode.color);

  return {
    ageAtIntakeDays: episode.ageAtIntakeDays,
    ageKnown: episode.ageAtIntakeDays === null ? 0 : 1,
    species: episode.species,
    rawType: cleanCategory(episode.rawType),
    alteredAtIntake:
      episode.alteredAtIntake === null ? null : episode.alteredAtIntake ? 1 : 0,
    sex: cleanCategory(episode.sex),
    intakeMonth: month,
    intakeDayOfWeek: date ? date.getUTCDay() : 0,
    intakeHour: date ? date.getUTCHours() : 0,
    monthSin: month === 0 ? 0 : Math.sin((2 * Math.PI * month) / 12),
    monthCos: month === 0 ? 0 : Math.cos((2 * Math.PI * month) / 12),
    intakeReason: cleanCategory(episode.intakeReason),
    condition: cleanCategory(episode.condition),
    breed,
    breedIsMixed: isMixedBreed(breed),
    colorIsBlack: hasBlack(color),
    censusAtIntake: context.censusAtIntake.get(episode.episodeId) ?? 0,
    intakesLast7d: context.intakesLast7d.get(episode.episodeId) ?? 0,
    priorIntakes: context.priorIntakes.get(episode.episodeId) ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Feature spec, as carried by the artifact                                    */
/* -------------------------------------------------------------------------- */

export type FeatureSpec =
  | { name: string; kind: "numeric"; source: keyof DerivedRow }
  | { name: string; kind: "indicator"; source: keyof DerivedRow; equals: string };

/**
 * Materialises the model input vector in the exact column order training used.
 *
 * A missing numeric stays NaN rather than becoming zero: LightGBM learned a
 * direction for missing values, and substituting a zero would send the row
 * down the wrong branch while looking like a real measurement.
 */
export function buildFeatureVector(row: DerivedRow, specs: readonly FeatureSpec[]): number[] {
  const vector = new Array<number>(specs.length);

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const raw = row[spec.source];

    if (spec.kind === "indicator") {
      vector[i] = String(raw) === spec.equals ? 1 : 0;
      continue;
    }

    if (raw === null || raw === undefined) {
      vector[i] = Number.NaN;
    } else if (typeof raw === "number") {
      vector[i] = raw;
    } else {
      vector[i] = Number.NaN;
    }
  }

  return vector;
}

/**
 * Whether a row can be scored at all.
 *
 * Species is required because the model was trained on cats and dogs, and a
 * bat is not a quiet edge case, it is out of distribution. Age is required
 * because it is the strongest signal the archive model found and a stay with
 * no date of birth is a genuinely different object. Rows that fail return a
 * reason, and the UI says prediction unavailable rather than inventing one.
 */
export function scoreability(episode: Episode): { ok: boolean; reason: string | null } {
  if (episode.species !== "Dog" && episode.species !== "Cat") {
    return {
      ok: false,
      reason: "The model was trained on cats and dogs only.",
    };
  }
  if (episode.ageAtIntakeDays === null) {
    return {
      ok: false,
      reason: "No date of birth is recorded for this animal, so age at intake is unknown.",
    };
  }
  return { ok: true, reason: null };
}
