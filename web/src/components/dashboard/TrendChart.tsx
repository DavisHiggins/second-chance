"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import ChartFrame from "@/components/charts/ChartFrame";
import { DASHBOARD } from "@/lib/content";
import type { MonthlyPoint } from "@/lib/austin/metrics";

/**
 * Intakes and adoptions by month, from the current feeds.
 *
 * Both series are drawn together because either alone is misleading. A month
 * with fewer adoptions might be a bad month, or it might be a quiet one, and
 * only the pair distinguishes them.
 */
export function TrendChart({ months }: { months: MonthlyPoint[] }) {
  const reducedMotion = useReducedMotion();

  // The first and last months of a feed are partial by definition: the feed
  // starts mid-month and today is mid-month. Drawing them makes the series
  // look like it collapses at both ends.
  const series = months.slice(1, -1);

  if (series.length < 2) {
    return (
      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        Not enough complete months in the current feeds to draw a trend yet.
      </p>
    );
  }

  const summary = (() => {
    const first = series[0];
    const last = series[series.length - 1];
    return `Monthly intakes and adoptions from ${first.month} to ${last.month}. Intakes moved from ${first.intakes} to ${last.intakes}; adoptions from ${first.adoptions} to ${last.adoptions}.`;
  })();

  return (
    <ChartFrame
      title={DASHBOARD.trendTitle}
      subtitle={DASHBOARD.trendSubtitle}
      summary={summary}
      height={260}
      table={{
        caption: "Monthly intakes, adoptions and median days to adoption",
        columns: ["Month", "Intakes", "Adoptions", "Median days to adoption"],
        rows: series.map((point) => [
          point.month,
          point.intakes,
          point.adoptions,
          point.medianDaysToAdoption === null ? "not measured" : point.medianDaysToAdoption.toFixed(1),
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="month"
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
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-md)",
              color: "var(--ink-primary)",
              fontSize: 13,
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
            animationDuration={700}
          />
          <Line
            type="monotone"
            dataKey="adoptions"
            name="Adoptions"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={!reducedMotion}
            animationDuration={700}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default TrendChart;
