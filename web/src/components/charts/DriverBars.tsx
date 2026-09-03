"use client";

import { motion, useReducedMotion } from "framer-motion";
import { mergeDrivers } from "@/lib/model/presentation";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * What the model leans on, as a ranked bar chart.
 *
 * This is population-level importance, not a per-animal attribution, and the
 * caption says so wherever it appears. The artifact carries mean absolute gain
 * per feature; a per-row SHAP breakdown is not exported, and inventing one
 * from the gains would produce a confident per-animal explanation that the
 * model never actually gave.
 *
 * Bars are single-direction for the same reason. A gain has magnitude but no
 * sign, so a diverging axis would be drawing a direction that is not in the
 * data.
 */
export function DriverBars({
  drivers,
  limit = 6,
  emptyNote = "No feature importance was exported with this model.",
}: {
  drivers: readonly { feature: string; gain: number }[];
  limit?: number;
  emptyNote?: string;
}) {
  const reducedMotion = useReducedMotion();
  const shown = mergeDrivers(drivers).slice(0, limit);

  if (shown.length === 0) {
    return (
      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        {emptyNote}
      </p>
    );
  }

  const max = Math.max(...shown.map((driver) => driver.gain), Number.EPSILON);
  const total = shown.reduce((sum, driver) => sum + driver.gain, 0);

  const summary = shown
    .map((driver, index) => `${index + 1}. ${driver.label}`)
    .join("; ");

  return (
    <div role="img" aria-label={`Chart. What the model weighs most, strongest first. ${summary}.`}>
      <ol className="space-y-3">
        {shown.map((driver, index) => {
          const width = (driver.gain / max) * 100;
          const share = total === 0 ? 0 : driver.gain / total;
          return (
            <li key={driver.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-small" style={{ color: "var(--ink-primary)" }}>
                  {driver.label}
                </span>
                <span className="t-caption tabular" style={{ color: "var(--ink-muted)" }}>
                  {`${(share * 100).toFixed(0)}% of the shown weight`}
                </span>
              </div>
              <div
                className="mt-1.5 h-2.5 overflow-hidden rounded-[2px]"
                style={{ background: "var(--surface-sunken)" }}
              >
                <motion.span
                  className="block h-full rounded-[2px]"
                  style={{
                    width: `${width}%`,
                    background: "var(--series-1)",
                    transformOrigin: "left",
                  }}
                  initial={reducedMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: DUR.base,
                    ease: EASE_OUT,
                    delay: Math.min(index, 11) * 0.03,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
        Bar length is how much the model relies on each input across the whole population, largest
        first. It is not an explanation of any single animal, and it does not say which direction an
        input pushes a prediction.
      </p>
    </div>
  );
}

export default DriverBars;
