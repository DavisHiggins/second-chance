"use client";

import { motion, useReducedMotion } from "framer-motion";
import { driverPhrase } from "@/lib/driverLabels";
import { formatSigned } from "@/lib/format";
import { DUR, EASE_OUT } from "@/lib/motion";
import type { Driver } from "@/types/api";

/**
 * A diverging bar chart of the drivers behind one prediction: contributions that
 * raise the chance extend right in slot 1, contributions that lower it extend
 * left in slot 8, from a centred zero axis. Every bar is direct-labelled with
 * the plain-language phrase, so the colour is never carrying the meaning.
 */
export function DriverBars({ drivers, limit = 6 }: { drivers: Driver[]; limit?: number }) {
  const reducedMotion = useReducedMotion();
  const shown = drivers.slice(0, limit);
  const max = Math.max(...shown.map((driver) => Math.abs(driver.contribution)), 0.0001);

  if (shown.length === 0) {
    return (
      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        No driver breakdown was exported for this animal.
      </p>
    );
  }

  const summary = shown
    .map(
      (driver) =>
        `${driverPhrase(driver)}, ${driver.direction} the chance by ${Math.abs(
          driver.contribution,
        ).toFixed(2)}`,
    )
    .join(". ");

  return (
    <div role="img" aria-label={`Chart. Drivers behind this prediction. ${summary}.`}>
      <ul className="space-y-3">
        {shown.map((driver, index) => {
          const positive = driver.contribution >= 0;
          const width = (Math.abs(driver.contribution) / max) * 50;
          return (
            <li key={`${driver.feature}-${index}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-small" style={{ color: "var(--ink-primary)" }}>
                  {driverPhrase(driver)}
                </span>
                <span className="t-caption tabular" style={{ color: "var(--ink-secondary)" }}>
                  {formatSigned(driver.contribution)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-1/2 w-px"
                  style={{ background: "var(--axis-line)" }}
                />
                <motion.span
                  className="absolute top-0 block h-2.5 rounded-[2px]"
                  style={{
                    left: positive ? "50%" : `${50 - width}%`,
                    width: `${width}%`,
                    background: positive ? "var(--series-1)" : "var(--series-8)",
                    transformOrigin: positive ? "left" : "right",
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
      </ul>
      <p className="t-caption mt-3" style={{ color: "var(--ink-muted)" }}>
        Contributions are log-odds from the model&apos;s own explanation, largest first. Bars to the
        right raise the predicted chance of adoption; bars to the left lower it.
      </p>
    </div>
  );
}

export default DriverBars;
