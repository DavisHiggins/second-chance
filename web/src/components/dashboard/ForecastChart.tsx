"use client";

import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartFrame from "@/components/charts/ChartFrame";
import { DASHBOARD } from "@/lib/content";
import { formatCount, formatDate, formatNumber } from "@/lib/format";
import type { Forecast } from "@/types/api";

interface Row {
  t: number;
  label: string;
  historic: number | null;
  central: number | null;
  band: [number, number] | null;
}

function toTime(value: string): number {
  const iso = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function ForecastChart({ forecast, dataAsOf }: { forecast: Forecast; dataAsOf: string }) {
  const reducedMotion = useReducedMotion();

  const rows = useMemo<Row[]>(() => {
    const history: Row[] = forecast.history.map((point) => ({
      t: toTime(point.month),
      label: point.month,
      historic: point.census,
      central: null,
      band: null,
    }));
    const projection: Row[] = forecast.forecast.map((point) => ({
      t: toTime(point.date),
      label: point.date,
      historic: null,
      central: point.central,
      band: [point.low, point.high] as [number, number],
    }));
    // The last observed point carries the forecast values too, so the dashed
    // line starts where the solid line ends instead of floating.
    const last = history[history.length - 1];
    if (last) {
      last.central = last.historic;
      last.band = [last.historic ?? 0, last.historic ?? 0];
    }
    return [...history, ...projection].sort((a, b) => a.t - b.t);
  }, [forecast]);

  const todayT = toTime(dataAsOf);
  const capacity = forecast.capacity_reference;
  const isNaive = forecast.method === "seasonal_naive";

  // Where the interval first crosses the capacity line, that crossing is the
  // thing worth labelling. Where it never does, there is nothing to label.
  const crossing = forecast.forecast.find((point) => point.high >= capacity) ?? null;

  const values = rows.flatMap((row) => [
    row.historic ?? Number.NaN,
    row.central ?? Number.NaN,
    row.band?.[0] ?? Number.NaN,
    row.band?.[1] ?? Number.NaN,
  ]);
  const finite = values.filter((value) => Number.isFinite(value));
  const yMin = Math.floor((Math.min(...finite) - 40) / 50) * 50;
  const yMax = Math.ceil((Math.max(...finite, capacity) + 40) / 50) * 50;

  const last = forecast.forecast[forecast.forecast.length - 1];
  const summary = `Shelter population from ${formatDate(
    `${forecast.history[0]?.month}-01`,
  )} to ${formatDate(last?.date)}, with a 30-day projection. Population is projected to reach ${formatNumber(
    last?.central,
    0,
  )} by ${formatDate(last?.date)}, with an 80 percent interval from ${formatNumber(
    last?.low,
    0,
  )} to ${formatNumber(last?.high, 0)}. ${
    crossing
      ? `The interval first reaches typical operating capacity on ${formatDate(crossing.date)}.`
      : "The interval stays below typical operating capacity for the whole projection."
  }`;

  return (
    <ChartFrame
      title={DASHBOARD.forecastTitle}
      subtitle={isNaive ? DASHBOARD.forecastSubtitleNaive : DASHBOARD.forecastSubtitleModel}
      summary={summary}
      height={320}
      legend={
        <ul className="t-caption flex flex-wrap items-center gap-4" style={{ color: "var(--ink-secondary)" }}>
          <li className="flex items-center gap-2">
            <svg width="18" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Observed census
          </li>
          <li className="flex items-center gap-2">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke="var(--series-1)"
                strokeWidth="2"
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            </svg>
            Projection
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-4 rounded-[2px]"
              style={{ background: "var(--series-1)", opacity: 0.12 }}
            />
            80 percent interval
          </li>
          <li className="flex items-center gap-2">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke="var(--ink-muted)"
                strokeWidth="1.5"
                strokeDasharray="2 3"
              />
            </svg>
            {DASHBOARD.forecastCapacityLine}
          </li>
        </ul>
      }
      table={{
        caption: `Thirty-day census projection, ${forecast.method.replace(/_/g, " ")} method.`,
        columns: ["Date", "Central", "Low", "High"],
        rows: forecast.forecast.map((point) => [
          formatDate(point.date),
          formatNumber(point.central, 0),
          formatNumber(point.low, 0),
          formatNumber(point.high, 0),
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid-line)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => formatDate(new Date(value).toISOString())}
            tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
            stroke="var(--axis-line)"
            minTickGap={48}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis-line)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0]?.payload as Row | undefined;
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
                  <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
                    {row.label.length === 7 ? row.label : formatDate(row.label)}
                  </p>
                  <p className="tabular">
                    {row.historic !== null
                      ? `${formatCount(Math.round(row.historic))} animals in care`
                      : `${formatCount(Math.round(row.central ?? 0))} animals projected`}
                  </p>
                  {row.historic === null && row.band ? (
                    <p className="t-caption tabular" style={{ color: "var(--ink-secondary)" }}>
                      {`80 percent interval ${formatCount(Math.round(row.band[0]))} to ${formatCount(
                        Math.round(row.band[1]),
                      )}`}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--series-1)"
            fillOpacity={0.12}
            isAnimationActive={!reducedMotion}
            animationDuration={420}
            connectNulls
          />
          <Line
            dataKey="historic"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            isAnimationActive={!reducedMotion}
            animationDuration={420}
            connectNulls
          />
          <Line
            dataKey="central"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={!reducedMotion}
            animationDuration={420}
            connectNulls
          />
          <ReferenceLine
            y={capacity}
            stroke="var(--ink-muted)"
            strokeDasharray="2 4"
            label={{
              value: DASHBOARD.forecastCapacityLine,
              position: "insideTopLeft",
              fill: "var(--ink-muted)",
              fontSize: 11.5,
            }}
          />
          <ReferenceLine
            x={todayT}
            stroke="var(--axis-line)"
            label={{
              value: "Today",
              position: "top",
              fill: "var(--ink-secondary)",
              fontSize: 11.5,
            }}
          />
          {crossing ? (
            <ReferenceLine
              x={toTime(crossing.date)}
              stroke="var(--status-warning)"
              label={{
                value: `Interval reaches capacity ${formatDate(crossing.date)}`,
                position: "insideTopRight",
                fill: "var(--ink-secondary)",
                fontSize: 11.5,
              }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export default ForecastChart;
