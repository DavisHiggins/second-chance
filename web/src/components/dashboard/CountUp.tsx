"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const SEEN_KEY = "sc-counted";

/** Once per session, tracked across client navigation so returning to the
 *  dashboard does not replay it. */
function alreadyCounted(id: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(id) : false;
  } catch {
    return false;
  }
}

function markCounted(id: string): void {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(id)) {
      seen.push(id);
      window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  } catch {
    // Session storage is unavailable; the number simply appears instead.
  }
}

/**
 * The one deliberate animation in the product. It is only ever used for a
 * population count, never for a probability or anything attached to one
 * animal's situation: those appear, they do not perform.
 */
export function CountUp({
  value,
  id,
  className = "",
  durationMs = 720,
}: {
  value: number;
  id: string;
  className?: string;
  durationMs?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    if (reducedMotion || alreadyCounted(id)) {
      setDisplay(value);
      return;
    }

    markCounted(id);
    let frame = 0;
    const start = performance.now();
    setDisplay(0);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, id, durationMs, reducedMotion]);

  return (
    <span className={className} aria-label={value.toLocaleString("en-US")}>
      <span aria-hidden="true">{display.toLocaleString("en-US")}</span>
    </span>
  );
}

export default CountUp;
