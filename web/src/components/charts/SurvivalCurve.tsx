"use client";

import { useReducedMotion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DETAIL } from "@/lib/content";
import { formatPercent } from "@/lib/format";
import type { SurvivalPoint } from "@/types/api";

/**
 * The per-animal survival curve. This export carries `null` at every horizon, so
 * the honest state is the one that ships: the card says the curve was not
 * exported rather than drawing a flat line at zero.
 */
export function SurvivalCurve({
  points,
  height = 180,
}: {
  points: SurvivalPoint[];
  height?: number;
}) {
  const reducedMotion = useReducedMotion();
  const measured = points.filter((point) => point.still_in_shelter !== null);

  if (measured.length === 0) {
    return (
      <div
        className="flex items-center rounded-[var(--radius-md)] px-4 py-3"
        style={{ background: "var(--surface-sunken)", minHeight: 72 }}
      >
        <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
          Per-animal survival curve not measured. The export carries the 7, 14, 30 and 60 day
          probabilities but not the full curve, so none is drawn here. Population curves by life
          stage are on the model page.
        </p>
      </div>
    );
  }

  const rows = measured.map((point) => ({
    day: point.day,
    adopted: point.adopted_by ?? null,
    inShelter: point.still_in_shelter,
  }));

  return (
    <div>
      <div role="img" aria-label={`Chart. ${DETAIL.curveTitle}.`} style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
              stroke="var(--axis-line)"
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(value: number) => formatPercent(value)}
              tick={{ fill: "var(--ink-muted)", fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip isAnimationActive={false} />
            <Line
              dataKey="adopted"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reducedMotion}
              animationDuration={420}
            />
            {[7, 14, 30].map((day) => {
              const row = rows.find((r) => r.day === day);
              return row && row.adopted !== null ? (
                <ReferenceDot
                  key={day}
                  x={day}
                  y={row.adopted}
                  r={4}
                  fill="var(--series-1)"
                  stroke="var(--surface-card)"
                  strokeWidth={2}
                />
              ) : null;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="t-caption mt-2" style={{ color: "var(--ink-muted)" }}>
        {DETAIL.curveNote}
      </p>
    </div>
  );
}

export default SurvivalCurve;
