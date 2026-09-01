"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ErrorBar, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { formatLabel, formatMetric } from "@/lib/format";
import type { TargetBlock } from "@/types/api";

/** Slots are assigned in order and never cycled. */
const MODEL_SLOTS: Array<{ key: string; label: string; color: string }> = [
  { key: "logistic", label: "Logistic", color: "var(--series-1)" },
  { key: "lightgbm", label: "LightGBM (champion)", color: "var(--series-2)" },
  { key: "xgboost", label: "XGBoost", color: "var(--series-3)" },
  { key: "prior", label: "Base rate", color: "var(--series-4)" },
];

const TARGET_LABEL: Record<string, string> = {
  adopted_within_7d: "Adopted in 7 days",
  adopted_within_14d: "Adopted in 14 days",
  adopted_within_30d: "Adopted in 30 days",
  long_stay_60d: "Still here at 60 days",
};

interface Row {
  target: string;
  [key: string]: string | number | [number, number] | undefined;
}

export function AucByTarget({ targets }: { targets: Record<string, TargetBlock> }) {
  const reducedMotion = useReducedMotion();

  const rows: Row[] = Object.entries(targets).map(([name, block]) => {
    const row: Row = { target: TARGET_LABEL[name] ?? formatLabel(name) };
    for (const slot of MODEL_SLOTS) {
      const metrics = block.models[slot.key]?.test_calibrated;
      if (!metrics?.roc_auc) continue;
      row[slot.key] = metrics.roc_auc;
      if (metrics.roc_auc_ci) {
        row[`${slot.key}_err`] = [
          metrics.roc_auc - metrics.roc_auc_ci[0],
          metrics.roc_auc_ci[1] - metrics.roc_auc,
        ];
      }
    }
    return row;
  });

  const summary = rows
    .map((row) =>
      `${row.target}: ${MODEL_SLOTS.filter((slot) => typeof row[slot.key] === "number")
        .map((slot) => `${slot.label} ${formatMetric(row[slot.key] as number)}`)
        .join(", ")}`,
    )
    .join(". ");

  return (
    <ChartFrame
      title="Discrimination by target and model"
      subtitle="Held-out AUC with the bootstrap interval. Every model is calibrated before scoring."
      summary={`Area under the ROC curve by target and model. ${summary}.`}
      height={320}
      table={{
        caption: "Held-out AUC by target and model, calibrated predictions, test block n = 20,165.",
        columns: ["Target", ...MODEL_SLOTS.map((slot) => slot.label)],
        rows: rows.map((row) => [
          String(row.target),
          ...MODEL_SLOTS.map((slot) =>
            typeof row[slot.key] === "number" ? formatMetric(row[slot.key] as number) : "not measured",
          ),
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="target"
            tick={{ fill: "var(--ink-secondary)", fontSize: 11.5 }}
            stroke="var(--axis-line)"
            interval={0}
          />
          <YAxis
            domain={[0.4, 0.9]}
            tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: "var(--surface-sunken)" }}
            formatter={(value: unknown, name: unknown) => [formatMetric(Number(value)), String(name)]}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-md)",
              color: "var(--ink-primary)",
              fontSize: 13,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11.5, color: "var(--ink-secondary)" }}
            iconType="square"
          />
          {MODEL_SLOTS.map((slot) => (
            <Bar
              key={slot.key}
              dataKey={slot.key}
              name={slot.label}
              fill={slot.color}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={240}
            >
              <ErrorBar
                dataKey={`${slot.key}_err`}
                width={4}
                strokeWidth={1.5}
                stroke="var(--ink-secondary)"
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default AucByTarget;
