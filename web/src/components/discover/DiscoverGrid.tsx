"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DISCOVER } from "@/lib/content";
import { formatAge, formatCount } from "@/lib/format";
import MonogramTile from "@/components/ui/MonogramTile";
import type { ScoredStay } from "@/lib/shelter.server";
import { DUR, EASE_OUT } from "@/lib/motion";

const StaggerReveal = dynamic(() => import("@/components/motion/StaggerReveal"), {
  ssr: false,
  loading: () => null,
});

type SpeciesFilter = "all" | "Dog" | "Cat";

const FILTERS: { id: SpeciesFilter; label: string }[] = [
  { id: "all", label: "All animals" },
  { id: "Dog", label: "Dogs" },
  { id: "Cat", label: "Cats" },
];

/**
 * The public grid of current records.
 *
 * Cards carry no probability and no risk band. A member of the public reading
 * about a specific animal does not need a model's estimate of how long it will
 * wait, and showing one would invite exactly the reading the guardrails
 * forbid. What they do carry is how long the animal has been there, which is a
 * measurement and is the thing that makes the case.
 */
export function DiscoverGrid({ stays }: { stays: ScoredStay[] }) {
  const [species, setSpecies] = useState<SpeciesFilter>("all");

  const visible = useMemo(
    () =>
      stays
        .filter((stay) => species === "all" || stay.species === species)
        .slice()
        .sort((a, b) => b.daysInCare - a.daysInCare),
    [stays, species],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by species" className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = species === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSpecies(filter.id)}
                className="t-small relative rounded-[var(--radius-full)] border px-4 py-2"
                style={{
                  borderColor: active ? "transparent" : "var(--border-hairline)",
                  background: active ? "var(--accent)" : "var(--surface-card)",
                  color: active ? "var(--accent-contrast)" : "var(--ink-secondary)",
                }}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <p className="t-small" aria-live="polite" style={{ color: "var(--ink-muted)" }}>
          {`${formatCount(visible.length)} shown · ${DISCOVER.sortDefaultLabel.toLowerCase()}`}
        </p>
      </div>

      <p className="t-caption mt-3" style={{ color: "var(--ink-muted)" }}>
        {DISCOVER.photoNote}
      </p>

      {visible.length === 0 ? (
        <p className="t-body mt-8" style={{ color: "var(--ink-secondary)" }}>
          {DISCOVER.empty}
        </p>
      ) : (
        // Keyed on the filter so the stagger replays when the set changes,
        // which reads as the grid rebuilding rather than as rows twitching.
        <StaggerReveal
          key={species}
          className="mt-6"
          selector=":scope > ul > li"
          stagger={0.03}
          distance={12}
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((stay) => (
              <li key={stay.episodeId}>
                <StayCard stay={stay} />
              </li>
            ))}
          </ul>
        </StaggerReveal>
      )}
    </div>
  );
}

function StayCard({ stay }: { stay: ScoredStay }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: DUR.fast, ease: EASE_OUT }}
      className="h-full"
    >
      <Link
        href={`/discover/${encodeURIComponent(stay.episodeId)}`}
        className="flex h-full flex-col border p-5"
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
            <p className="t-subtitle truncate" style={{ color: "var(--ink-primary)" }}>
              {stay.name ?? DISCOVER.noName}
            </p>
            <p className="t-caption font-mono" style={{ color: "var(--ink-muted)" }}>
              {stay.animalId}
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-1.5">
          <Fact label="Species" value={stay.species} />
          <Fact label="Breed" value={stay.breed} />
          <Fact
            label="Age"
            value={stay.currentAgeDays === null ? null : formatAge(stay.currentAgeDays)}
          />
        </dl>

        <div className="mt-auto pt-4">
          <p className="t-small" style={{ color: "var(--ink-primary)" }}>
            <span className="tabular font-semibold" style={{ color: "var(--accent-warm-strong)" }}>
              {stay.daysInCare}
            </span>{" "}
            <span style={{ color: "var(--ink-secondary)" }}>days on record</span>
          </p>
          {stay.possiblyStale ? (
            <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
              Open over a year — may not have been closed
            </p>
          ) : null}
        </div>
      </Link>
    </motion.div>
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
