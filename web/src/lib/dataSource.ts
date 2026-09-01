import queueFixture from "@/data/queue.json";
import metadataFixture from "@/data/metadata.json";
import trendsFixture from "@/data/trends.json";
import forecastFixture from "@/data/forecast.json";
import segmentsFixture from "@/data/segments.json";
import interventionsFixture from "@/data/interventions.json";
import modelSummaryFixture from "@/data/measured_results.json";

import type {
  AnimalDetail,
  AnimalResponse,
  Envelope,
  Forecast,
  Health,
  InterventionsResponse,
  Metadata,
  ModelHealthRow,
  ModelSummary,
  QueueAnimal,
  QueueResponse,
  Segment,
  TrendMonth,
  UsePolicy,
} from "@/types/api";

/**
 * One interface, two modes. No component knows which one it is in.
 *
 * Static mode is the default and bundles everything in `src/data`. Live mode
 * turns on when NEXT_PUBLIC_API_BASE_URL is set, and every call falls back to
 * the fixture on failure while setting `using_fallback_data`, which the header
 * renders as the sample-data chip. Serving stale data while looking live is the
 * exact failure this project exists to argue against.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const FIXTURE_DELAY = Number(process.env.NEXT_PUBLIC_FIXTURE_DELAY ?? "0");

export const USE_POLICY: UsePolicy = {
  intended_use:
    "Prioritise photography, foster placement, behaviour support, adoption events and outreach for animals the model expects to wait longest.",
  prohibited_use:
    "This score must never inform euthanasia, intake refusal, or any decision that reduces the care an animal receives. A low predicted adoption probability is a request for more help, not less.",
};

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

const metadata = metadataFixture as Metadata;
const queueAnimals = (queueFixture as { animals: QueueAnimal[] }).animals;
const trends = (trendsFixture as { months: TrendMonth[] }).months;
const forecast = forecastFixture as Forecast;
const segments = (segmentsFixture as { segments: Segment[] }).segments;
const modelSummary = modelSummaryFixture as unknown as Omit<ModelSummary, keyof Envelope>;

function envelope(usingFallback: boolean): Envelope {
  return {
    model_version: metadata.model_version,
    data_as_of: metadata.data_as_of,
    use_policy: USE_POLICY,
    using_fallback_data: usingFallback,
  };
}

async function delay(): Promise<void> {
  if (FIXTURE_DELAY > 0) {
    await new Promise((resolve) => setTimeout(resolve, FIXTURE_DELAY));
  }
}

/**
 * A live response is only trusted when it carries the three envelope fields. A
 * response without them is treated as an error and the fixture is served
 * instead, with the fallback flag set.
 */
function hasEnvelope(value: unknown): value is { model_version: string; data_as_of: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.model_version === "string" && typeof candidate.data_as_of === "string"
  );
}

async function live<T>(path: string): Promise<T | null> {
  if (!API_BASE) return null;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!hasEnvelope(body)) return null;
    return body as T;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */

export interface QueueParams {
  limit?: number;
  species?: "Dog" | "Cat";
  minRisk?: number;
}

export async function getHealth(): Promise<Health> {
  const remote = await live<Health>("/v1/health");
  if (remote) return { ...remote, use_policy: USE_POLICY, using_fallback_data: false };
  await delay();
  return {
    ...envelope(API_BASE.length > 0 || metadata.using_sample_data),
    status: "healthy",
    checked_at: metadata.data_as_of,
  };
}

export async function getQueue(params: QueueParams = {}): Promise<QueueResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.species) query.set("species", params.species);
  if (params.minRisk !== undefined) query.set("min_risk", String(params.minRisk));
  const remote = await live<QueueResponse>(
    `/v1/queue/needs-attention${query.size > 0 ? `?${query.toString()}` : ""}`,
  );
  if (remote) return { ...remote, use_policy: USE_POLICY, using_fallback_data: false };

  await delay();
  let animals = queueAnimals;
  if (params.species) animals = animals.filter((a) => a.animal_type === params.species);
  if (params.minRisk !== undefined) {
    animals = animals.filter((a) => (a.p_long_stay_60d ?? 0) >= (params.minRisk ?? 0));
  }
  const limited = params.limit ? animals.slice(0, params.limit) : animals;
  return {
    ...envelope(usingFallback()),
    animals: limited,
    total_available: animals.length,
    generated_at: (queueFixture as { generated_at: string }).generated_at,
  };
}

