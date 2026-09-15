import {
  formatCount,
  formatMetric,
  formatMultiplier,
  formatPercent,
  formatPp,
  NOT_MEASURED,
} from "@/lib/format";
import { metric, type MetricId } from "@/lib/metrics/registry";
import type { TargetMetrics as TargetMetricsShape } from "@/lib/model/artifact";

/**
 * Both prediction targets, side by side, straight from the artifact.
 *
 * Discrimination and calibration are adjacent rather than in separate panels
 * on purpose. The archive study documented a model whose ranking held for two
 * years while its probabilities drifted twelve points from reality; a page
 * that reports AUC prominently and buries calibration error would have called
 * that model healthy the entire time.
 *
 * Every cell is read from the published file, and every gloss is read from
 * the shared metric registry, so the wording here cannot drift from the
 * drawer or the dashboard. The calibration line's convention is the one the
 * training script actually fits: observed = intercept + slope × predicted on
 * decile means, on the probability scale.
 */

interface Row {
  id: string;
  metricId: MetricId | null;
  label: string;
  gloss: string;
  render: (metrics: TargetMetricsShape) => string;
}

const ROWS: Row[] = [
  {
    id: "n",
    metricId: null,
    label: "Stays evaluated",
    gloss: "Stays in the held-out block with an observable outcome. None were seen during training.",
    render: (m) => formatCount(m.n),
  },
  {
    id: "positive-rate",
    metricId: null,
    label: "How often it actually happened",
    gloss: "The base rate. Any model has to beat this to be worth anything, and average precision should be read against it.",
    render: (m) => formatPercent(m.positiveRate, 1),
  },
  {
    id: "roc-auc",
    metricId: "roc-auc",
    label: "Discrimination (ROC AUC)",
    gloss: metric("roc-auc").meaning + " 0.5 is chance; 0.694 is not 69.4% accuracy.",
    render: (m) => (m.rocAuc === null ? NOT_MEASURED : formatMetric(m.rocAuc)),
  },
  {
    id: "pr-auc",
    metricId: "pr-auc",
    label: "Average precision",
    gloss:
      "Precision against recall as the threshold moves, summarised as average precision (not trapezoidal PR area). Compare it with the base rate above: that is roughly what no skill would score. It asks a different question from ROC AUC — how concentrated true cases are at the top — rather than the same question asked honestly.",
    render: (m) => (m.prAuc === null ? NOT_MEASURED : formatMetric(m.prAuc)),
  },
  {
    id: "ece",
    metricId: "ece",
    label: "Calibration error (ECE)",
    gloss:
      "Weighted average gap between predicted and observed rates across ten probability bins. 0.047 is about 4.7 percentage points on this evaluation, not a ±4.7-point interval on any single animal.",
    render: (m) => (m.ece === null ? NOT_MEASURED : formatMetric(m.ece)),
  },
  {
    id: "calibration-slope",
    metricId: "calibration-line",
    label: "Calibration slope",
    gloss:
      "Slope of observed rate against predicted rate across deciles; 1.0 is ideal. Below 1 the predictions are more spread out than the outcomes (too confident at the extremes); above 1, less spread.",
    render: (m) => (m.calibrationSlope === null ? NOT_MEASURED : formatMetric(m.calibrationSlope)),
  },
  {
    id: "calibration-intercept",
    metricId: "calibration-line",
    label: "Calibration intercept",
    gloss:
      "Where that line crosses zero predicted probability; 0 is ideal. Under this fit (observed = intercept + slope × predicted), a positive intercept means observed rates sit above predictions at the low end, so predictions there are too low, not too high. Read with the slope, not alone.",
    render: (m) => (m.calibrationIntercept === null ? NOT_MEASURED : formatPp(m.calibrationIntercept, 2)),
  },
  {
    id: "brier",
    metricId: "brier",
    label: "Brier score",
    gloss: "Average squared error of the probabilities. Lower is better in a comparable population; it reflects ranking as well as calibration.",
    render: (m) => (m.brier === null ? NOT_MEASURED : formatMetric(m.brier)),
  },
  {
    id: "log-loss",
    metricId: "log-loss",
    label: "Log loss",
    gloss: "Penalises confident mistakes hardest. Lower is better on the same problem. Not a percentage.",
    render: (m) => (m.logLoss === null ? NOT_MEASURED : formatMetric(m.logLoss)),
  },
  {
    id: "precision-50",
    metricId: "precision-at-50",
    label: "Precision in the top 50",
    gloss:
      "Of the 50 highest-ranked stays in the evaluation block, the share the outcome actually happened to (36% is 18 of 50). Historical evaluation, not demonstrated outreach success.",
    render: (m) => (m.precisionAt50 === null ? NOT_MEASURED : formatPercent(m.precisionAt50, 1)),
  },
  {
    id: "lift-50",
    metricId: "lift-at-50",
    label: "Lift in the top 50",
    gloss:
      "That precision divided by the base rate. It describes how concentrated the outcome is at the top of the ranking; it does not mean the tool causes that many more adoptions.",
    render: (m) => (m.liftAt50 === null ? NOT_MEASURED : formatMultiplier(m.liftAt50, 2)),
  },
];

export function TargetMetrics({
  columns,
  caption,
}: {
  columns: { id: string; label: string; metrics: TargetMetricsShape }[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 560 }}>
        <caption className="t-small pb-3 text-left" style={{ color: "var(--ink-secondary)" }}>
          {caption}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="t-caption border-b px-2 py-2 text-left"
              style={{ borderColor: "var(--border-hairline)", color: "var(--ink-muted)" }}
            >
              Measure
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="t-caption border-b px-2 py-2 text-right"
                style={{ borderColor: "var(--border-hairline)", color: "var(--ink-muted)" }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="border-b px-2 py-3 text-left align-top"
                style={{ borderColor: "var(--border-hairline)" }}
              >
                <span className="t-small block font-medium" style={{ color: "var(--ink-primary)" }}>
                  {row.label}
                </span>
                <span className="t-caption mt-0.5 block max-w-[56ch] font-normal" style={{ color: "var(--ink-muted)" }}>
                  {row.gloss}
                </span>
              </th>
              {columns.map((column) => (
                <td
                  key={column.id}
                  className="t-small tabular border-b px-2 text-right align-top"
                  style={{
                    borderColor: "var(--border-hairline)",
                    color: "var(--ink-primary)",
                    paddingTop: "0.75rem",
                  }}
                >
                  {row.render(column.metrics)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TargetMetrics;
