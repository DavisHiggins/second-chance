import { describe, expect, it } from "vitest";
import artifact from "@/data/model/model.json";
import golden from "./fixtures/model-golden.json";
import { applyCalibration, predictCalibrated } from "@/lib/model/evaluator";
import { isReady, hasCredibleTrainingDate, type ModelArtifact } from "@/lib/model/artifact";

/**
 * The model is trained in Python and evaluated in TypeScript, which is only
 * safe if the two agree exactly. The training script scores a sample of real
 * rows and writes the probabilities it computed; this replays those rows
 * through the runtime evaluator.
 *
 * If these ever diverge, the numbers on screen are not the numbers the model
 * was evaluated on, and the honest response is to stop showing predictions
 * rather than to loosen the tolerance.
 */

const model = artifact as unknown as ModelArtifact;

interface GoldenVector {
  features: (number | null)[];
  expected: Record<string, number>;
}

const vectors = (golden as { vectors: GoldenVector[] }).vectors;

describe("model artifact", () => {
  it("is published and structurally complete", () => {
    expect(isReady(model)).toBe(true);
    if (!isReady(model)) return;

    expect(model.features.length).toBeGreaterThan(0);
    expect(model.targets.long_stay_60d.booster.tree_info.length).toBeGreaterThan(0);
    expect(model.targets.adopted_within_30d.booster.tree_info.length).toBeGreaterThan(0);
  });

  it("does not claim a training date in the future", () => {
    // The previous build shipped a model page stating a training date two
    // weeks after the day it was read. The runtime now refuses that artifact.
    if (!isReady(model)) return;
    expect(hasCredibleTrainingDate(model)).toBe(true);
    expect(Date.parse(model.trainedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("reports evaluation metrics from a real held-out block", () => {
    if (!isReady(model)) return;
    for (const target of ["long_stay_60d", "adopted_within_30d"] as const) {
      const test = model.targets[target].test;
      expect(test.n).toBeGreaterThan(500);
      expect(test.rocAuc).not.toBeNull();
      expect(test.rocAuc as number).toBeGreaterThan(0.5);
      // An AUC this high on shelter data would mean a leak, not a good model.
      expect(test.rocAuc as number).toBeLessThan(0.95);
    }
  });

  it("trains, validates and tests on non-overlapping windows in time order", () => {
    if (!isReady(model)) return;
    const w = model.trainingWindow;
    expect(Date.parse(w.trainEnd)).toBeLessThan(Date.parse(w.validStart));
    expect(Date.parse(w.validEnd)).toBeLessThan(Date.parse(w.testStart));
    expect(w.trainRows).toBeGreaterThan(0);
    expect(w.testRows).toBeGreaterThan(0);
  });

  it("uses only numeric splits, which is all the runtime evaluator supports", () => {
    if (!isReady(model)) return;

    const walk = (node: unknown): void => {
      const candidate = node as Record<string, unknown>;
      if (candidate.leaf_value !== undefined) return;
      expect(candidate.decision_type).toBe("<=");
      walk(candidate.left_child);
      walk(candidate.right_child);
    };

    for (const target of ["long_stay_60d", "adopted_within_30d"] as const) {
      for (const tree of model.targets[target].booster.tree_info) {
        walk(tree.tree_structure);
      }
    }
  });
});

describe("Python and TypeScript agree", () => {
  it("reproduces every golden vector to within 1e-9", () => {
    expect(isReady(model)).toBe(true);
    if (!isReady(model)) return;
    expect(vectors.length).toBeGreaterThan(20);

    let worst = 0;

    for (const vector of vectors) {
      // The training script writes a missing feature as null; the runtime
      // represents it as NaN, which is what the trees branch on.
      const features = vector.features.map((v) => (v === null ? Number.NaN : v));

      for (const target of ["long_stay_60d", "adopted_within_30d"] as const) {
        const { calibrated } = predictCalibrated(
          model.targets[target].booster,
          model.targets[target].calibration,
          features,
        );
        const delta = Math.abs(calibrated - vector.expected[target]);
        worst = Math.max(worst, delta);
        expect(delta).toBeLessThan(1e-9);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`worst Python/TypeScript disagreement: ${worst.toExponential(2)}`);
  });

  it("matches the feature count the artifact declares", () => {
    if (!isReady(model)) return;
    for (const vector of vectors) {
      expect(vector.features.length).toBe(model.features.length);
    }
  });
});

describe("isotonic calibration", () => {
  it("clips outside the fitted range rather than extrapolating", () => {
    const calibration = { x: [0.1, 0.5, 0.9], y: [0.05, 0.4, 0.95] };
    expect(applyCalibration(calibration, 0.0)).toBe(0.05);
    expect(applyCalibration(calibration, 1.0)).toBe(0.95);
  });

  it("interpolates linearly between thresholds", () => {
    const calibration = { x: [0, 1], y: [0, 1] };
    expect(applyCalibration(calibration, 0.25)).toBeCloseTo(0.25, 12);
  });

  it("never returns a value outside zero and one", () => {
    if (!isReady(model)) return;
    for (const target of ["long_stay_60d", "adopted_within_30d"] as const) {
      const { calibration } = model.targets[target];
      for (const probe of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
        const value = applyCalibration(calibration, probe);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
