"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "./gsapSetup";

/**
 * Smooth wheel scrolling, one instance for the document.
 *
 * Adapted from the Animaster pack's Next.js Lenis wrapper (Scroll Animation
 * 56, `fall-master/src/components/SmoothScroll/Lenis.jsx`; see
 * ATTRIBUTION.md) and tuned to the settings inspected on the deployed
 * Higgins Building Group site: 1.1s exponential ease-out, wheel multiplier 1,
 * touch multiplier 1.5. Two things matter about how it is wired:
 *
 * - GSAP's ticker is the only animation loop. Lenis is driven from it with
 *   `autoRaf` off, and every scroll event is forwarded to ScrollTrigger, so
 *   there is one RAF owner and one scroll position for the whole product.
 * - Touch scrolling stays native (`syncTouch` off). Smoothing a finger is the
 *   fastest way to make a data table feel broken on a phone.
 *
 * Nested scrollers (the data drawer, wide tables) carry `data-lenis-prevent`
 * so the wheel reaches them. Reduced motion skips the instance entirely and
 * the page scrolls as the browser scrolls it. Anchors are handled by Lenis so
 * "#how-it-helps" still lands where it should.
 */

interface SmoothScroll {
  stop: () => void;
  start: () => void;
  scrollTo: (target: number | string | HTMLElement, options?: { immediate?: boolean; offset?: number }) => void;
}

const SmoothScrollContext = createContext<SmoothScroll | null>(null);

const NOOP: SmoothScroll = {
  stop: () => undefined,
  start: () => undefined,
  scrollTo: (target) => {
    if (typeof window === "undefined") return;
    if (typeof target === "number") window.scrollTo({ top: target });
    else if (typeof target === "string") document.querySelector(target)?.scrollIntoView();
    else target.scrollIntoView();
  },
};

export function useSmoothScroll(): SmoothScroll {
  return useContext(SmoothScrollContext) ?? NOOP;
}

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (prefersReducedMotion()) return;
    // A coarse pointer means wheel smoothing has nothing to smooth.
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      syncTouch: false,
      autoRaf: false,
      anchors: true,
      prevent: (node) => node.hasAttribute("data-lenis-prevent"),
    });
    lenisRef.current = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // A route change can swap a tall page for a short one. Give ScrollTrigger a
  // frame to see the new layout so its positions are not the old page's.
  useEffect(() => {
    const frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const api = useMemo<SmoothScroll>(
    () => ({
      stop: () => lenisRef.current?.stop(),
      start: () => lenisRef.current?.start(),
      scrollTo: (target, options) => {
        const lenis = lenisRef.current;
        if (lenis) lenis.scrollTo(target, options);
        else NOOP.scrollTo(target, options);
      },
    }),
    [],
  );

  return <SmoothScrollContext.Provider value={api}>{children}</SmoothScrollContext.Provider>;
}

export default SmoothScrollProvider;
