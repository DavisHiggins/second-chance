"use client";

import { Search } from "lucide-react";
import { QUEUE } from "@/lib/content";
import { formatPercent } from "@/lib/format";

export type SpeciesFilter = "all" | "Dog" | "Cat";
export type SortKey = "risk" | "days" | "arrival";

const SPECIES: Array<{ value: SpeciesFilter; label: string }> = [
  { value: "all", label: QUEUE.filterSpecies[0] },
  { value: "Dog", label: QUEUE.filterSpecies[1] },
  { value: "Cat", label: QUEUE.filterSpecies[2] },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "risk", label: QUEUE.filterSort[0] },
  { value: "days", label: QUEUE.filterSort[1] },
  { value: "arrival", label: QUEUE.filterSort[2] },
];

export function QueueControls({
  species,
  threshold,
  sort,
  search,
  onSpecies,
  onThreshold,
  onThresholdCommit,
  onSort,
  onSearch,
}: {
  species: SpeciesFilter;
  threshold: number;
  sort: SortKey;
  search: string;
  onSpecies: (value: SpeciesFilter) => void;
  onThreshold: (value: number) => void;
  onThresholdCommit: (value: number) => void;
  onSort: (value: SortKey) => void;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <fieldset>
        <legend className="t-caption" style={{ color: "var(--ink-muted)" }}>
          Species
        </legend>
        <div className="mt-1.5 flex gap-1">
          {SPECIES.map((option) => {
            const active = species === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSpecies(option.value)}
                aria-pressed={active}
                className="t-small rounded-[var(--radius-full)] border px-3 py-1.5"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border-hairline)",
                  background: active ? "var(--surface-sunken)" : "var(--surface-card)",
                  color: active ? "var(--ink-primary)" : "var(--ink-secondary)",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="min-w-[220px]">
        <label className="t-caption" htmlFor="risk-threshold" style={{ color: "var(--ink-muted)" }}>
          {`Show animals above ${formatPercent(threshold)} risk`}
        </label>
        <input
          id="risk-threshold"
          type="range"
          min={0.3}
          max={0.9}
          step={0.01}
          value={threshold}
          onChange={(event) => onThreshold(Number(event.target.value))}
          onPointerUp={(event) => onThresholdCommit(Number(event.currentTarget.value))}
          onKeyUp={(event) => onThresholdCommit(Number(event.currentTarget.value))}
          onBlur={(event) => onThresholdCommit(Number(event.currentTarget.value))}
          className="mt-2 w-full"
          style={{ accentColor: "var(--accent)" }}
        />
      </div>

      <div>
        <label className="t-caption" htmlFor="queue-sort" style={{ color: "var(--ink-muted)" }}>
          Order
        </label>
        <select
          id="queue-sort"
          value={sort}
          onChange={(event) => onSort(event.target.value as SortKey)}
          className="t-small mt-1.5 block rounded-[var(--radius-md)] border px-3 py-2"
          style={{
            borderColor: "var(--border-hairline)",
            background: "var(--surface-card)",
            color: "var(--ink-primary)",
          }}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[200px] flex-1">
        <label className="t-caption" htmlFor="queue-search" style={{ color: "var(--ink-muted)" }}>
          Search
        </label>
        <div className="relative mt-1.5">
          <Search
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--ink-muted)" }}
          />
          <input
            id="queue-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={QUEUE.searchPlaceholder}
            className="t-small w-full rounded-[var(--radius-md)] border py-2 pl-9 pr-3"
            style={{
              borderColor: "var(--border-hairline)",
              background: "var(--surface-card)",
              color: "var(--ink-primary)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default QueueControls;
