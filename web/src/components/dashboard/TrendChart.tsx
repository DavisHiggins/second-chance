"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import ChartFrame from "@/components/charts/ChartFrame";
import { DASHBOARD } from "@/lib/content";
import { formatMonth, formatPercent } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/austin/metrics";

/**
 * Intakes and adoptions by month, from the current feeds.
 *
 * Both series are drawn together because either alone is misleading. A month
 * with fewer adoptions might be a bad month, or it might be a quiet one, and
 * only the pair distinguishes them. They are two event counts, not one
 * cohort: the lines may involve different animals, so no rate is derived by
 * dividing them. The first month of the feed and the current month are
 * partial; the current one is drawn and shaded so the drop at the end reads
 * as an unfinished month rather than a collapse.
 */
export function TrendChart({ months }: { months: MonthlyPoint[] }) {
  const reducedMotion = useReducedMotion();

  // The feed starts mid-month, so its first month is dropped. The current
  // month is kept and marked partial.
  const series = months.slice(1).map((point) => ({ ...point, label: formatMonth(point.month) }));

  if (series.length < 3) {
    return (
      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        Not enough complete months in the current feeds to draw a trend yet.
      </p>
    );
  }

  const complete = series.filter((p) => !p.partial);
  const first = complete[0];
  const last = complete[complete.length - 1];
  const partial = series.find((p) => p.partial);
  const summary = `Monthly intakes and adoptions from ${first.label} to ${last.label}. Intakes moved from ${first.intakes} to ${last.intakes}; adoptions from ${first.adoptions} to ${last.adoptions}.${
    partial ? ` ${partial.label} is a partial month.` : ""
  }`;

  return (
    <ChartFrame
      title={DASHBOARD.trendTitle}
      subtitle={DASHBOARD.trendSubtitle}
      summary={summary}
      height={280}
      note="Intakes are counted by arrival month and adoptions by outcome month. They can involve different animals, so the lines are not a rate; the 30-day adoption rate is a separate cohort figure."
      table={{
        caption: "Monthly intakes, adoptions, median days to adoption and 30-day adoption rate of arrivals",
        columns: ["Month", "Intakes", "Adoptions", "Median days to adoption", "Adopted within 30 days of arrival"],
        rows: series.map((point) => [
          `${point.label}${point.partial ? " (partial)" : ""}`,
          point.intakes,
          point.adoptions,
          point.medianDaysToAdoption === null ? "not measured" : point.medianDaysToAdoption.toFixed(1),
          point.adoptedWithin30dRate === null
            ? "not yet observable"
            : `${formatPercent(point.adoptedWithin30dRate)} of ${point.eligible30d}`,
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          {partial ? (
            <ReferenceArea
              x1={partial.label}
              x2={partial.label}
              fill="var(--surface-sunken)"
              fillOpacity={0.9}
              label={{ value: "partial", position: "insideTop", fill: "var(--ink-muted)", fontSize: 11 }}
            />
          ) : null}
          <XAxis
            dataKey="label"
            stroke="var(--axis-line)"
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke="var(--axis-line)"
            tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            label={{ value: "events", angle: -90, position: "insideLeft", fill: "var(--ink-muted)", fontSize: 11, dx: 18 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-md)",
              color: "var(--ink-primary)",
              fontSize: 13,
              boxShadow: "var(--elev-2)",
            }}
            labelStyle={{ color: "var(--ink-secondary)" }}
            formatter={(value, name) => [value, name]}
            labelFormatter={(label) => {
              const point = series.find((p) => p.label === label);
              return point?.partial ? `${label} (partial month)` : String(label);
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "var(--ink-secondary)", paddingTop: 8 }}
            iconType="plainline"
          />
          <Line
            type="monotone"
            dataKey="intakes"
            name="Intakes"
            stroke="var(--series-3)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={!reducedMotion}
            animationDuration={600}
          />
          <Line
            type="monotone"
            dataKey="adoptions"
            name="Adoptions"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={!reducedMotion}
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default TrendChart;
