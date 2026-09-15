"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QUEUE } from "@/lib/content";
import { formatCount } from "@/lib/format";
import { LONG_STAY_HORIZON_DAYS, TRIAGE_THRESHOLDS } from "@/lib/model/horizon";
import { usePlanPicks } from "@/lib/planPicks";
import QueueControls, {
  EMPTY_FILTERS,
  type LifeStageFilter,
  type QueueFilters,
  type RiskFilter,
  type SortKey,
  type SpeciesFilter,
} from "@/components/queue/QueueControls";
import QueueRow from "@/components/queue/QueueRow";
import QueueCard from "@/components/queue/QueueCard";
import Button from "@/components/ui/Button";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

export type QueueView = "table" | "cards";

/**
 * The staff queue.
 *
 * Filtering and sorting happen here rather than on the server because the
 * whole open population is a few hundred rows: shipping them once and
 * filtering in the browser is faster to use than a round trip per keystroke,
 * and it keeps the page working while the connection is poor.
 *
 * Every filter, the sort and the view live in the URL, so a link carries the
 * exact list and the browser's back button restores it after a record page.
 * Every visit opens at the top of the page, like every other route; the
 * shell pins the position on navigation.
 */

/**
 * How many rows are rendered before the reader asks for more.
 *
 * The whole filtered list is held in memory, but rendering all of it is not
 * free: at nearly a thousand open stays the server-rendered table came to
 * 3.7MB of markup, almost all of it inline styles on rows nobody scrolled to.
 * A triage queue is worked from the top, so the tail is paid for and unread.
 */
const PAGE_SIZE = 50;

