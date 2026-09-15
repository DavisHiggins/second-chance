"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { DISCOVER } from "@/lib/content";
import { formatAge, formatCount, formatDate } from "@/lib/format";
import MonogramTile from "@/components/ui/MonogramTile";
import Button from "@/components/ui/Button";
import { RevealItem } from "@/components/motion/RevealSection";
import type { PublicStay } from "@/lib/shelter.server";

type SpeciesFilter = "all" | "Dog" | "Cat";
type AgeFilter = "all" | "under1" | "1to7" | "over7" | "unknown";
type WaitFilter = "all" | "7" | "30" | "60" | "180";

const SPECIES: [SpeciesFilter, string][] = [
  ["all", "All animals"],
  ["Dog", "Dogs"],
  ["Cat", "Cats"],
];
const AGES: [AgeFilter, string][] = [
  ["all", "Any age"],
  ["under1", "Under a year"],
  ["1to7", "1 to 7 years"],
  ["over7", "Over 7 years"],
  ["unknown", "Age not recorded"],
];
const WAITS: [WaitFilter, string][] = [
  ["all", "Any wait"],
  ["7", "7+ days"],
  ["30", "30+ days"],
  ["60", "60+ days"],
  ["180", "180+ days"],
];

/** How many cards render per batch. The first batch is server-rendered, so
 *  it is in the initial HTML; each press of "Show more" appends one more. */
const BATCH = 100;

interface Filters {
  q: string;
  species: SpeciesFilter;
  age: AgeFilter;
  wait: WaitFilter;
}

function pick<T extends string>(value: string | null, allowed: readonly [T, string][], fallback: T): T {
  return value !== null && allowed.some(([v]) => v === value) ? (value as T) : fallback;
}

function ageMatches(days: number | null, filter: AgeFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unknown":
      return days === null;
    case "under1":
      return days !== null && days < 365;
    case "1to7":
      return days !== null && days >= 365 && days < 7 * 365.25;
    case "over7":
      return days !== null && days >= 7 * 365.25;
  }
}

/**
 * The public grid of current records.
 *
 * Cards carry no probability and no risk band, and the `PublicStay` they are
 * given has nowhere to put one. What they do carry is how long the animal
 * has been there, which is a measurement, plus the record's status. Filters
 * live in the URL; the first batch is server-rendered and the rest arrive on
 * request, and the summary says how many match against how many are shown
 * rather than implying the whole set is on screen.
 */
