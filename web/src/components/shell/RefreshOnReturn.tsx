"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Re-reads the server snapshot when the tab comes back after a long absence.
 *
 * The view is cached for thirty minutes on the server; a tab left open
 * overnight would otherwise show yesterday's roster until someone navigated.
 * `router.refresh()` re-renders the server components in place and keeps
 * client state (filters live in the URL; an expanded row stays expanded), so
 * nothing moves under a person mid-action. It only fires on a return to the
 * tab, never on a timer while the page is being used, and never more than
 * once per interval.
 */
const MIN_INTERVAL_MS = 15 * 60_000;

export function RefreshOnReturn() {
  const router = useRouter();
  const lastRefresh = useRef<number>(Date.now());

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < MIN_INTERVAL_MS) return;
      lastRefresh.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return null;
}

export default RefreshOnReturn;
