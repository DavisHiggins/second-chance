"use client";

import { LayoutGrid, Rows3, Search } from "lucide-react";
import { QUEUE } from "@/lib/content";
import type { QueueView } from "@/components/queue/QueueClient";

export type SpeciesFilter = "all" | "Dog" | "Cat";
export type LifeStageFilter = "all" | "juvenile" | "adult" | "senior" | "unknown";
export type RiskFilter = "all" | "warning" | "serious" | "critical";
export type SortKey = "risk" | "days" | "arrival";

export interface QueueFilters {
  species: SpeciesFilter;
  lifeStage: LifeStageFilter;
  risk: RiskFilter;
  minDays: number;
  hideStale: boolean;
  search: string;
  sort: SortKey;
}

export const EMPTY_FILTERS: QueueFilters = {
  species: "all",
  lifeStage: "all",
  risk: "all",
  minDays: 0,
  hideStale: false,
  search: "",
  sort: "risk",
};

/**
 * The sticky command bar.
 *
 * It stays on screen while the list scrolls, because the whole point of a
 * triage queue is narrowing it, and a filter you have to scroll back up to
 * reach is one you stop using.
 */
export function QueueControls({
  filters,
  onChange,
  view,
  onViewChange,
  scoring,
  resultCount,
}: {
  filters: QueueFilters;
  onChange: (next: QueueFilters) => void;
  view: QueueView;
  onViewChange: (next: QueueView) => void;
  scoring: boolean;
  resultCount: number;
}) {
  const set = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div
      className="sticky top-16 z-20 border p-3 lg:top-16"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--elev-1)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[13rem] flex-1 items-center">
          <span className="sr-only">{QUEUE.searchPlaceholder}</span>
          <Search
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
            className="pointer-events-none absolute left-3"
            color="var(--ink-muted)"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder={QUEUE.searchPlaceholder}
            className="t-small w-full rounded-[var(--radius-md)] border py-2 pl-9 pr-3"
            style={{
              background: "var(--surface-page)",
              borderColor: "var(--border-hairline)",
              color: "var(--ink-primary)",
            }}
          />
        </label>

        <Select
          label="Species"
          value={filters.species}
          onChange={(value) => set("species", value as SpeciesFilter)}
          options={[
            ["all", "All animals"],
            ["Dog", "Dogs"],
            ["Cat", "Cats"],
          ]}
        />

        <Select
          label="Life stage"
          value={filters.lifeStage}
          onChange={(value) => set("lifeStage", value as LifeStageFilter)}
          options={[
            ["all", "All ages"],
            ["juvenile", "Under a year"],
            ["adult", "Adult"],
            ["senior", "Senior"],
            ["unknown", "Age not recorded"],
          ]}
        />

        {/* A risk filter with nothing to filter on would be a lie about what
            the page knows, so it is absent rather than disabled. */}
        {scoring ? (
          <Select
            label="Risk band"
            value={filters.risk}
            onChange={(value) => set("risk", value as RiskFilter)}
            options={[
              ["all", "Any risk"],
              ["warning", "Warning and above"],
              ["serious", "Serious and above"],
              ["critical", "Critical only"],
            ]}
          />
        ) : null}

        <Select
          label="Minimum wait"
          value={String(filters.minDays)}
          onChange={(value) => set("minDays", Number(value))}
          options={[
            ["0", "Any wait"],
            ["14", "14+ days"],
            ["30", "30+ days"],
            ["60", "60+ days"],
            ["90", "90+ days"],
          ]}
        />

        <Select
          label="Sort"
          value={filters.sort}
          onChange={(value) => set("sort", value as SortKey)}
          options={
            scoring
              ? ([
                  ["risk", "Sort by risk"],
                  ["days", "Sort by days waiting"],
                  ["arrival", "Sort by arrival date"],
                ] as [string, string][])
              : ([
                  ["days", "Sort by days waiting"],
                  ["arrival", "Sort by arrival date"],
                ] as [string, string][])
          }
        />

        <label
          className="t-small inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2"
          style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
        >
          <input
            type="checkbox"
            checked={filters.hideStale}
            onChange={(event) => set("hideStale", event.target.checked)}
          />
          Hide possibly stale
        </label>

        <div className="ml-auto flex items-center gap-1" role="group" aria-label="View">
          <ViewToggle
            active={view === "table"}
            onClick={() => onViewChange("table")}
            label={QUEUE.viewTable}
          >
            <Rows3 size={16} strokeWidth={1.5} aria-hidden="true" />
          </ViewToggle>
          <ViewToggle
            active={view === "cards"}
            onClick={() => onViewChange("cards")}
            label={QUEUE.viewCards}
          >
            <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
          </ViewToggle>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {`${resultCount} animals match the current filters.`}
      </p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="t-small rounded-[var(--radius-md)] border px-3 py-2"
        style={{
          background: "var(--surface-page)",
          borderColor: "var(--border-hairline)",
          color: "var(--ink-primary)",
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border"
      style={{
        borderColor: active ? "transparent" : "var(--border-hairline)",
        background: active ? "var(--accent)" : "var(--surface-card)",
        color: active ? "var(--accent-contrast)" : "var(--ink-secondary)",
      }}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

export default QueueControls;