export function DiscoverGrid({ stays, initialQuery = "" }: { stays: PublicStay[]; initialQuery?: string }) {
  const pathname = usePathname();
  // The query string arrives from the server page rather than from
  // `useSearchParams`, which would push the whole grid to a client-only
  // render and take the first batch out of the initial HTML.
  const params = useMemo(() => new URLSearchParams(initialQuery), [initialQuery]);
  const initial = useMemo<Filters>(
    () => ({
      q: (params.get("q") ?? "").slice(0, 80),
      species: pick(params.get("species"), SPECIES, "all"),
      age: pick(params.get("age"), AGES, "all"),
      wait: pick(params.get("wait"), WAITS, "all"),
    }),
    [params],
  );
  const [filters, setFilters] = useState<Filters>(initial);
  const [shown, setShown] = useState(Math.max(BATCH, Math.min(2000, Number(params.get("show") ?? BATCH) || BATCH)));

  const write = useCallback(
    (next: Filters, nextShown: number) => {
      const out = new URLSearchParams();
      if (next.q.trim()) out.set("q", next.q.trim());
      if (next.species !== "all") out.set("species", next.species);
      if (next.age !== "all") out.set("age", next.age);
      if (next.wait !== "all") out.set("wait", next.wait);
      if (nextShown > BATCH) out.set("show", String(nextShown));
      const query = out.toString();
      const url = `${pathname}${query ? `?${query}` : ""}`;
      if (`${window.location.pathname}${window.location.search}` !== url) {
        window.history.replaceState(window.history.state, "", url);
      }
    },
    [pathname],
  );

  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setShown(BATCH);
    write(next, BATCH);
  };

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const minWait = filters.wait === "all" ? 0 : Number(filters.wait);
    return stays
      .filter((stay) => {
        if (filters.species !== "all" && stay.species !== filters.species) return false;
        if (!ageMatches(stay.currentAgeDays, filters.age)) return false;
        if (stay.daysInCare < minWait) return false;
        if (q && !`${stay.name ?? ""} ${stay.animalId}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.daysInCare - a.daysInCare);
  }, [stays, filters]);

  const page = visible.slice(0, shown);
  const active = filters.q.trim() || filters.species !== "all" || filters.age !== "all" || filters.wait !== "all";

  return (
    <div>
      <div
        className="grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(0,1fr))] sm:p-4"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border-hairline)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <label className="block">
          <span className="field-label">{DISCOVER.searchLabel}</span>
          <span className="relative flex items-center">
            <Search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-3" color="var(--ink-muted)" />
            <input
              type="search"
              value={filters.q}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="Name or animal ID"
              className="field w-full pl-9"
            />
          </span>
        </label>
        <SelectField label={DISCOVER.speciesLabel} value={filters.species} options={SPECIES} onChange={(v) => update({ species: v as SpeciesFilter })} />
        <SelectField label={DISCOVER.ageLabel} value={filters.age} options={AGES} onChange={(v) => update({ age: v as AgeFilter })} />
        <SelectField label={DISCOVER.waitLabel} value={filters.wait} options={WAITS} onChange={(v) => update({ wait: v as WaitFilter })} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="t-small" aria-live="polite" style={{ color: "var(--ink-secondary)" }}>
          {`${formatCount(visible.length)} records match; ${formatCount(page.length)} shown · ${DISCOVER.sortDefaultLabel.toLowerCase()}`}
        </p>
        {active ? (
          <button
            type="button"
            onClick={() => update({ q: "", species: "all", age: "all", wait: "all" })}
            className="t-small link-reveal inline-flex min-h-[32px] items-center gap-1"
          >
            <X size={13} strokeWidth={2} aria-hidden="true" />
            Reset filters
          </button>
        ) : null}
      </div>

      <p className="t-caption mt-2" style={{ color: "var(--ink-muted)" }}>
        {DISCOVER.photoNote}
      </p>

      {visible.length === 0 ? (
        <p className="t-body mt-8" style={{ color: "var(--ink-secondary)" }}>
          {DISCOVER.empty}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Each card reveals on its own as it enters the viewport, so a
              batch appended by "Show more" fades in exactly like the first.
              The stagger restarts with every batch. */}
          {page.map((stay, index) => (
            <RevealItem key={stay.episodeId} as="li" index={index % BATCH} standalone>
              <StayCard stay={stay} />
            </RevealItem>
          ))}
        </ul>
      )}

      {visible.length > page.length ? (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              const next = shown + BATCH;
              setShown(next);
              write(filters, next);
            }}
          >
            {DISCOVER.showMore}
            <span className="t-caption ml-2 font-normal" style={{ color: "var(--ink-muted)" }}>
              {`next ${formatCount(Math.min(BATCH, visible.length - page.length))} of ${formatCount(
                visible.length - page.length,
              )} more`}
            </span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="field w-full">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function StayCard({ stay }: { stay: PublicStay }) {
  return (
    <Link
      href={`/discover/${encodeURIComponent(stay.episodeId)}?from=records`}
      className="card-interactive flex h-full flex-col border p-5"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--elev-1)",
      }}
    >
      <div className="flex items-start gap-4">
        <MonogramTile name={stay.name} species={stay.species} size={56} radius="lg" />
        <div className="min-w-0">
          <p className="t-subtitle" style={{ color: "var(--ink-primary)", overflowWrap: "anywhere" }}>
            {stay.name ?? DISCOVER.noName}
          </p>
          <p className="t-caption font-mono" style={{ color: "var(--ink-muted)" }}>
            {`${stay.species} · ${stay.animalId}`}
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5">
        <Fact label="Breed" value={stay.breed} />
        <Fact label="Age now" value={stay.currentAgeDays === null ? "Not recorded" : formatAge(stay.currentAgeDays)} />
        <Fact label="Arrived" value={formatDate(stay.intakeAt)} />
      </dl>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <p className="t-small" style={{ color: "var(--ink-primary)" }}>
          <span className="tabular font-semibold" style={{ color: "var(--accent-warm-strong)" }}>
            {stay.daysInCare}
          </span>{" "}
          <span style={{ color: "var(--ink-secondary)" }}>days waiting</span>
          <span className="t-caption block" style={{ color: stay.possiblyStale ? "var(--status-warning)" : "var(--ink-muted)" }}>
            {stay.possiblyStale ? DISCOVER.recordStatusStale : DISCOVER.recordStatusOpen}
          </span>
        </p>
        <span className="t-small link-reveal shrink-0">{DISCOVER.viewRecord}</span>
      </div>
    </Link>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="t-caption" style={{ color: "var(--ink-muted)" }}>
        {label}
      </dt>
      <dd className="t-small truncate text-right" style={{ color: "var(--ink-secondary)" }}>
        {value}
      </dd>
    </div>
  );
}

export default DiscoverGrid;
