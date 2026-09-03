"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatPercent } from "@/lib/format";
import { DUR, EASE_OUT } from "@/lib/motion";
import { BAND_COLOR, BAND_LABEL, bandTone } from "@/lib/model/presentation";
import { StatusIcon } from "@/components/ui/Status";
import type { RiskBand } from "@/lib/model/registry.server";

/**
 * One calibrated probability, drawn.
 *
 * The number is always present as text; the bar and the colour are there to
 * make a column of them scannable, never to carry the value on their own. The
 * band name is written out for the same reason, so the row survives greyscale
 * and a screen reader.
 */
export function RiskMeter({
  value,
  band,
  label,
  width = 132,
}: {
  value: number;
  band: RiskBand;
  label: string;
  width?: number;
}) {
  const reducedMotion = useReducedMotion();
  const color = BAND_COLOR[band];

  return (
    <div style={{ width }}>
      <div className="flex items-baseline justify-end gap-1.5">
        <StatusIcon tone={bandTone(band)} size={13} label={BAND_LABEL[band]} />
        <span className="t-subtitle tabular font-semibold" style={{ color }}>
          {formatPercent(value)}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-[var(--radius-full)]"
        style={{ background: "var(--surface-sunken)" }}
        role="presentation"
      >
        <motion.span
          className="block h-full"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color, transformOrigin: "left" }}
          initial={reducedMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
        />
      </div>
      <p className="t-caption mt-1 text-right" style={{ color: "var(--ink-muted)" }}>
        {label}
      </p>
    </div>
  );
}

export default RiskMeter;