const SPECIES: SpeciesFilter[] = ["all", "Dog", "Cat"];
const LIFE_STAGES: LifeStageFilter[] = ["all", "juvenile", "adult", "senior", "unknown"];
const RISKS: RiskFilter[] = ["all", "warning", "serious", "critical", "past60", "unscored"];
const SORTS: SortKey[] = ["risk", "days", "arrival"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function fromParams(params: URLSearchParams, scoring: boolean): { filters: QueueFilters; view: QueueView; shown: number } {
  const minDays = Number(params.get("wait") ?? "0");
  return {
    filters: {
      species: pick(params.get("species"), SPECIES, "all"),
      lifeStage: pick(params.get("age"), LIFE_STAGES, "all"),
      risk: pick(params.get("band"), RISKS, "all"),
      minDays: Number.isFinite(minDays) && minDays > 0 ? Math.min(3650, Math.floor(minDays)) : 0,
      hideStale: params.get("stale") === "hide",
      search: (params.get("q") ?? "").slice(0, 80),
      sort: pick(params.get("sort"), SORTS, scoring ? "risk" : "days"),
    },
    view: pick(params.get("view"), ["table", "cards"] as const, "table"),
    shown: Math.max(PAGE_SIZE, Math.min(2000, Number(params.get("show") ?? PAGE_SIZE) || PAGE_SIZE)),
  };
}

function toParams(filters: QueueFilters, view: QueueView, shown: number, scoring: boolean): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.species !== "all") params.set("species", filters.species);
  if (filters.lifeStage !== "all") params.set("age", filters.lifeStage);
  if (filters.risk !== "all") params.set("band", filters.risk);
  if (filters.minDays > 0) params.set("wait", String(filters.minDays));
  if (filters.hideStale) params.set("stale", "hide");
  if (filters.sort !== (scoring ? "risk" : "days")) params.set("sort", filters.sort);
  if (view !== "table") params.set("view", view);
  if (shown > PAGE_SIZE) params.set("show", String(shown));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function QueueClient({
  stays,
  scoring,
  channels,
  drivers,
  initialQuery = "",
}: {
  stays: ScoredStay[];
  scoring: boolean;
  channels: InterventionChannel[];
  drivers: { feature: string; gain: number }[];
  /** The request's query string, from the server page, so the first fifty
   *  rows are in the initial HTML rather than behind a client-only render. */
  initialQuery?: string;
}) {
  const pathname = usePathname();
  const searchParams = useMemo(() => new URLSearchParams(initialQuery), [initialQuery]);
  const initial = useMemo(() => fromParams(searchParams, scoring), [searchParams, scoring]);

  const [filters, setFilters] = useState<QueueFilters>(initial.filters);
  const [view, setView] = useState<QueueView>(initial.view);
  const [shown, setShown] = useState(initial.shown);
  const [expanded, setExpanded] = useState<string | null>(null);
  const picks = usePlanPicks();

  // Writes state to the URL without adding history entries or a server round
  // trip: Next integrates with the native history API, so `useSearchParams`
  // stays in step and back/forward still moves between pages rather than
  // between keystrokes.
  const writeUrl = useCallback(
    (next: QueueFilters, nextView: QueueView, nextShown: number) => {
      const query = toParams(next, nextView, nextShown, scoring);
      const current = window.location.search;
      if (query !== current) window.history.replaceState(window.history.state, "", `${pathname}${query}`);
    },
    [pathname, scoring],
  );

  const changeFilters = (next: QueueFilters) => {
    setFilters(next);
    setShown(PAGE_SIZE);
    writeUrl(next, view, PAGE_SIZE);
  };
  const changeView = (next: QueueView) => {
    setView(next);
    writeUrl(filters, next, shown);
  };
  const showMore = () => {
    const next = shown + PAGE_SIZE;
    setShown(next);
    writeUrl(filters, view, next);
  };

  // A phone gets cards unless the URL says otherwise: a five-column table
  // needs sideways scrolling there, and a triage list should not.
  useEffect(() => {
    if (searchParams.get("view") === null && window.innerWidth < 640) setView("cards");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = stays.filter((stay) => {
      if (filters.species !== "all" && stay.species !== filters.species) return false;
      if (filters.lifeStage !== "all" && stay.lifeStage !== filters.lifeStage) return false;
      if (filters.hideStale && stay.possiblyStale) return false;
      if (filters.minDays > 0 && stay.daysInCare < filters.minDays) return false;

      switch (filters.risk) {
        case "past60":
          if (stay.daysInCare <= LONG_STAY_HORIZON_DAYS) return false;
          break;
        case "unscored":
          if (stay.pLongStay60d !== null) return false;
          break;
        case "all":
          break;
        default: {
          // With no score there is no band, and an unscored animal must not
          // be silently swept into or out of an estimate filter.
          if (stay.pLongStay60d === null) return false;
          if (stay.pLongStay60d < TRIAGE_THRESHOLDS[filters.risk]) return false;
        }
      }

      if (search) {
        const haystack = `${stay.name ?? ""} ${stay.animalId} ${stay.breed ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const sorted = filtered.slice();
    if (filters.sort === "days") {
      sorted.sort((a, b) => b.daysInCare - a.daysInCare);
    } else if (filters.sort === "arrival") {
      sorted.sort((a, b) => a.intakeAt.localeCompare(b.intakeAt));
    }
    // "risk" keeps the server ordering, which already handles unscored rows.
    return sorted;
  }, [stays, filters]);

  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);
  const remaining = visible.length - page.length;

  const counts = useMemo(
    () => ({
      past60: visible.filter((s) => s.daysInCare > LONG_STAY_HORIZON_DAYS).length,
      unscored: visible.filter((s) => s.pLongStay60d === null).length,
    }),
    [visible],
  );

  const filtersActive =
    filters.species !== "all" ||
    filters.lifeStage !== "all" ||
    filters.risk !== "all" ||
    filters.minDays > 0 ||
    filters.hideStale ||
    filters.search.trim().length > 0;

  const rowProps = { scoring, channels, drivers, picks };

  return (
    <div className="space-y-4">
      <QueueControls
        filters={filters}
        onChange={changeFilters}
        view={view}
        onViewChange={changeView}
        scoring={scoring}
        resultCount={visible.length}
        total={stays.length}
      />

      <p className="t-small" aria-live="polite" style={{ color: "var(--ink-secondary)" }}>
        {visible.length > shown
          ? `Showing ${formatCount(shown)} of ${formatCount(visible.length)} matching stays, out of ${formatCount(
              stays.length,
            )} open.`
          : `${formatCount(visible.length)} of ${formatCount(stays.length)} open stays.`}
        {counts.past60 > 0 ? ` ${formatCount(counts.past60)} already waiting over 60 days.` : ""}
        {scoring && counts.unscored > 0 ? ` ${formatCount(counts.unscored)} without a prediction.` : ""}
      </p>

      {visible.length === 0 ? (
        <div
          className="border p-8 text-center"
          style={{
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
            {filtersActive ? QUEUE.emptyFiltered : QUEUE.emptyNoFilter}
          </p>
          {filtersActive ? (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => changeFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
            >
              {QUEUE.clearFilters}
            </Button>
          ) : null}
        </div>
      ) : view === "cards" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {page.map((stay) => (
            <li key={stay.episodeId}>
              <QueueCard stay={stay} {...rowProps} />
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="overflow-x-auto border"
          style={{
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <table className="w-full border-collapse" style={{ minWidth: 760 }}>
            <caption className="sr-only">
              {scoring
                ? "Open shelter stays, ordered by intake-time long-stay estimate"
                : "Open shelter stays, ordered by days waiting"}
            </caption>
            <thead className="sticky top-0 z-[1]" style={{ background: "var(--surface-card)" }}>
              <tr>
                <th scope="col" className="t-caption px-4 py-3 text-left" style={headStyle}>
                  {QUEUE.columns.animal}
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-left" style={headStyle}>
                  {QUEUE.columns.details}
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-right" style={headStyle}>
                  {QUEUE.columns.wait}
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-right" style={headStyle}>
                  {scoring ? QUEUE.columns.estimate : QUEUE.columns.status}
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-right" style={headStyle}>
                  {QUEUE.columns.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.map((stay) => (
                <QueueRow
                  key={stay.episodeId}
                  stay={stay}
                  {...rowProps}
                  expanded={expanded === stay.episodeId}
                  onToggle={() =>
                    setExpanded((current) => (current === stay.episodeId ? null : stay.episodeId))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {remaining > 0 ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={showMore}>
            {`Show ${formatCount(Math.min(PAGE_SIZE, remaining))} more`}
            <span className="t-caption ml-2 font-normal" style={{ color: "var(--ink-muted)" }}>
              {`${formatCount(remaining)} still to review`}
            </span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const headStyle = {
  borderBottom: "1px solid var(--border-hairline)",
  color: "var(--ink-muted)",
} as const;

export default QueueClient;
