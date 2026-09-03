"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "./gsapSetup";

/**
 * A primary action that leans toward the pointer.
 *
 * Adapted from the Animaster pack — original path in web/ATTRIBUTION.md. The
 * source version attached two listeners in an effect and never removed them,
 * which leaks on every unmount; this one cleans up, skips entirely under
 * reduced motion, and only engages for a fine pointer. On a touch screen there
 * is no hover to respond to, and running the handler there would just add
 * work during a scroll.
 *
 * The pull is small on purpose. A button that slides far from where it was
 * drawn is harder to hit, and this one sits on the primary path through the
 * product rather than on a landing page.
 */
const MAX_PULL_PX = 10;

export function MagneticButton({ children }: { children: ReactNode }) {
  const holderRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = holderRef.current;
    if (!element) return;
    if (prefersReducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const xTo = gsap.quickTo(element, "x", { duration: 0.9, ease: "elastic.out(1, 0.4)" });
    const yTo = gsap.quickTo(element, "y", { duration: 0.9, ease: "elastic.out(1, 0.4)" });

    const onMove = (event: PointerEvent) => {
      const { height, width, left, top } = element.getBoundingClientRect();
      const offsetX = event.clientX - (left + width / 2);
      const offsetY = event.clientY - (top + height / 2);
      xTo(gsap.utils.clamp(-MAX_PULL_PX, MAX_PULL_PX, offsetX * 0.35));
      yTo(gsap.utils.clamp(-MAX_PULL_PX, MAX_PULL_PX, offsetY * 0.35));
    };

    const reset = () => {
      xTo(0);
      yTo(0);
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", reset);
    // Keyboard focus should not leave the control offset from where it sits.
    element.addEventListener("blur", reset, true);

    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", reset);
      element.removeEventListener("blur", reset, true);
      gsap.killTweensOf(element);
      gsap.set(element, { x: 0, y: 0 });
    };
  }, []);

  return (
    <span ref={holderRef} className="inline-flex">
      {children}
    </span>
  );
}

export default MagneticButton;
