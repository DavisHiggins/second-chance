"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { formatSignedPercent, NOT_MEASURED } from "@/lib/format";
import type { DashboardTile } from "@/lib/dataSource";

const WIDTH = 96;
const HEIGHT = 40;

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
 * Delta polarity is hardcoded per tile, never inferred from the sign. A census
 * going up is not good news; an adoption rate going up is.
 */
function deltaTone(value: number | null, upIsGood: boolean): "good" | "serious" | "neutral" {
  if (value === null || Math.abs(value) < 0.0005) return "neutral";
  const isUp = value > 0;
  return isUp === upIsGood ? "good" : "serious";
}

export function StatTile({ tile }: { tile: DashboardTile }) {
  const reducedMotion = useReducedMotion();
  const tone = deltaTone(tile.delta.value, tile.delta.upIsGood);
  const color =
    tone === "good"
      ? "var(--status-good)"
      : tone === "serious"
        ? "var(--status-serious)"
        : "var(--ink-muted)";
  const Arrow =
    tile.delta.value === null || tone === "neutral"
      ? ArrowRight
      : tile.delta.value > 0
        ? ArrowUpRight
        : ArrowDownRight;

  const path = sparklinePath(tile.spark);

  return (
    <div
      className="flex h-full flex-col justify-between border transition-shadow"
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
        <p className="t-display tabular mt-2" style={{ color: "var(--ink-primary)" }}>
          {tile.display}
          <span className="t-small ml-2 font-normal" style={{ color: "var(--ink-muted)" }}>
            {tile.unit}
          </span>
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
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

        <motion.span
          className="t-caption tabular flex flex-col items-end text-right"
          style={{ color }}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DUR.fast, delay: DUR.slow + 0.12 }}
        >
          <span className="inline-flex items-center gap-1">
            <Arrow size={14} strokeWidth={1.5} aria-hidden="true" />
            {tile.delta.value === null ? NOT_MEASURED : formatSignedPercent(tile.delta.value)}
          </span>
          <span style={{ color: "var(--ink-muted)" }}>{tile.delta.caption}</span>
        </motion.span>
      </div>
      <p className="sr-only">
        {`Twelve month trend for ${tile.label}. ${
          tile.delta.value === null
            ? "Change not measured."
            : `Change ${formatSignedPercent(tile.delta.value)} ${tile.delta.caption}.`
        }`}
      </p>
    </div>
  );
}

export default StatTile;
