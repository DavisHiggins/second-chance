"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { DISCOVER } from "@/lib/content";
import { childVariant, DUR, EASE_OUT, pageContainer } from "@/lib/motion";
import { formatCount } from "@/lib/format";
import { currentAge, publicSentence } from "@/lib/publicCopy";
import MonogramTile from "@/components/ui/MonogramTile";
import type { QueueAnimal } from "@/types/api";

type ChipId = "Dog" | "Cat" | "under-one" | "over-seven";

const CHIPS: Array<{ id: ChipId; label: string }> = [
  { id: "Dog", label: "Dogs" },
  { id: "Cat", label: "Cats" },
  { id: "under-one", label: "Under a year" },
  { id: "over-seven", label: "Over seven" },
];

function Card({ animal, index }: { animal: QueueAnimal; index: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.li variants={childVariant(index)}>
      <motion.div
        whileHover={reducedMotion ? undefined : { y: -4, boxShadow: "var(--elev-3)" }}
        transition={{ duration: DUR.base, ease: EASE_OUT }}
        className="h-full border"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border-hairline)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--elev-1)",
        }}
      >
        {/* The whole card is the link target. */}
        <Link
          href={`/discover/${animal.animal_id}`}
          className="flex h-full flex-col gap-3 p-5"
          style={{ color: "var(--ink-primary)" }}
        >
          <MonogramTile name={animal.name} size={72} radius="lg" />
          <h3 className="t-title">{animal.name ?? "Waiting for a name"}</h3>
          <p className="t-small flex-1" style={{ color: "var(--ink-secondary)" }}>
            {publicSentence(animal)}
          </p>
          <span
            className="t-caption tabular self-start rounded-[var(--radius-full)] px-2.5 py-1"
            style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
          >
            {`Waiting ${formatCount(animal.days_in_care)} days`}
          </span>
        </Link>
      </motion.div>
    </motion.li>
  );
}

export function DiscoverGrid({ animals }: { animals: QueueAnimal[] }) {
  const [active, setActive] = useState<ChipId[]>([]);

  const filtered = useMemo(() => {
    const species: string[] = active.filter((chip) => chip === "Dog" || chip === "Cat");
    return animals
      .filter((animal) => {
        if (species.length > 0 && !species.includes(animal.animal_type)) return false;
        if (active.includes("under-one") && currentAge(animal) >= 365) return false;
        if (active.includes("over-seven") && currentAge(animal) < 365 * 7) return false;
        return true;
      })
      .sort((a, b) => b.days_in_care - a.days_in_care);
  }, [animals, active]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => {
          const on = active.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setActive((current) =>
                  current.includes(chip.id)
                    ? current.filter((value) => value !== chip.id)
                    : [...current, chip.id],
                )
              }
              className="t-small rounded-[var(--radius-full)] border px-3 py-1.5"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border-hairline)",
                background: on ? "var(--surface-sunken)" : "var(--surface-card)",
                color: on ? "var(--ink-primary)" : "var(--ink-secondary)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
        <span className="t-caption ml-auto" style={{ color: "var(--ink-muted)" }}>
          {DISCOVER.sortDefaultLabel}
        </span>
      </div>

      <p aria-live="polite" className="t-small mt-4" style={{ color: "var(--ink-secondary)" }}>
        {`Showing ${formatCount(filtered.length)} of ${formatCount(animals.length)} animals`}
      </p>

      {filtered.length === 0 ? (
        <p className="t-body mt-8" style={{ color: "var(--ink-secondary)" }}>
          {DISCOVER.empty}
        </p>
      ) : (
        <motion.ul
          variants={pageContainer}
          initial="hidden"
          animate="show"
          className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((animal, index) => (
            <Card key={animal.animal_id} animal={animal} index={index} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

export default DiscoverGrid;
