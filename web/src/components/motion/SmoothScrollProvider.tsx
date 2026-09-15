"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
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
 * Nested scrollers are detected rather than declared: `allowNestedScroll`
 * lets Lenis check whether the element under the pointer can actually scroll
 * in the gesture's direction, and only then hands the wheel to it. A wide
 * table that scrolls sideways therefore still lets a vertical wheel move the
 * page. The drawers still carry `data-lenis-prevent` as a belt-and-braces
 * opt-out, but ordinary `overflow-x-auto` wrappers must not: marking them
 * made Lenis ignore the wheel over most of the queue and planner, so its
 * in-flight animation fought the browser's native scroll.
 *
 * Every route change lands at the top of the new page (or at its hash
 * target). Next scrolls to the top on its own for link navigation, but a
 * Lenis animation still running from the previous page would overwrite that
 * on the next frame, so the position is pinned here as well, immediately and
 * before paint.
 */

interface SmoothScroll {
  stop: () => void;
  start: () => void;
  scrollTo: (target: number | string | HTMLElement, options?: { immediate?: boolean; offset?: number }) => void;
}

const SmoothScrollContext = createContext<SmoothScroll | null>(null);

/** Height of the sticky header plus breathing room, for hash targets. */
const HASH_OFFSET = -88;

const NOOP: SmoothScroll = {
  stop: () => undefined,
  start: () => undefined,
  scrollTo: (target, options) => {
    if (typeof window === "undefined") return;
    const behavior: ScrollBehavior = options?.immediate ? "auto" : "smooth";
    if (typeof target === "number") {
      window.scrollTo({ top: target, behavior });
      return;
    }
    const node = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY + (options?.offset ?? 0);
    window.scrollTo({ top: Math.max(0, top), behavior });
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
      allowNestedScroll: true,
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

  // Every page opens at its top. The browser is told not to restore old
  // positions itself so back and forward behave the same as a link.
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

    const hash = window.location.hash;
    const target = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    const lenis = lenisRef.current;

    if (target) {
      if (lenis) lenis.scrollTo(target, { immediate: true, force: true, offset: HASH_OFFSET });
      else NOOP.scrollTo(target, { immediate: true, offset: HASH_OFFSET });
    } else {
      if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

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
