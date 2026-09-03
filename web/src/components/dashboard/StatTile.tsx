"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { NOT_MEASURED } from "@/lib/format";
import CountUp from "@/components/dashboard/CountUp";

const WIDTH = 96;
const HEIGHT = 40;

export interface StatTileData {
  id: string;
  label: string;
  /** Already formatted. Null renders as "not measured", never as a zero. */
  display: string | null;
  unit: string;
  /** The number to count up to, when the tile is a plain count. */
  countTo?: number;
  spark: number[];
  /** How many rows the figure was computed from. Shown, not hidden. */
  sampleSize: number | null;
  footnote: string;
}

function sparklinePath(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * WIDTH;
      const y = HEIGHT - ((value - min) / span) * (HEIGHT - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * A single headline figure.
 *
 * There is no percentage-change indicator any more. The old tiles compared the
 * current month against the previous one and rendered a green or red arrow,
 * which read as a judgement the data cannot support: a month with fewer
 * adoptions may mean fewer intakes, and the arrow could not tell the
 * difference. What replaced it is the sample size and a one-line note about
 * what the figure counts, which is the thing a user actually needs to read it.
 */
export function StatTile({ tile }: { tile: StatTileData }) {
  const reducedMotion = useReducedMotion();
  const path = sparklinePath(tile.spark);
  const measured = tile.display !== null;

  return (
    <div
      className="flex h-full flex-col justify-between border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--elev-1)",
        padding: "var(--card-padding)",
      }}
    >
      <div>
        <p className="t-overline" style={{ color: "var(--ink-muted)" }}>
          {tile.label}
        </p>
        <p
          className="t-display tabular mt-2"
          style={{ color: measured ? "var(--ink-primary)" : "var(--ink-muted)" }}
        >
          {measured ? (
            tile.countTo !== undefined ? (
              <CountUp value={tile.countTo} id={`tile-${tile.id}`} />
            ) : (
              tile.display
            )
          ) : (
            NOT_MEASURED
          )}
          {measured ? (
            <span className="t-small ml-2 font-normal" style={{ color: "var(--ink-muted)" }}>
              {tile.unit}
            </span>
          ) : null}
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        {path ? (
          <svg
            width={WIDTH}
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            aria-hidden="true"
            className="overflow-visible"
          >
            <motion.path
              d={path}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DUR.slow, ease: EASE_OUT, delay: 0.12 }}
            />
          </svg>
        ) : (
          <span />
        )}

        {tile.sampleSize !== null ? (
          <span className="t-caption tabular text-right" style={{ color: "var(--ink-muted)" }}>
            {`n = ${tile.sampleSize.toLocaleString("en-US")}`}
          </span>
        ) : null}
      </div>

      <p className="t-caption mt-3" style={{ color: "var(--ink-muted)" }}>
        {tile.footnote}
      </p>
    </div>
  );
}

export default StatTile;
