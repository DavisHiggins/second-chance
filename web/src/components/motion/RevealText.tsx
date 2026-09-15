"use client";

import { useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { gsap, ScrollTrigger, SplitText, useGSAP, prefersReducedMotion } from "./gsapSetup";

/**
 * Masked line reveal for a headline.
 *
 * The heading is rendered on the server as ordinary text. On the client it is
 * split into lines, each inside its own mask, and the lines rise into place
 * over about 600ms with a 40ms stagger, the rhythm inspected on the Higgins
 * Building Group site and shortened for an analytics interface. The masking
 * technique is adapted from the Animaster pack's SplitText `mask` example
 * (Text Animations 14, `files/script.js`; see ATTRIBUTION.md), with the
 * scroll scrub removed: a heading assembles once and then stays put.
 *
 * What keeps it honest:
 *
 * - The text is in the initial HTML and readable without script. The hidden
 *   start state is scoped to `html.js` and to the "pending" phase only, and
 *   a delayed CSS keyframe uncovers the lines if a timeline never attaches.
 * - `autoSplit` re-splits after fonts load or the box resizes, so a line
 *   break that moves does not leave a word stranded outside its mask.
 * - SplitText's `aria: "auto"` puts the sentence on the heading as a label
 *   and hides the fragments, so a screen reader hears it once.
 * - Reduced motion skips the split entirely; the DOM is the untouched text.
 */
export function RevealText({
  as: Tag = "h1",
  children,
  className = "",
  style,
  delay = 0,
  stagger = 0.04,
  duration = 0.6,
  animateOnScroll = false,
  id,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  stagger?: number;
  duration?: number;
  /** Start when the heading enters the viewport instead of on mount. */
  animateOnScroll?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"pending" | "done" | "skipped">("pending");

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;

      if (prefersReducedMotion()) {
        setPhase("skipped");
        return;
      }

      let played = false;
      const split = SplitText.create(element, {
        type: "lines",
        mask: "lines",
        linesClass: "split-line",
        autoSplit: true,
        aria: "auto",
        onSplit: (self) => {
          // A re-split after fonts load must not replay the entrance.
          if (played) {
            gsap.set(self.lines, { yPercent: 0, opacity: 1 });
            setPhase("done");
            return;
          }
          played = true;

          const tween = gsap.fromTo(
            self.lines,
            { yPercent: 110, opacity: 0 },
            {
              yPercent: 0,
              opacity: 1,
              duration,
              stagger,
              delay,
              ease: "power3.out",
              paused: animateOnScroll,
              onComplete: () => setPhase("done"),
            },
          );

          if (animateOnScroll) {
            ScrollTrigger.create({
              trigger: element,
              start: "top 88%",
              once: true,
              onEnter: () => tween.play(),
            });
          }
          return tween;
        },
      });

      return () => {
        split.revert();
      };
    },
    { scope: ref },
  );

  return (
    <Tag
      ref={ref}
      id={id}
      className={`reveal-text ${className}`}
      style={style}
      data-reveal={phase}
      data-scroll={animateOnScroll ? "true" : undefined}
    >
      {children}
    </Tag>
  );
}

export default RevealText;
