"use client";

import { useReducedMotion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { formatMultiplier, formatPercent } from "@/lib/format";
import type { ModelMetrics } from "@/types/api";

/**
 * Precision at k for the long-stay queue. The results file exports three values
 * of k, so three points are what this draws; the caption says so rather than
 * interpolating a curve that was never measured.
 */
export function PrecisionAtK({
  metrics,
  baseRate,
}: {
  metrics: ModelMetrics | undefined;
  baseRate: number;
}) {
  const reducedMotion = useReducedMotion();

  const rows = [
    { k: 20, precision: metrics?.precision_at_20 ?? null, lift: metrics?.lift_at_20 ?? null },
    { k: 50, precision: metrics?.precision_at_50 ?? null, lift: metrics?.lift_at_50 ?? null },
    { k: 100, precision: metrics?.precision_at_100 ?? null, lift: metrics?.lift_at_100 ?? null },
  ].filter((row) => row.precision !== null);

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--surface-sunken)" }}>
        <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
          Precision at k is not measured in this results file.
        </p>
      </div>
    );
  }

  const summary = `Precision at k for the long-stay queue against a base rate of ${formatPercent(
    baseRate,
  )}. ${rows
    .map((row) => `Top ${row.k}: ${formatPercent(row.precision)} precision, ${formatMultiplier(row.lift, 2)} lift`)
    .join(". ")}.`;

  return (
    <ChartFrame
      title="Precision at the top of the queue"
      subtitle="Of the top k animals the model flags, the share who really did become long-stay residents."
      summary={summary}
      height={260}
      table={{
        caption: "Precision and lift at k for the long-stay target, held-out test block.",
        columns: ["Top k", "Precision", "Lift over base rate"],
        rows: rows.map((row) => [row.k, formatPercent(row.precision), formatMultiplier(row.lift, 2)]),
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="k"
            type="number"
            domain={[0, 120]}
            ticks={rows.map((row) => row.k)}
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
            formatter={(value: unknown) => formatPercent(Number(value))}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-md)",
              color: "var(--ink-primary)",
              fontSize: 13,
            }}
          />
          <ReferenceLine
            y={baseRate}
            stroke="var(--ink-muted)"
            strokeDasharray="3 3"
            label={{
              value: `Base rate ${formatPercent(baseRate)}`,
              position: "insideBottomRight",
              fill: "var(--ink-muted)",
              fontSize: 11.5,
            }}
          />
          <Line
            dataKey="precision"
            name="Precision"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface-card)", strokeWidth: 2 }}
            isAnimationActive={!reducedMotion}
            animationDuration={420}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default PrecisionAtK;
