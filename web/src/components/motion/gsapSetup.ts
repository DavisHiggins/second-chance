"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

/**
 * One place where GSAP plugins are registered.
 *
 * Registration has to happen in client code: ScrollTrigger reaches for
 * `window` as it initialises, and importing it into a server component would
 * fail the build. Doing it once here rather than at the top of every animated
 * component also means a plugin cannot be half-registered depending on which
 * component mounted first.
 *
 * SplitText moved into GSAP core in v3.13, so it needs no Club GreenSock
 * licence at the version pinned in package.json.
 */
gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export { gsap, ScrollTrigger, SplitText, useGSAP };

/**
 * Whether the visitor has asked for less motion.
 *
 * Checked imperatively rather than through a hook because these components
 * build GSAP timelines in an effect, and the decision has to be made at the
 * moment the timeline is constructed rather than at the next render.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
