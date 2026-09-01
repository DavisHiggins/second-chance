"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { DASHBOARD } from "@/lib/content";
import { formatCount, formatLabel, formatNumber } from "@/lib/format";
import type { Segment } from "@/types/api";

/** Ordinal ramp: on light it starts no lighter than step 250. */
const ORDINAL_RAMP = [
  "var(--ramp-250)",
  "var(--ramp-300)",
  "var(--ramp-400)",
  "var(--ramp-500)",
  "var(--ramp-600)",
  "var(--ramp-700)",
];

export function SegmentBars({ segments }: { segments: Segment[] }) {
  const reducedMotion = useReducedMotion();
  const ordered = segments.slice().sort((a, b) => b.median_expected_days - a.median_expected_days);
  const rows = ordered.map((segment, index) => ({
    level: formatLabel(segment.level),
    days: segment.median_expected_days,
    n: segment.n,
    // Darkest step goes to the longest wait: the ramp carries the ordering.
    color: ORDINAL_RAMP[ORDINAL_RAMP.length - 1 - Math.min(index, ORDINAL_RAMP.length - 1)],
  }));

  const summary = `${DASHBOARD.segmentsSubtitle}. ${rows
    .map((row) => `${row.level}: ${formatNumber(row.days, 1)} days`)
    .join(". ")}.`;

  return (
    <ChartFrame
      title={DASHBOARD.segmentsTitle}
      subtitle={DASHBOARD.segmentsSubtitle}
      summary={summary}
      height={260}
      table={{
        caption: "Median predicted days to adoption by life stage, held-out test block.",
        columns: ["Life stage", "Median days", "Animals"],
        rows: rows.map((row) => [row.level, formatNumber(row.days, 1), formatCount(row.n)]),
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide domain={[0, Math.max(...rows.map((r) => r.days)) * 1.2]} />
          <YAxis
            type="category"
            dataKey="level"
            width={104}
            tick={{ fill: "var(--ink-secondary)", fontSize: 13 }}
            axisLine={{ stroke: "var(--axis-line)" }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0]?.payload as (typeof rows)[number] | undefined;
              if (!row) return null;
              return (
                <div
                  className="t-small rounded-[var(--radius-md)] border px-3 py-2"
                  style={{
                    background: "var(--surface-raised)",
                    borderColor: "var(--border-hairline)",
                    boxShadow: "var(--elev-2)",
                    color: "var(--ink-primary)",
                  }}
                >
                  <p>{row.level}</p>
                  <p className="tabular">{`${formatNumber(row.days, 1)} median days`}</p>
                  <p className="t-caption tabular" style={{ color: "var(--ink-secondary)" }}>
                    {`${formatCount(row.n)} animals`}
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="days"
            radius={[0, 4, 4, 0]}
            isAnimationActive={!reducedMotion}
            animationDuration={240}
          >
            {rows.map((row) => (
              <Cell key={row.level} fill={row.color} />
            ))}
            <LabelList
              dataKey="days"
              position="right"
              formatter={(value: unknown) => `${formatNumber(Number(value), 1)} days`}
              style={{ fill: "var(--ink-secondary)", fontSize: 11.5 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default SegmentBars;
