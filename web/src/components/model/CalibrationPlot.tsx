"use client";

import { useReducedMotion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { formatCount, formatPercent } from "@/lib/format";
import type { CalibrationDecile } from "@/types/api";

/**
 * The results file exports calibration by decile rather than a fifteen-bin
 * reliability curve, so ten bins are what this draws and the caption says so.
 * The diagonal is drawn first, because a reference should arrive before the
 * thing it is a reference for.
 */
export function CalibrationPlot({ deciles }: { deciles: CalibrationDecile[] }) {
  const reducedMotion = useReducedMotion();

  if (deciles.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-md)] px-4 py-3"
        style={{ background: "var(--surface-sunken)" }}
      >
        <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
          Calibration by bin is not measured in this results file.
        </p>
      </div>
    );
  }

  const rows = deciles.map((decile) => ({
    predicted: decile.mean_predicted_30d,
    observed: decile.observed_cif_30d,
    reference: decile.mean_predicted_30d,
    n: decile.n,
    decile: decile.decile,
  }));

  const summary = `Predicted against observed 30-day adoption, ten bins. ${rows
    .map(
      (row) =>
        `Bin ${row.decile}: predicted ${formatPercent(row.predicted)}, observed ${formatPercent(
          row.observed,
        )}`,
    )
    .join(". ")}.`;

  return (
    <ChartFrame
      title="Calibration"
      subtitle="Predicted chance against what actually happened, in ten equal-sized bins. A perfectly calibrated model sits on the diagonal."
      summary={summary}
      height={300}
      legend={
        <ul className="t-caption flex flex-wrap gap-4" style={{ color: "var(--ink-secondary)" }}>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--series-1)" }}
            />
            Observed
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--ink-muted)" }}
            />
            Perfect calibration
          </li>
        </ul>
      }
      table={{
        caption:
          "Survival model 30-day calibration by decile of predicted risk, held-out test block.",
        columns: ["Bin", "Animals", "Mean predicted", "Observed"],
        rows: rows.map((row) => [
          row.decile,
          formatCount(row.n),
          formatPercent(row.predicted, 1),
          formatPercent(row.observed, 1),
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="predicted"
            type="number"
            domain={[0, 1]}
            tickFormatter={(value: number) => formatPercent(value)}
            tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
            stroke="var(--axis-line)"
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(value: number) => formatPercent(value)}
            tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            isAnimationActive={false}
            formatter={(value: unknown, name: unknown) => [formatPercent(Number(value), 1), String(name)]}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-md)",
              color: "var(--ink-primary)",
              fontSize: 13,
            }}
          />
          <Line
            dataKey="reference"
            name="Perfect calibration"
            stroke="var(--ink-muted)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={!reducedMotion}
            animationDuration={160}
          />
          <Line
            dataKey="observed"
            name="Observed"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface-card)", strokeWidth: 2 }}
            isAnimationActive={!reducedMotion}
            animationDuration={420}
            animationBegin={160}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default CalibrationPlot;
