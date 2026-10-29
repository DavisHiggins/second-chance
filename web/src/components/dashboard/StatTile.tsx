"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { NOT_MEASURED } from "@/lib/format";
import { metric, type MetricId } from "@/lib/metrics/registry";
import CountUp from "@/components/dashboard/CountUp";
import Disclosure from "@/components/ui/Disclosure";
import { DASHBOARD } from "@/lib/content";

const WIDTH = 96;
const HEIGHT = 40;

export interface SparkPoint {
  label: string;
  value: number;
  partial?: boolean;
}

export interface StatTileData {
  id: string;
  metricId: MetricId;
  label: string;
  /** Already formatted. Null renders as "not measured", never as a zero. */
  display: string | null;
  unit: string;
  /** The number to count up to, when the tile is a plain count. */
  countTo?: number;
  /** Comparable monthly points in the same unit as the value, or none. */
  spark: SparkPoint[];
  sparkLabel: string | null;
  /** "Based on 1,204 adoptions", or null when a sample does not apply. */
  sampleLine: string | null;
  /** One sentence beneath the number. */
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
 * There is no percentage-change indicator. The old tiles compared the current
 * month against the previous one and rendered a green or red arrow, which
 * read as a judgement the data cannot support. What is here instead: the
 * sample the figure rests on, one sentence about what it counts, a sparkline
 * only when comparable monthly values in the same unit exist, and a "What
 * this means" disclosure fed by the shared metric registry so the tile, the
 * drawer and the model page cannot disagree.
 *
 * The disclosure belongs to this tile alone. Everything above it sits in the
 * `data-tile-head` block, which StatTileGrid sizes so a row of closed tiles
 * lines up without stretching.
 */
export function StatTile({ tile }: { tile: StatTileData }) {
  const reducedMotion = useReducedMotion();
  const measured = tile.display !== null;
  const entry = metric(tile.metricId);
  const sparkValues = tile.spark.map((p) => p.value);
  const path = sparklinePath(sparkValues);
  const hasPartial = tile.spark.some((p) => p.partial);
  const sparkSummary =
    tile.spark.length >= 2
      ? `${tile.sparkLabel ?? ""}: from ${tile.spark[0].label} to ${tile.spark[tile.spark.length - 1].label}.`
      : "";

  return (
    <div
      className="flex flex-col border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--elev-1)",
        padding: "var(--card-padding)",
      }}
    >
      <div data-tile-head="" className="flex flex-col justify-between">
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
          <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
            {tile.footnote}
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          {path ? (
            <figure className="m-0">
              <svg
                width={WIDTH}
                height={HEIGHT}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                role="img"
                aria-label={sparkSummary}
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
                {hasPartial ? (
                  <circle
                    cx={WIDTH}
                    cy={Number(path.split(" ").pop() ?? 0)}
                    r={3}
                    fill="var(--surface-card)"
                    stroke="var(--series-1)"
                    strokeWidth={1.5}
                  />
                ) : null}
              </svg>
              <figcaption className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
                {tile.sparkLabel}
                {hasPartial ? " · last point is a partial month" : ""}
              </figcaption>
            </figure>
          ) : (
            <span />
          )}

          {tile.sampleLine ? (
            <span className="t-caption tabular text-right" style={{ color: "var(--ink-muted)" }}>
              {tile.sampleLine}
            </span>
          ) : null}
        </div>
      </div>

      <Disclosure summary={DASHBOARD.whatThisMeans} className="mt-3">
        <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
          {entry.meaning}
        </p>
        <dl className="t-caption mt-2 space-y-1" style={{ color: "var(--ink-muted)" }}>
          <div>
            <dt className="inline font-semibold">Window: </dt>
            <dd className="inline">{entry.window}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Sample: </dt>
            <dd className="inline">{entry.sample}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Use: </dt>
            <dd className="inline">{entry.use}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Limit: </dt>
            <dd className="inline">{entry.limitation}</dd>
          </div>
        </dl>
      </Disclosure>
    </div>
  );
}

export default StatTile;
