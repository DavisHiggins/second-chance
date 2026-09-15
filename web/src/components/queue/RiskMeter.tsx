"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatPercent } from "@/lib/format";
import { DUR, EASE_OUT } from "@/lib/motion";
import { BAND_COLOR, BAND_LABEL, bandTone } from "@/lib/model/presentation";
import { describeHorizon } from "@/lib/model/horizon";
import { StatusIcon } from "@/components/ui/Status";
import type { RiskBand } from "@/lib/model/registry.server";

/**
 * One intake-time probability, drawn, with its horizon stated.
 *
 * The number is always present as text; the bar and the colour are there to
 * make a column of them scannable, never to carry the value on their own.
 * For an animal already past 60 days, the headline is the fact ("Already
 * waiting over 60 days") and the estimate is secondary: the event it
 * predicted has happened, so it is not a forecast any more.
 */
export function RiskMeter({
  value,
  band,
  daysInCare,
  width = 148,
}: {
  value: number;
  band: RiskBand;
  daysInCare: number;
  width?: number;
}) {
  const reducedMotion = useReducedMotion();
  const color = BAND_COLOR[band];
  const horizon = describeHorizon({ daysInCare, pLongStay60d: value, scoring: true });
  const past = horizon.status === "already_past_horizon";

  return (
    <div style={{ width }}>
      {past ? (
        <>
          <p className="t-small text-right font-semibold" style={{ color: "var(--accent-warm-strong)" }}>
            {horizon.headline}
          </p>
          <p className="t-caption mt-0.5 text-right" style={{ color: "var(--ink-muted)" }}>
            {`Intake estimate was ${formatPercent(value)} · ${BAND_LABEL[band]}`}
          </p>
        </>
      ) : (
        <>
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
            {`${BAND_LABEL[band]} · past 60 days, estimated at intake`}
          </p>
        </>
      )}
    </div>
  );
}

export default RiskMeter;
