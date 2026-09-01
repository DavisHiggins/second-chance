"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { QUEUE } from "@/lib/content";
import { formatCount } from "@/lib/format";
import { toastVariants } from "@/lib/motion";
import QueueControls, { type SortKey, type SpeciesFilter } from "@/components/queue/QueueControls";
import QueueRow from "@/components/queue/QueueRow";
import type { InterventionChannel, QueueAnimal } from "@/types/api";

const DEFAULT_THRESHOLD = 0.5;
/** Above this many rows the list renders in windows rather than all at once. */
const WINDOW_SIZE = 100;
const VIRTUALISE_ABOVE = 200;
const UNDO_MS = 5000;
const COLLAPSE_MS = 600;

interface ActionedState {
  id: string;
  name: string;
  collapsed: boolean;
}

export function QueueClient({
  animals,
  channels,
}: {
  animals: QueueAnimal[];
  channels: InterventionChannel[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const speciesParam = (params.get("species") as SpeciesFilter | null) ?? "all";
  const sortParam = (params.get("sort") as SortKey | null) ?? "risk";
  const searchParam = params.get("q") ?? "";
  const thresholdParam = Number(params.get("min") ?? DEFAULT_THRESHOLD);

  // The slider keeps a local value so dragging is immediate; the URL is written
  // on release, which is what makes a filtered view shareable.
  const [threshold, setThreshold] = useState(thresholdParam);
  const [search, setSearch] = useState(searchParam);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioned, setActioned] = useState<ActionedState | null>(null);
  const [visibleCount, setVisibleCount] = useState(WINDOW_SIZE);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setThreshold(thresholdParam), [thresholdParam]);
  useEffect(() => setSearch(searchParam), [searchParam]);

  const writeParams = useCallback(
    (next: Record<string, string | null>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "") merged.delete(key);
        else merged.set(key, value);
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // The search box writes to the URL after a pause so every keystroke does not
  // become a history entry.
  useEffect(() => {
    if (search === searchParam) return;
    const timer = setTimeout(() => writeParams({ q: search || null }), 250);
    return () => clearTimeout(timer);
  }, [search, searchParam, writeParams]);

  const channelByName = useMemo(() => {
    const map = new Map<string, InterventionChannel>();
    for (const channel of channels) map.set(channel.channel, channel);
    return map;
  }, [channels]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = animals.filter((animal) => {
      if (speciesParam !== "all" && animal.animal_type !== speciesParam) return false;
      if ((animal.p_long_stay_60d ?? 0) < threshold) return false;
      if (term.length > 0) {
        const haystack = `${animal.name ?? ""} ${animal.animal_id}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (actioned?.collapsed && actioned.id === animal.animal_id) return false;
      return true;
    });

    // Sorted by risk descending because the queue is worked from the top down.
    return rows.sort((a, b) => {
      if (sortParam === "days") return b.days_in_care - a.days_in_care;
      if (sortParam === "arrival") {
        return Date.parse(b.intake_datetime) - Date.parse(a.intake_datetime);
      }
      return (b.p_long_stay_60d ?? 0) - (a.p_long_stay_60d ?? 0);
    });
  }, [animals, speciesParam, threshold, search, sortParam, actioned]);

  const virtualising = filtered.length > VIRTUALISE_ABOVE;
  const visible = virtualising ? filtered.slice(0, visibleCount) : filtered;

  useEffect(() => {
    setVisibleCount(WINDOW_SIZE);
  }, [speciesParam, sortParam, search, threshold]);

  useEffect(() => {
    if (!virtualising) return;
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(count + WINDOW_SIZE, filtered.length));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [virtualising, filtered.length]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  const handleAction = useCallback((animal: QueueAnimal) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setActioned({
      id: animal.animal_id,
      name: animal.name ?? QUEUE.unnamed,
      collapsed: false,
    });
    collapseTimer.current = setTimeout(() => {
      setActioned((current) => (current ? { ...current, collapsed: true } : null));
    }, COLLAPSE_MS);
    undoTimer.current = setTimeout(() => setActioned(null), UNDO_MS);
  }, []);

  const undo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setActioned(null);
  }, []);

  const hasFilters =
    speciesParam !== "all" ||
    search.trim().length > 0 ||
    Math.abs(threshold - DEFAULT_THRESHOLD) > 0.001;

  return (
    <div>
      <QueueControls
        species={speciesParam}
        threshold={threshold}
        sort={sortParam}
        search={search}
        onSpecies={(value) => writeParams({ species: value === "all" ? null : value })}
        onThreshold={setThreshold}
        onThresholdCommit={(value) =>
          writeParams({ min: value === DEFAULT_THRESHOLD ? null : value.toFixed(2) })
        }
        onSort={(value) => writeParams({ sort: value === "risk" ? null : value })}
        onSearch={setSearch}
      />

      <p aria-live="polite" className="t-small mt-4" style={{ color: "var(--ink-secondary)" }}>
        {`Showing ${formatCount(filtered.length)} of ${formatCount(animals.length)} animals`}
      </p>

      {filtered.length === 0 ? (
        <div
          className="mt-6 flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border p-8"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-card)" }}
        >
          <Inbox size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--ink-muted)" }} />
          <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
            {hasFilters ? QUEUE.emptyFiltered : QUEUE.emptyNoFilter}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setThreshold(DEFAULT_THRESHOLD);
                writeParams({ species: null, min: null, sort: null, q: null });
              }}
              className="t-small rounded-[var(--radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
            >
              {QUEUE.clearFilters}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((animal) => (
              <QueueRow
                key={animal.animal_id}
                animal={animal}
                channel={channelByName.get(animal.suggested_channel)}
                expanded={expandedId === animal.animal_id}
                actioned={actioned?.id === animal.animal_id}
                onToggle={() =>
                  setExpandedId((current) =>
                    current === animal.animal_id ? null : animal.animal_id,
                  )
                }
                onAction={() => handleAction(animal)}
              />
            ))}
          </ul>
          {virtualising && visibleCount < filtered.length ? (
            <div ref={sentinel} className="py-6 text-center">
              <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
                {`Showing the first ${formatCount(visibleCount)}. Scroll for more.`}
              </p>
            </div>
          ) : null}
        </>
      )}

      <AnimatePresence>
        {actioned ? (
          <motion.div
            variants={toastVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            role="status"
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] border px-4 py-3"
            style={{
              background: "var(--surface-raised)",
              borderColor: "var(--border-hairline)",
              boxShadow: "var(--elev-3)",
            }}
          >
            <span className="t-small" style={{ color: "var(--ink-primary)" }}>
              {`${actioned.name} marked as handled.`}
            </span>
            <button
              type="button"
              onClick={undo}
              className="t-small ml-3 underline underline-offset-2"
              style={{ color: "var(--accent-strong)" }}
            >
              {QUEUE.undoButton}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default QueueClient;
