"use client";

import { useReducedMotion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { formatCount, formatMetric, formatMonth, formatSigned, NOT_MEASURED } from "@/lib/format";
import type { MonthlyPerformanceRow } from "@/types/api";

/**
 * Two charts rather than one with two axes. Ranking and calibration are on
 * different scales, and the point of this section is that they came apart: a
 * dual axis would let a reader talk themselves out of seeing it.
 */
export function MonthlyTimeline({
  rows,
  baselineAuc,
  thresholds,
  shiftDate,
}: {
  rows: MonthlyPerformanceRow[];
  baselineAuc: number | null;
  thresholds: Record<string, number>;
  shiftDate: string;
}) {
  const reducedMotion = useReducedMotion();
  const data = rows.map((row) => ({
    period: row.period,
    label: formatMonth(row.period),
    auc: row.roc_auc,
    gap: row.calibration_gap,
    n: row.n,
    status: row.status,
  }));

  const shiftPeriod = shiftDate.slice(0, 7);
  const insufficient = data.filter((row) => row.auc === null);

  const aucWarning =
    baselineAuc !== null ? baselineAuc * (1 - (thresholds.auc_relative_drop_warning ?? 0.03)) : null;
  const aucCritical =
    baselineAuc !== null ? baselineAuc * (1 - (thresholds.auc_relative_drop_critical ?? 0.07)) : null;
  const gapWarning = thresholds.calibration_gap_warning ?? 0.05;
  const gapCritical = thresholds.calibration_gap_critical ?? 0.1;

  const tooltipStyle = {
    background: "var(--surface-raised)",
    border: "1px solid var(--border-hairline)",
    borderRadius: "var(--radius-md)",
    color: "var(--ink-primary)",
    fontSize: 13,
  };

  const commonTable = data.map((row) => [
    row.label,
    formatCount(row.n),
    row.auc === null ? NOT_MEASURED : formatMetric(row.auc),
    row.gap === null ? NOT_MEASURED : formatSigned(row.gap, 3),
    row.status,
  ]);

  return (
    <div className="space-y-8">
      <ChartFrame
        title="Ranking over time"
        subtitle={`Monthly AUC on arrivals scored by the 2018-trained model. Shaded bands mark the warning and critical thresholds relative to the baseline of ${
          baselineAuc === null ? NOT_MEASURED : formatMetric(baselineAuc)
        }.`}
        summary={`Monthly AUC from ${data[0]?.label} to ${data[data.length - 1]?.label}. The ranking metric barely moves through the March 2020 shift. ${
          insufficient.length > 0
            ? `${insufficient.length} months had too few arrivals to evaluate and are left blank.`
            : ""
        }`}
        height={280}
        table={{
          caption: "Monthly performance on arrivals after the training block.",
          columns: ["Month", "Animals", "AUC", "Calibration gap", "Status"],
          rows: commonTable,
        }}
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            {aucCritical !== null && aucWarning !== null ? (
              <>
                <ReferenceArea
                  y1={0.5}
                  y2={aucCritical}
                  fill="var(--status-critical)"
                  fillOpacity={0.08}
                />
                <ReferenceArea
                  y1={aucCritical}
                  y2={aucWarning}
                  fill="var(--status-warning)"
                  fillOpacity={0.1}
                />
              </>
            ) : null}
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
              stroke="var(--axis-line)"
              minTickGap={24}
            />
            <YAxis
              domain={[0.5, 0.9]}
              tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              isAnimationActive={false}
              formatter={(value: unknown) => formatMetric(Number(value))}
              contentStyle={tooltipStyle}
            />
            <ReferenceLine
              x={formatMonth(shiftPeriod)}
              stroke="var(--ink-secondary)"
              strokeDasharray="3 3"
              label={{
                value: "Operations change",
                position: "top",
                fill: "var(--ink-secondary)",
                fontSize: 11.5,
              }}
            />
            <Line
              dataKey="auc"
              name="AUC"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--series-1)" }}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
              animationDuration={420}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Calibration over time"
        subtitle={`Predicted 30-day adoption rate minus what actually happened. Above ${formatSigned(
          gapWarning,
          2,
        )} is a warning, above ${formatSigned(gapCritical, 2)} is critical.`}
        summary={`Monthly calibration gap from ${data[0]?.label} to ${
          data[data.length - 1]?.label
        }. The gap widens sharply after March 2020 while the ranking holds.`}
        height={280}
        table={{
          caption: "Monthly calibration gap, predicted minus observed.",
          columns: ["Month", "Animals", "AUC", "Calibration gap", "Status"],
          rows: commonTable,
        }}
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            <ReferenceArea y1={gapWarning} y2={gapCritical} fill="var(--status-warning)" fillOpacity={0.1} />
            <ReferenceArea y1={gapCritical} y2={0.3} fill="var(--status-critical)" fillOpacity={0.08} />
            <ReferenceArea y1={-gapCritical} y2={-gapWarning} fill="var(--status-warning)" fillOpacity={0.1} />
            <ReferenceArea y1={-0.3} y2={-gapCritical} fill="var(--status-critical)" fillOpacity={0.08} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
              stroke="var(--axis-line)"
              minTickGap={24}
            />
            <YAxis
              domain={[-0.2, 0.2]}
              tickFormatter={(value: number) => formatSigned(value, 2)}
              tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              isAnimationActive={false}
              formatter={(value: unknown) => formatSigned(Number(value), 3)}
              contentStyle={tooltipStyle}
            />
            <ReferenceLine y={0} stroke="var(--axis-line)" />
            <ReferenceLine
              x={formatMonth(shiftPeriod)}
              stroke="var(--ink-secondary)"
              strokeDasharray="3 3"
              label={{
                value: "Operations change",
                position: "top",
                fill: "var(--ink-secondary)",
                fontSize: 11.5,
              }}
            />
            <Line
              dataKey="gap"
              name="Predicted minus observed"
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--series-2)" }}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
              animationDuration={420}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      {insufficient.length > 0 ? (
        <p className="t-small" style={{ color: "var(--ink-muted)" }}>
          {`${insufficient.length} month${
            insufficient.length === 1 ? "" : "s"
          } had too few arrivals to evaluate and are left blank rather than plotted as zero: ${insufficient
            .map((row) => row.label)
            .join(", ")}.`}
        </p>
      ) : null}
    </div>
  );
}

export default MonthlyTimeline;