/**
 * The demo ships a full detail payload for a subset of the queue. Where one is
 * missing the queue record is used instead: it is the same real record with
 * fewer sections, and the page renders the absent sections as "not measured"
 * rather than inventing a timeline.
 */
async function loadDetailFixture(id: string): Promise<AnimalDetail | null> {
  try {
    const mod = (await import(`@/data/animals/${id}.json`)) as { default: AnimalDetail };
    return mod.default;
  } catch {
    return null;
  }
}

export async function getAnimal(id: string): Promise<AnimalResponse> {
  const remote = await live<AnimalResponse>(`/v1/animals/${encodeURIComponent(id)}`);
  if (remote) return { ...remote, use_policy: USE_POLICY, using_fallback_data: false };

  await delay();
  const detail = await loadDetailFixture(id);
  if (detail) {
    return { ...envelope(usingFallback()), animal: detail };
  }
  const fromQueue = queueAnimals.find((a) => a.animal_id === id);
  if (!fromQueue) {
    throw new NotFoundError(`No record for ${id}`);
  }
  return {
    ...envelope(usingFallback()),
    animal: { ...fromQueue, timeline: [], similar_animals: [] },
  };
}

export async function getInterventions(): Promise<InterventionsResponse> {
  await delay();
  const fixture = interventionsFixture as {
    channels: InterventionsResponse["channels"];
    driver_to_channel?: Record<string, string>;
  };
  return {
    ...envelope(usingFallback()),
    channels: fixture.channels,
    driver_to_channel: fixture.driver_to_channel,
  };
}

export async function getModelSummary(): Promise<ModelSummary> {
  const remote = await live<ModelSummary>("/v1/model/summary");
  if (remote) return { ...remote, use_policy: USE_POLICY, using_fallback_data: false };
  await delay();
  return { ...modelSummary, ...envelope(usingFallback()) } as ModelSummary;
}

/**
 * `predict` never runs a model in the client. In static mode it looks the animal
 * up and returns the stored prediction; an unknown id is a not-found, not an
 * invented score.
 */
export async function predict(animalId: string): Promise<AnimalResponse> {
  return getAnimal(animalId);
}

/* -------------------------------------------------------------------------- */

export interface PopulationBand {
  label: string;
  count: number;
}

export interface DeltaValue {
  value: number | null;
  /** True when a rise in this metric is good news for the animals. */
  upIsGood: boolean;
  caption: string;
}

export interface DashboardTile {
  id: string;
  label: string;
  display: string;
  unit: string;
  spark: number[];
  delta: DeltaValue;
}

export interface DashboardData extends Envelope {
  metadata: Metadata;
  heroCount: number;
  totalInQueue: number;
  bands: PopulationBand[];
  tiles: DashboardTile[];
  forecast: Forecast;
  segments: Segment[];
  health: ModelHealthRow[];
}

function usingFallback(): boolean {
  // In static mode the data is a bundled fixture, and the header says so. In
  // live mode this function is only reached after a live call failed.
  return true;
}

/** Bands are read off the model's expected days in care, not off a threshold
 *  the client invents. */
function populationBands(animals: QueueAnimal[]): PopulationBand[] {
  const labels = ["Under 7 days", "7 to 30 days", "30 to 60 days", "Over 60 days"];
  const counts = [0, 0, 0, 0];
  for (const animal of animals) {
    const days = animal.expected_days_in_shelter;
    if (days === null || days === undefined) continue;
    if (days < 7) counts[0] += 1;
    else if (days < 30) counts[1] += 1;
    else if (days < 60) counts[2] += 1;
    else counts[3] += 1;
  }
  return labels.map((label, index) => ({ label, count: counts[index] }));
}

function pctChange(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return (current - previous) / previous;
}

