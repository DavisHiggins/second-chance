"use client";

import { motion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { EASE_OUT } from "@/lib/motion";

/**
 * Section entrance: a 16px rise with opacity over 420ms, once, when the
 * section enters the viewport. Children marked with `RevealItem` stagger by
 * 60ms, capped at eight so a long list never keeps its tail waiting.
 *
 * This is the single entrance for content blocks. It never replays on a
 * filter change (the block stays mounted), never staggers hundreds of rows
 * (rows are not items), and under reduced motion Framer's `reducedMotion:
 * "user"` setting in the provider collapses it to an instant opacity change.
 * The children are server-rendered; only the transform is client-side.
 */

const STAGGER = 0.06;
const CAP = 8;

const container: Variants = {
  hidden: {},
  show: {},
};

/** Built per index so the delay is explicit and capped, rather than relying
 *  on `staggerChildren`, which has no cap. */
function itemVariants(index: number): Variants {
  const capped = Math.min(index, CAP - 1);
  return {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.42, ease: EASE_OUT, delay: capped * STAGGER },
    },
  };
}

export function RevealSection({
  children,
  className = "",
  as = "section",
  id,
  style,
  amount = 0.15,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "ul" | "ol" | "aside";
  id?: string;
  style?: CSSProperties;
  /** Fraction of the block that must be visible before it enters. */
  amount?: number;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  const Tag = motion[as];
  return (
    <Tag
      id={id}
      className={className}
      style={style}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount, margin: "0px 0px -8% 0px" }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** A child of RevealSection that takes part in the stagger. Only the first
 *  eight are staggered; the rest arrive with the eighth.
 *
 *  `standalone` makes the item watch the viewport itself instead of taking
 *  its cue from a parent RevealSection. A list that grows after its first
 *  reveal ("Show more") needs this: the parent's `once` reveal has already
 *  fired, so children mounted later would otherwise stay at their hidden
 *  variant forever. */
export function RevealItem({
  children,
  className = "",
  as = "div",
  index = 0,
  style,
  standalone = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article" | "section";
  index?: number;
  style?: CSSProperties;
  standalone?: boolean;
}) {
  const Tag = motion[as];
  if (standalone) {
    return (
      <Tag
        className={className}
        style={style}
        variants={itemVariants(index)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1, margin: "0px 0px -4% 0px" }}
      >
        {children}
      </Tag>
    );
  }
  return (
    <Tag className={className} style={style} variants={itemVariants(index)}>
      {children}
    </Tag>
  );
}

export default RevealSection;
