"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { QUEUE } from "@/lib/content";
import { formatCount } from "@/lib/format";
import QueueControls, { type QueueFilters, EMPTY_FILTERS } from "@/components/queue/QueueControls";
import QueueRow from "@/components/queue/QueueRow";
import QueueCard from "@/components/queue/QueueCard";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

const StaggerReveal = dynamic(() => import("@/components/motion/StaggerReveal"), {
  ssr: false,
  loading: () => null,
});

export type QueueView = "table" | "cards";

/**
 * The staff queue.
 *
 * Filtering and sorting happen here rather than on the server because the
 * whole open population is a few hundred rows: shipping them once and
 * filtering in the browser is faster to use than a round trip per keystroke,
 * and it keeps the page working while the connection is poor.
 *
 * Sorting by risk is only offered when a validated model is scoring. It is not
 * disabled with a tooltip; it is absent, because a control that promises an
 * ordering the data cannot produce is worse than no control.
 */
export function QueueClient({
  stays,
  scoring,
  channels,
}: {
  stays: ScoredStay[];
  scoring: boolean;
  channels: InterventionChannel[];
}) {
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<QueueView>("table");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = stays.filter((stay) => {
      if (filters.species !== "all" && stay.species !== filters.species) return false;
      if (filters.lifeStage !== "all" && stay.lifeStage !== filters.lifeStage) return false;
      if (filters.hideStale && stay.possiblyStale) return false;

      if (filters.minDays > 0 && stay.daysInCare < filters.minDays) return false;

      if (filters.risk !== "all") {
        // With no score there is no band, and an unscored animal must not be
        // silently swept into or out of a risk filter.
        if (stay.pLongStay60d === null) return false;
        const floor = filters.risk === "critical" ? 0.6 : filters.risk === "serious" ? 0.4 : 0.25;
        if (stay.pLongStay60d < floor) return false;
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

  const filtersActive =
    filters.species !== "all" ||
    filters.lifeStage !== "all" ||
    filters.risk !== "all" ||
    filters.minDays > 0 ||
    filters.hideStale ||
    filters.search.trim().length > 0;

  return (
    <div className="space-y-4">
      <QueueControls
        filters={filters}
        onChange={setFilters}
        view={view}
        onViewChange={setView}
        scoring={scoring}
        resultCount={visible.length}
      />

      <p className="t-small" aria-live="polite" style={{ color: "var(--ink-muted)" }}>
        {`${formatCount(visible.length)} of ${formatCount(stays.length)} open stays`}
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
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="t-small mt-4 rounded-[var(--radius-md)] border px-4 py-2"
              style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
            >
              {QUEUE.clearFilters}
            </button>
          ) : null}
        </div>
      ) : view === "cards" ? (
        <StaggerReveal key="cards" selector=":scope > ul > li" stagger={0.028} distance={12}>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((stay) => (
              <li key={stay.episodeId}>
                <QueueCard stay={stay} scoring={scoring} channels={channels} />
              </li>
            ))}
          </ul>
        </StaggerReveal>
      ) : (
        <div
          className="overflow-x-auto border"
          style={{
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <table className="w-full border-collapse">
            <caption className="sr-only">
              {scoring
                ? "Open shelter stays, ranked by estimated long-stay risk"
                : "Open shelter stays, ordered by days waiting"}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="t-caption px-4 py-3 text-left" style={headStyle}>
                  Animal
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-left" style={headStyle}>
                  Details
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-right" style={headStyle}>
                  Days waiting
                </th>
                <th scope="col" className="t-caption px-4 py-3 text-right" style={headStyle}>
                  {scoring ? "Long-stay risk" : "Status"}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((stay) => (
                <QueueRow
                  key={stay.episodeId}
                  stay={stay}
                  scoring={scoring}
                  channels={channels}
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
    </div>
  );
}

const headStyle = {
  borderBottom: "1px solid var(--border-hairline)",
  color: "var(--ink-muted)",
} as const;

export default QueueClient;
