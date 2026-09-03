"use client";

import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, SplitText, useGSAP, prefersReducedMotion } from "./gsapSetup";

/**
 * Character-level reveal for a headline.
 *
 * Adapted from the Animaster pack — see web/ATTRIBUTION.md for the original
 * path. Three things changed on the way in, all of them because this is a data
 * product rather than a showcase:
 *
 * 1. Reduced motion is honoured by not splitting the text at all. Splitting a
 *    heading into per-character spans and then leaving it visible still costs
 *    screen readers the sentence, so the safe state is the untouched DOM.
 * 2. The animation is capped at a short duration and never scrubs. A headline
 *    that assembles while the reader waits is a delay dressed as polish.
 * 3. The SplitText instance is reverted on unmount, so navigating away does
 *    not leave the heading permanently shredded into spans.
 */
export function SplitTextReveal({
  children,
  delay = 0,
  stagger = 0.018,
  duration = 0.5,
  animateOnScroll = false,
}: {
  children: ReactNode;
  delay?: number;
  stagger?: number;
  duration?: number;
  animateOnScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const element = containerRef.current;
      if (!element) return;

      // The motion-free state is the real text, untouched.
      if (prefersReducedMotion()) {
        gsap.set(element, { opacity: 1 });
        return;
      }

      const split = SplitText.create(element, {
        type: "lines,chars",
        linesClass: "split-line",
        charsClass: "split-char",
      });

      gsap.set(element, { opacity: 1 });
      gsap.set(split.chars, { yPercent: 108, opacity: 0 });

      const build = (timeline: gsap.core.Timeline) =>
        timeline.to(split.chars, {
          yPercent: 0,
          opacity: 1,
          ease: "power3.out",
          duration,
          stagger,
        });

      if (animateOnScroll) {
        const timeline = gsap.timeline({ paused: true, delay });
        build(timeline);
        ScrollTrigger.create({
          trigger: element,
          start: "top 88%",
          once: true,
          onEnter: () => timeline.play(),
        });
      } else {
        build(gsap.timeline({ delay }));
      }

      return () => {
        split.revert();
      };
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className="reveal-init" style={{ overflow: "hidden" }}>
      {children}
    </div>
  );
}

export default SplitTextReveal;
