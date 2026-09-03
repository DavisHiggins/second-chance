import type { BoosterDump, IsotonicCalibration } from "./evaluator";
import type { FeatureSpec } from "./features";

/**
 * The shape of the committed model artifact.
 *
 * The artifact is written by `analysis/20_train_shelterbuddy.py` and read
 * here. Nothing in the product may state a model version, a training date, or
 * an evaluation metric that is not in this file: the old build hardcoded a
 * training date in the UI that was two weeks in the future, and the only
 * durable fix is that these values have exactly one source.
 */

export type TargetName = "long_stay_60d" | "adopted_within_30d";

export interface TargetMetrics {
  n: number;
  positiveRate: number;
  rocAuc: number | null;
  prAuc: number | null;
  brier: number | null;
  logLoss: number | null;
  ece: number | null;
  calibrationSlope: number | null;
  calibrationIntercept: number | null;
  precisionAt50: number | null;
  liftAt50: number | null;
}

export interface SubgroupMetric {
  attribute: string;
  level: string;
  n: number;
  positiveRate: number;
  rocAuc: number | null;
  meanPredicted: number | null;
  calibrationGap: number | null;
}

export interface TargetArtifact {
  booster: BoosterDump;
  calibration: IsotonicCalibration;
  /** Metrics on the held-out test block, after calibration. */
  test: TargetMetrics;
  /** Metrics on the validation block, before calibration was applied to test. */
  validation: TargetMetrics;
  subgroups: SubgroupMetric[];
  /** Mean absolute SHAP-style gain per feature, for the driver display. */
  featureImportance: { feature: string; gain: number }[];
}

export interface TrainingWindow {
  trainStart: string;
  trainEnd: string;
  validStart: string;
  validEnd: string;
  testStart: string;
  testEnd: string;
  trainRows: number;
  validRows: number;
  testRows: number;
}

export interface ModelProvenance {
  sourceDatasetIds: string[];
  sourceSystem: "shelterbuddy";
  intakeRows: number;
  outcomeRows: number;
  retrievedAt: string;
  schemaVersion: number;
  transformVersion: string;
  librarySeed: number;
}

export interface ReadyModelArtifact {
  schemaVersion: 1;
  status: "ready";
  version: string;
  /** The actual moment training ran. Never a literal typed by hand. */
  trainedAt: string;
  note: string | null;
  trainingWindow: TrainingWindow;
  features: FeatureSpec[];
  targets: Record<TargetName, TargetArtifact>;
  provenance: ModelProvenance;
  /** Rows the training script scored to let the runtime prove parity. */
  goldenVectors: { features: number[]; expected: Record<TargetName, number> }[];
}

export interface PendingModelArtifact {
  schemaVersion: 1;
  status: "in_progress" | "unavailable";
  version: string | null;
  trainedAt: string | null;
  note: string;
}

export type ModelArtifact = ReadyModelArtifact | PendingModelArtifact;

export function isReady(artifact: ModelArtifact): artifact is ReadyModelArtifact {
  return artifact.status === "ready";
}

/**
 * A training date in the future means the artifact is not describing a run
 * that happened. The old build shipped exactly that and the model page
 * presented it as fact, so the runtime refuses the artifact rather than
 * repeating the claim.
 */
export function hasCredibleTrainingDate(artifact: ReadyModelArtifact, now = Date.now()): boolean {
  const trained = Date.parse(artifact.trainedAt);
  return Number.isFinite(trained) && trained <= now;
}
