import {
  formatCount,
  formatMetric,
  formatMultiplier,
  formatPercent,
  formatSigned,
  NOT_MEASURED,
} from "@/lib/format";
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
 * Every cell is read from the published file. There is no constant in this
 * component that a reader could mistake for a measurement.
 */

interface Row {
  id: string;
  label: string;
  gloss: string;
  render: (metrics: TargetMetricsShape) => string;
}

const ROWS: Row[] = [
  {
    id: "n",
    label: "Stays evaluated",
    gloss: "Completed stays in the held-out block. None were seen during training.",
    render: (m) => formatCount(m.n),
  },
  {
    id: "positive-rate",
    label: "How often it actually happened",
    gloss: "The base rate. Any model has to beat this to be worth anything.",
    render: (m) => formatPercent(m.positiveRate, 1),
  },
  {
    id: "roc-auc",
    label: "Discrimination (ROC AUC)",
    gloss:
      "Take one stay where it happened and one where it did not. This is how often the model ranks them the right way round. 0.5 is a coin toss.",
    render: (m) => (m.rocAuc === null ? NOT_MEASURED : formatMetric(m.rocAuc)),
  },
  {
    id: "pr-auc",
    label: "Precision–recall AUC",
    gloss:
      "The same question asked in a way that stays honest when the outcome is rare, which ROC AUC does not.",
    render: (m) => (m.prAuc === null ? NOT_MEASURED : formatMetric(m.prAuc)),
  },
  {
    id: "ece",
    label: "Calibration error (ECE)",
    gloss:
      "The average gap between a stated percentage and what actually happened at that percentage. Smaller means the number on screen means what it says.",
    render: (m) => (m.ece === null ? NOT_MEASURED : formatMetric(m.ece)),
  },
  {
    id: "calibration-slope",
    label: "Calibration slope",
    gloss:
      "1.0 is perfect. Below 1 the model is too confident at both ends; above 1 it is too timid.",
    render: (m) => (m.calibrationSlope === null ? NOT_MEASURED : formatMetric(m.calibrationSlope)),
  },
  {
    id: "calibration-intercept",
    label: "Calibration intercept",
    gloss: "0 is perfect. A positive value means the model systematically predicts too high.",
    render: (m) =>
      m.calibrationIntercept === null ? NOT_MEASURED : formatSigned(m.calibrationIntercept, 3),
  },
  {
    id: "brier",
    label: "Brier score",
    gloss: "Squared error of the probabilities themselves. Lower is better.",
    render: (m) => (m.brier === null ? NOT_MEASURED : formatMetric(m.brier)),
  },
  {
    id: "log-loss",
    label: "Log loss",
    gloss: "Penalises confident mistakes hardest. Lower is better.",
    render: (m) => (m.logLoss === null ? NOT_MEASURED : formatMetric(m.logLoss)),
  },
  {
    id: "precision-50",
    label: "Precision in the top 50",
    gloss:
      "Of the 50 animals the model would put at the top of the queue, the share the outcome actually happened to.",
    render: (m) => (m.precisionAt50 === null ? NOT_MEASURED : formatPercent(m.precisionAt50, 1)),
  },
  {
    id: "lift-50",
    label: "Lift in the top 50",
    gloss: "How much better that top 50 is than 50 animals picked at random.",
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
      <table className="w-full border-collapse">
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
                <span
                  className="t-caption mt-0.5 block max-w-[52ch]"
                  style={{ color: "var(--ink-muted)" }}
                >
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
