"use client";

import { useState } from "react";
import { LayoutGrid, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { QUEUE } from "@/lib/content";
import { TRIAGE_DEFINITION, TRIAGE_LABEL } from "@/lib/model/horizon";
import type { QueueView } from "@/components/queue/QueueClient";

export type SpeciesFilter = "all" | "Dog" | "Cat";
export type LifeStageFilter = "all" | "juvenile" | "adult" | "senior" | "unknown";
export type RiskFilter = "all" | "warning" | "serious" | "critical" | "past60" | "unscored";
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

const SPECIES_OPTIONS: [SpeciesFilter, string][] = [
  ["all", "All animals"],
  ["Dog", "Dogs"],
  ["Cat", "Cats"],
];

const LIFE_STAGE_OPTIONS: [LifeStageFilter, string][] = [
  ["all", "All ages"],
  ["juvenile", "Under a year"],
  ["adult", "Adult"],
  ["senior", "Senior"],
  ["unknown", "Age not recorded"],
];

const WAIT_OPTIONS: [string, string][] = [
  ["0", "Any wait"],
  ["14", "14+ days"],
  ["30", "30+ days"],
  ["60", "60+ days"],
  ["90", "90+ days"],
];

function riskOptions(): [RiskFilter, string][] {
  return [
    ["all", "All estimates"],
    ["warning", `${TRIAGE_LABEL.warning} and above`],
    ["serious", `${TRIAGE_LABEL.serious} and above`],
    ["critical", `${TRIAGE_LABEL.critical} only`],
    ["past60", "Already waiting over 60 days"],
    ["unscored", "Prediction unavailable"],
  ];
}

/**
 * The sticky command bar.
 *
 * Every control has a visible label. Active filters repeat as chips beneath
 * the bar, each with its own remove button, and a single reset clears them
 * all. The bar stays on screen while the list scrolls, because the point of
 * a triage queue is narrowing it, and a filter you have to scroll back up to
 * reach is one you stop using.
 */
export function QueueControls({
  filters,
  onChange,
  view,
  onViewChange,
  scoring,
  resultCount,
  total,
}: {
  filters: QueueFilters;
  onChange: (next: QueueFilters) => void;
  view: QueueView;
  onViewChange: (next: QueueView) => void;
  scoring: boolean;
  resultCount: number;
  total: number;
}) {
  const set = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const chips: { key: keyof QueueFilters; label: string }[] = [];
  if (filters.search.trim()) chips.push({ key: "search", label: `“${filters.search.trim()}”` });
  if (filters.species !== "all")
    chips.push({ key: "species", label: SPECIES_OPTIONS.find(([v]) => v === filters.species)?.[1] ?? "" });
  if (filters.lifeStage !== "all")
    chips.push({ key: "lifeStage", label: LIFE_STAGE_OPTIONS.find(([v]) => v === filters.lifeStage)?.[1] ?? "" });
  if (filters.risk !== "all")
    chips.push({ key: "risk", label: riskOptions().find(([v]) => v === filters.risk)?.[1] ?? "" });
  if (filters.minDays > 0) chips.push({ key: "minDays", label: `${filters.minDays}+ days` });
  if (filters.hideStale) chips.push({ key: "hideStale", label: QUEUE.staleLabel });

  const clearOne = (key: keyof QueueFilters) => onChange({ ...filters, [key]: EMPTY_FILTERS[key] });

  // Below `lg` the full set of controls would fill a phone screen, so it
  // folds behind one button; the search box, the chips and the reset stay
  // visible. On large screens the bar is always open and sticks.
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border p-3 sm:p-4 lg:sticky lg:top-16 lg:z-20"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--elev-1)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="queue-filter-panel"
          className="btn btn--secondary btn--sm"
        >
          <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden="true" />
          {`Filters${chips.length > 0 ? ` (${chips.length})` : ""}`}
        </button>
        <div className="flex items-center gap-1" role="group" aria-label={QUEUE.viewLabel}>
          <ViewToggle active={view === "table"} onClick={() => onViewChange("table")} label={QUEUE.viewTable}>
            <Rows3 size={16} strokeWidth={1.5} aria-hidden="true" />
          </ViewToggle>
          <ViewToggle active={view === "cards"} onClick={() => onViewChange("cards")} label={QUEUE.viewCards}>
            <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
          </ViewToggle>
        </div>
      </div>

      <div
        id="queue-filter-panel"
        className={`${expanded ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-[minmax(14rem,1.4fr)_repeat(4,minmax(0,1fr))]`}
      >
        <label className="block">
          <span className="field-label">{QUEUE.searchLabel}</span>
          <span className="relative flex items-center">
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
              className="field w-full pl-9"
            />
          </span>
        </label>

        <Select
          label={QUEUE.speciesLabel}
          value={filters.species}
          onChange={(value) => set("species", value as SpeciesFilter)}
          options={SPECIES_OPTIONS}
        />

        <Select
          label={QUEUE.lifeStageLabel}
          value={filters.lifeStage}
          onChange={(value) => set("lifeStage", value as LifeStageFilter)}
          options={LIFE_STAGE_OPTIONS}
        />

        {scoring ? (
          <Select
            label={QUEUE.riskLabel}
            value={filters.risk}
            onChange={(value) => set("risk", value as RiskFilter)}
            options={riskOptions()}
            title={TRIAGE_DEFINITION}
          />
        ) : (
          <Select
            label={QUEUE.riskLabel}
            value={filters.risk === "past60" ? "past60" : "all"}
            onChange={(value) => set("risk", value as RiskFilter)}
            options={[
              ["all", "All stays"],
              ["past60", "Already waiting over 60 days"],
            ]}
          />
        )}

        <Select
          label={QUEUE.waitLabel}
          value={String(filters.minDays)}
          onChange={(value) => set("minDays", Number(value))}
          options={WAIT_OPTIONS}
        />
      </div>

      <div className={`${expanded ? "flex" : "hidden"} mt-3 flex-wrap items-center gap-x-4 gap-y-2 lg:flex`}>
        <Select
          label={QUEUE.sortLabel}
          inline
          value={filters.sort}
          onChange={(value) => set("sort", value as SortKey)}
          options={
            scoring
              ? ([
                  ["risk", "Intake-time estimate"],
                  ["days", "Days waiting"],
                  ["arrival", "Arrival date"],
                ] as [string, string][])
              : ([
                  ["days", "Days waiting"],
                  ["arrival", "Arrival date"],
                ] as [string, string][])
          }
        />

        <label className="t-small inline-flex min-h-[44px] cursor-pointer items-center gap-2" style={{ color: "var(--ink-secondary)" }}>
          <input
            type="checkbox"
            checked={filters.hideStale}
            onChange={(event) => set("hideStale", event.target.checked)}
            style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
          />
          {QUEUE.staleLabel}
        </label>

        <div className="ml-auto hidden items-center gap-1 lg:flex" role="group" aria-label={QUEUE.viewLabel}>
          <ViewToggle active={view === "table"} onClick={() => onViewChange("table")} label={QUEUE.viewTable}>
            <Rows3 size={16} strokeWidth={1.5} aria-hidden="true" />
          </ViewToggle>
          <ViewToggle active={view === "cards"} onClick={() => onViewChange("cards")} label={QUEUE.viewCards}>
            <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
          </ViewToggle>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={QUEUE.activeFilters}>
          {chips.map((chip) => (
            <span key={chip.key} className="chip">
              {chip.label}
              <button type="button" onClick={() => clearOne(chip.key)} aria-label={`Remove filter ${chip.label}`}>
                <X size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="t-small link-reveal min-h-[32px] px-1"
          >
            {QUEUE.resetFilters}
          </button>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {`${resultCount} of ${total} animals match the current filters.`}
      </p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  inline = false,
  title,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  inline?: boolean;
  title?: string;
}) {
  return (
    <label className={inline ? "inline-flex items-center gap-2" : "block"} title={title}>
      <span className={inline ? "t-caption" : "field-label"} style={inline ? { color: "var(--ink-secondary)" } : undefined}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`field ${inline ? "" : "w-full"}`}
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
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