export async function getDashboard(): Promise<DashboardData> {
  await delay();

  const heroCount = queueAnimals.filter((a) => (a.p_long_stay_60d ?? 0) >= 0.5).length;
  const last12 = trends.slice(-12);
  const latest = trends[trends.length - 1];
  const monthAgo = trends[trends.length - 2];
  const yearAgo = trends[trends.length - 13];

  const summary = modelSummary as unknown as ModelSummary;
  const champion = summary.targets.adopted_within_30d.models.lightgbm.test_calibrated;
  const worstDrift = summary.drift.top_drifting_features_post_shift[0];

  const health: ModelHealthRow[] = [
    {
      id: "discrimination",
      label: "Discrimination",
      value: champion?.roc_auc ?? null,
      display: champion?.roc_auc !== undefined ? `AUC ${champion.roc_auc?.toFixed(3)}` : "not measured",
      status: (champion?.roc_auc ?? 0) >= 0.75 ? "good" : "warning",
      href: "/model#how-well",
    },
    {
      id: "calibration",
      label: "Calibration error",
      value: champion?.ece ?? null,
      display: champion?.ece !== undefined ? `ECE ${champion.ece?.toFixed(3)}` : "not measured",
      status: (champion?.ece ?? 1) <= 0.05 ? "good" : "warning",
      href: "/model#how-well",
    },
    {
      id: "drift",
      label: "Input drift",
      value: worstDrift?.psi ?? null,
      display: worstDrift
        ? `PSI ${worstDrift.psi.toFixed(3)} on ${worstDrift.feature.replace(/_/g, " ")}`
        : "not measured",
      status:
        worstDrift?.status === "CRITICAL"
          ? "critical"
          : worstDrift?.status === "WARNING"
            ? "warning"
            : "good",
      href: "/model#when-it-stops",
    },
    {
      id: "retrained",
      label: "Last retrained",
      value: summary.metadata.model_trained_at,
      display: summary.metadata.model_trained_at,
      status: "good",
      href: "/model#how-well",
    },
  ];

  const tiles: DashboardTile[] = [
    {
      id: "census",
      label: "Animals in care",
      display: metadata.current_census.toLocaleString("en-US"),
      unit: "animals",
      spark: last12.map((m) => m.census),
      delta: {
        value: pctChange(latest?.census, monthAgo?.census),
        upIsGood: false,
        caption: "vs 30 days ago",
      },
    },
    {
      id: "median-days",
      label: "Median days to adoption",
      display: metadata.median_days_to_adoption.toFixed(1),
      unit: "days",
      spark: last12.map((m) => m.median_days_to_adoption),
      delta: {
        value: pctChange(latest?.median_days_to_adoption, monthAgo?.median_days_to_adoption),
        upIsGood: false,
        caption: "vs 30 days ago",
      },
    },
    {
      id: "adoption-rate",
      label: "Adopted within 30 days",
      display: `${Math.round(metadata.adoption_rate_30d * 100)}%`,
      unit: "of arrivals",
      spark: last12.map((m) => m.adopted_within_30d_rate),
      delta: {
        value: pctChange(latest?.adopted_within_30d_rate, yearAgo?.adopted_within_30d_rate),
        upIsGood: true,
        caption: "vs this month last year",
      },
    },
    {
      id: "long-stay",
      label: "Predicted long stay",
      display: heroCount.toLocaleString("en-US"),
      unit: "animals",
      spark: last12.map((m) => m.long_stay_60d_rate),
      delta: {
        value: pctChange(latest?.long_stay_60d_rate, monthAgo?.long_stay_60d_rate),
        upIsGood: false,
        caption: "vs 30 days ago",
      },
    },
  ];

  return {
    ...envelope(usingFallback()),
    metadata,
    heroCount,
    totalInQueue: queueAnimals.length,
    bands: populationBands(queueAnimals),
    tiles,
    forecast,
    segments,
    health,
  };
}

/** Life-stage segments, ordered by value, for the "where the wait is longest"
 *  panel. */
export function lifeStageSegments(all: Segment[]): Segment[] {
  return all
    .filter((s) => s.dimension === "life stage")
    .slice()
    .sort((a, b) => b.median_expected_days - a.median_expected_days);
}

export const dataSource = {
  getHealth,
  getQueue,
  getAnimal,
  getModelSummary,
  getDashboard,
  getInterventions,
  predict,
};

export type DataSource = typeof dataSource;
