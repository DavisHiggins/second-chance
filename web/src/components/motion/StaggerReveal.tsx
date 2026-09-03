"use client";

import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from "./gsapSetup";

/**
 * Staggered entrance for a list, grid or table body.
 *
 * Adapted from the Animaster pack's scroll-assembled card grid — original path
 * in web/ATTRIBUTION.md. The source scrubs a long timeline against scroll
 * position, which suits a hero collage and actively fights a table: rows would
 * sit half-transparent while somebody was trying to read them.
 *
 * So the scrub is gone, and what is left is the part worth keeping: a short
 * once-only rise with a per-child offset, triggered when the container comes
 * into view. Children animate from a transform only. Nothing here changes
 * layout, so no row can shift under a pointer that is already moving toward it.
 */
export function StaggerReveal({
  children,
  selector = ":scope > *",
  stagger = 0.035,
  duration = 0.42,
  distance = 14,
  className,
}: {
  children: ReactNode;
  /** What to stagger. Defaults to the direct children of this wrapper. */
  selector?: string;
  stagger?: number;
  duration?: number;
  distance?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container) return;
      if (prefersReducedMotion()) return;

      const targets = Array.from(container.querySelectorAll<HTMLElement>(selector));
      if (targets.length === 0) return;

      // A long list should not take a long time. Past this many rows the
      // stagger is compressed so the last one is never left waiting.
      const perItem = targets.length > 18 ? stagger * (18 / targets.length) : stagger;

      const tween = gsap.fromTo(
        targets,
        { y: distance, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration,
          ease: "power2.out",
          stagger: perItem,
          overwrite: "auto",
          scrollTrigger: {
            trigger: container,
            start: "top 92%",
            once: true,
          },
        },
      );

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        // Leave the content visible if the timeline is torn down mid-flight.
        gsap.set(targets, { clearProps: "opacity,transform" });
      };
    },
    { scope: containerRef, dependencies: [selector] },
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

/** Re-exported so a page can force a recalculation after it swaps content in
 *  and out of a scroll-triggered region. */
export function refreshScrollTriggers(): void {
  ScrollTrigger.refresh();
}

export default StaggerReveal;
