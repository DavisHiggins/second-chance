"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";

/**
 * A section divider that marks structure and, once, draws a short teal
 * segment along it.
 *
 * The rule is a real 1px border, present in the initial HTML, so the page's
 * structure survives a failed script or a print. The accent is an overlay
 * scaled from 0 to 1 over 700ms the first time it enters the viewport. An
 * optional number and label sit above the rule so the major sections of a
 * long page can be counted. It belongs between major sections, never between
 * rows; a divider on every row is a table border with a marketing budget.
 *
 * There is no equivalent in the Animaster pack; this is the product's own.
 */
export function AnimatedDivider({
  number,
  label,
  id,
  className = "",
}: {
  number?: string;
  label?: string;
  id?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div id={id} className={`scroll-mt-24 ${className}`} role="presentation">
      {label ? (
        <p className="t-overline mb-3 flex items-baseline gap-2" style={{ color: "var(--ink-muted)" }}>
          {number ? (
            <span className="tabular" style={{ color: "var(--accent-strong)" }}>
              {number}
            </span>
          ) : null}
          <span>{label}</span>
        </p>
      ) : null}
      <div className="divider">
        <motion.span
          aria-hidden="true"
          className="divider__accent"
          initial={reduced ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 1 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

export default AnimatedDivider;
