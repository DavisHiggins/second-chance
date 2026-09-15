"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Add to plan" from the queue or a record page.
 *
 * The picks live in this browser only (localStorage), which is stated on the
 * planner wherever they appear. There is no account, no server and no shared
 * workspace: the planner is a worksheet, and this is its pencil mark. Picks
 * are keyed by episode id, so a repeat visitor's earlier stay can never be
 * mistaken for the current one, and they are cleared individually or all at
 * once from the planner.
 */

export const PLAN_PICKS_KEY = "sc-plan-picks";

export interface PlanPick {
  episodeId: string;
  /** Channel chosen by hand on the planner; null means "use the rule". */
  channel: string | null;
  addedAt: string;
}

function read(): PlanPick[] {
  try {
    const raw = window.localStorage.getItem(PLAN_PICKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PlanPick =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PlanPick).episodeId === "string" &&
        typeof (item as PlanPick).addedAt === "string",
    );
  } catch {
    return [];
  }
}

function write(picks: PlanPick[]): void {
  try {
    window.localStorage.setItem(PLAN_PICKS_KEY, JSON.stringify(picks));
    window.dispatchEvent(new Event("sc-plan-picks"));
  } catch {
    // Storage blocked: the pick works for this page only.
  }
}

export function usePlanPicks() {
  // Starts empty on both server and client so hydration matches; the real
  // list arrives in the effect below.
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setPicks(read());
    sync();
    setReady(true);
    window.addEventListener("storage", sync);
    window.addEventListener("sc-plan-picks", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sc-plan-picks", sync);
    };
  }, []);

  const has = useCallback((episodeId: string) => picks.some((p) => p.episodeId === episodeId), [picks]);

  const add = useCallback((episodeId: string) => {
    const current = read();
    if (current.some((p) => p.episodeId === episodeId)) return;
    write([...current, { episodeId, channel: null, addedAt: new Date().toISOString() }]);
  }, []);

  const remove = useCallback((episodeId: string) => {
    write(read().filter((p) => p.episodeId !== episodeId));
  }, []);

  const toggle = useCallback(
    (episodeId: string) => {
      if (read().some((p) => p.episodeId === episodeId)) remove(episodeId);
      else add(episodeId);
    },
    [add, remove],
  );

  const setChannel = useCallback((episodeId: string, channel: string | null) => {
    write(read().map((p) => (p.episodeId === episodeId ? { ...p, channel } : p)));
  }, []);

  const clear = useCallback(() => write([]), []);

  return { picks, ready, has, add, remove, toggle, setChannel, clear };
}
