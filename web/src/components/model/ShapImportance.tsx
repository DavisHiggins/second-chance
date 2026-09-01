"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { formatMetric } from "@/lib/format";
import type { ShapRow } from "@/types/api";

export function ShapImportance({ rows, target }: { rows: ShapRow[]; target: string }) {
  const reducedMotion = useReducedMotion();
  const data = rows
    .slice()
    .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
    .map((row) => ({ feature: row.feature, value: row.mean_abs_shap, direction: row.direction }));

  const summary = `Mean absolute SHAP contribution by feature for ${target}. ${data
    .map((row) => `${row.feature}: ${formatMetric(row.value, 3)}`)
    .join(". ")}.`;

  return (
    <ChartFrame
      title="What the model keys on"
      subtitle={`Mean absolute SHAP contribution, ${target}. Larger means the feature moves the prediction more, in either direction.`}
      summary={summary}
      height={340}
      table={{
        caption: `Top SHAP features for ${target}, sampled from the held-out test block.`,
        columns: ["Feature", "Mean absolute SHAP", "Average direction"],
        rows: data.map((row) => [
          row.feature,
          formatMetric(row.value, 4),
          row.direction >= 0 ? "raises the prediction" : "lowers the prediction",
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
          <XAxis type="number" hide domain={[0, Math.max(...data.map((row) => row.value)) * 1.25]} />
          <YAxis
            type="category"
            dataKey="feature"
            width={180}
            tick={{ fill: "var(--ink-secondary)", fontSize: 11.5 }}
            axisLine={{ stroke: "var(--axis-line)" }}
            tickLine={false}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: "var(--surface-sunken)" }}
            formatter={(value: unknown) => formatMetric(Number(value), 4)}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-md)",
              color: "var(--ink-primary)",
              fontSize: 13,
            }}
          />
          <Bar
            dataKey="value"
            fill="var(--ramp-450)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={!reducedMotion}
            animationDuration={240}
          >
            <LabelList
              dataKey="value"
              position="right"
              formatter={(value: unknown) => formatMetric(Number(value), 3)}
              style={{ fill: "var(--ink-secondary)", fontSize: 11.5 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default ShapImportance;
