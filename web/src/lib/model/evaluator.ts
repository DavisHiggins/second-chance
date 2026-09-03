/**
 * A LightGBM gradient-boosted tree evaluator, in plain TypeScript.
 *
 * This exists so predictions can be served with no inference infrastructure.
 * Training happens offline in Python; the model is exported as a JSON tree
 * dump and committed, and this walks it. There is no SageMaker endpoint, no
 * Python at request time, no binary artifact, and the model that ships is a
 * diffable file a reviewer can read.
 *
 * The training script restricts itself to numeric features precisely so this
 * file can stay small and exact: only `<=` splits, only a default direction
 * for missing values. Categorical splits would need bitset decoding and are a
 * parity risk for no benefit, since categories are one-hot encoded upstream.
 */

export interface TreeLeaf {
  leaf_value: number;
}

export interface TreeSplit {
  split_feature: number;
  threshold: number;
  /** LightGBM emits "<=" for numeric splits. Anything else is unsupported. */
  decision_type: string;
  /** Where a NaN goes when missing_type allows it. */
  default_left: boolean;
  missing_type: string;
  left_child: TreeNode;
  right_child: TreeNode;
}

export type TreeNode = TreeLeaf | TreeSplit;

export interface TreeInfo {
  tree_structure: TreeNode;
  shrinkage?: number;
}

export interface BoosterDump {
  feature_names: string[];
  tree_info: TreeInfo[];
  /** e.g. "binary sigmoid:1" */
  objective: string;
}

function isLeaf(node: TreeNode): node is TreeLeaf {
  return (node as TreeLeaf).leaf_value !== undefined;
}

export class UnsupportedModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedModelError";
  }
}

/**
 * Walks one tree to its leaf.
 *
 * The missing-value rule mirrors LightGBM: when the split was trained with
 * NaN as the missing type, a NaN follows `default_left`. When it was not, a
 * NaN is treated as a zero, which is what LightGBM does internally, and the
 * comparison proceeds normally.
 */
function evaluateTree(node: TreeNode, features: number[]): number {
  let current = node;

  while (!isLeaf(current)) {
    const split = current;

    if (split.decision_type !== "<=") {
      throw new UnsupportedModelError(
        `unsupported split type "${split.decision_type}"; the training export must use numeric features only`,
      );
    }

    const raw = features[split.split_feature];
    let goLeft: boolean;

    if (Number.isNaN(raw)) {
      goLeft = split.missing_type === "NaN" ? split.default_left : 0 <= split.threshold;
    } else {
      goLeft = raw <= split.threshold;
    }

    current = goLeft ? split.left_child : split.right_child;
  }

  return current.leaf_value;
}

/** Sum of leaf values across every tree: the raw margin before any link. */
export function rawScore(dump: BoosterDump, features: number[]): number {
  let total = 0;
  for (const tree of dump.tree_info) {
    total += evaluateTree(tree.tree_structure, features);
  }
  return total;
}

function sigmoid(x: number): number {
  // Split by sign to avoid overflow on large negative margins.
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/**
 * Probability from the raw margin, honouring the sigmoid factor LightGBM
 * records in the objective string ("binary sigmoid:1").
 */
export function predictProbability(dump: BoosterDump, features: number[]): number {
  const margin = rawScore(dump, features);
  const match = /sigmoid:([0-9.]+)/.exec(dump.objective);
  const alpha = match ? Number(match[1]) : 1;
  return sigmoid(alpha * margin);
}

/* -------------------------------------------------------------------------- */
/* Isotonic calibration                                                        */
/* -------------------------------------------------------------------------- */

export interface IsotonicCalibration {
  /** sklearn IsotonicRegression.X_thresholds_ */
  x: number[];
  /** sklearn IsotonicRegression.y_thresholds_ */
  y: number[];
}

/**
 * Applies the isotonic mapping fitted on the validation block.
 *
 * This reproduces sklearn's interpolation with `out_of_bounds="clip"`: linear
 * between thresholds, flat outside them. The raw model ranks well but its
 * probabilities are not trustworthy on their own, and the archive study found
 * exactly this failure mode surviving a distribution shift while the ranking
 * held. Calibration is the part that makes a printed percentage mean anything.
 */
export function applyCalibration(calibration: IsotonicCalibration, probability: number): number {
  const { x, y } = calibration;
  if (x.length === 0) return probability;
  if (x.length === 1) return y[0];

  if (probability <= x[0]) return y[0];
  if (probability >= x[x.length - 1]) return y[y.length - 1];

  let low = 0;
  let high = x.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (x[mid] <= probability) low = mid;
    else high = mid;
  }

  const span = x[high] - x[low];
  if (span === 0) return y[low];

  const t = (probability - x[low]) / span;
  return y[low] + t * (y[high] - y[low]);
}

/** Raw model probability followed by its calibration, which is the only value
 *  the product is allowed to show as a percentage. */
export function predictCalibrated(
  dump: BoosterDump,
  calibration: IsotonicCalibration,
  features: number[],
): { raw: number; calibrated: number } {
  const raw = predictProbability(dump, features);
  return { raw, calibrated: applyCalibration(calibration, raw) };
}
