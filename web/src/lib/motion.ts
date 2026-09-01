import type { Transition, Variants } from "framer-motion";

/**
 * Every variant in the product lives here. Twelve components each defining
 * their own `{ opacity: 0, y: 12 }` drift apart within a week.
 *
 * Durations mirror the motion tokens in globals.css. Framer needs numbers, so
 * they are duplicated here and nowhere else.
 */

export const DUR = {
  instant: 0.09,
  fast: 0.16,
  base: 0.24,
  slow: 0.42,
  deliberate: 0.72,
} as const;

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
/** Overshoots. One use in the whole product: a human marking a row handled. */
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

/** Only the first eight children stagger; the ninth arrives with the eighth. */
export const STAGGER_CAP = 8;

const STAGGER_STEP = 0.045;
const DELAY_CHILDREN = 0.05;

/**
 * The stagger is applied as an explicit per-child delay rather than through
 * `staggerChildren`, because the library's own stagger has no cap: a 250-card
 * grid would still be arriving eleven seconds later. Here the ninth child and
 * everything after it arrive with the eighth.
 */
export const pageContainer: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.instant } },
};

function makeChild(delay: number): Variants {
  return {
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: DUR.base, ease: EASE_OUT, delay },
    },
  };
}

export const pageChild: Variants = makeChild(DELAY_CHILDREN);

/** Cached so a list of 250 rows does not build 250 variant objects per render. */
const childVariants: Variants[] = Array.from({ length: STAGGER_CAP }, (_, index) =>
  makeChild(DELAY_CHILDREN + index * STAGGER_STEP),
);

export function childVariant(index: number): Variants {
  return childVariants[Math.min(index, STAGGER_CAP - 1)];
}

/** Queue rows reorder rather than re-mount, so the travel is the message. */
export const rowLayoutTransition: Transition = {
  duration: DUR.base,
  ease: EASE_IN_OUT,
};

export const expandTransition: Transition = {
  duration: DUR.base,
  ease: EASE_OUT,
};

/** Content inside an expanding panel fades in over the last 60 percent. */
export const expandContent: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: DUR.base * 0.6, delay: DUR.base * 0.4, ease: EASE_OUT },
  },
};

export const checkPop: Variants = {
  hidden: { scale: 0.6, opacity: 0 },
  show: {
    scale: 1,
    opacity: 1,
    transition: { duration: DUR.fast, ease: EASE_SPRING },
  },
};

export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.fast, ease: EASE_OUT } },
  exit: { opacity: 0, y: 12, transition: { duration: DUR.fast, ease: EASE_OUT } },
};
