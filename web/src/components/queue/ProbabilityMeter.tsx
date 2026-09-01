"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { formatPercent, NOT_MEASURED } from "@/lib/format";
import { QUEUE } from "@/lib/content";

/**
 * The bar grows once on mount with scaleX. The number beside it does not count
 * up: it belongs to one animal, and a number attached to an animal's situation
 * should appear rather than perform.
 */
export function ProbabilityMeter({
  value,
  interval,
  width = 120,
  label = QUEUE.probabilityLabel,
}: {
  value: number | null;
  interval?: [number, number];
  width?: number;
  label?: string;
}) {
  const reducedMotion = useReducedMotion();
  const fraction = value === null ? 0 : Math.min(1, Math.max(0, value));

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative overflow-hidden rounded-[var(--radius-full)]"
        style={{ width, height: 8, background: "var(--surface-sunken)" }}
        role="img"
        aria-label={
          value === null
            ? `${label}: ${NOT_MEASURED}`
            : `${label}: ${formatPercent(value)}${
                interval ? `, interval ${formatPercent(interval[0])} to ${formatPercent(interval[1])}` : ""
              }`
        }
      >
        {interval ? (
          <span
            className="absolute inset-y-0 block rounded-[var(--radius-full)]"
            style={{
              left: `${interval[0] * 100}%`,
              width: `${Math.max(0, interval[1] - interval[0]) * 100}%`,
              background: "var(--ramp-200)",
            }}
          />
        ) : null}
        <motion.span
          className="absolute inset-y-0 left-0 block rounded-[var(--radius-full)]"
          style={{
            width: `${fraction * 100}%`,
            background: "var(--accent)",
            transformOrigin: "left",
          }}
          initial={reducedMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
        />
      </div>
      <span className="t-small tabular" style={{ color: "var(--ink-primary)" }}>
        {value === null ? NOT_MEASURED : formatPercent(value)}
      </span>
    </div>
  );
}

export default ProbabilityMeter;
