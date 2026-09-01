"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { QUEUE } from "@/lib/content";
import { checkPop, expandTransition } from "@/lib/motion";
import { formatCount, formatLabel } from "@/lib/format";
import { driverPhrase } from "@/lib/driverLabels";
import MonogramTile from "@/components/ui/MonogramTile";
import ProbabilityMeter from "@/components/queue/ProbabilityMeter";
import RiskBar, { BAND_LABEL } from "@/components/queue/RiskBar";
import ExpandedCard from "@/components/queue/ExpandedCard";
import type { InterventionChannel, QueueAnimal } from "@/types/api";

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border"
      style={{
        borderColor: "var(--border-hairline)",
        background: "var(--surface-card)",
        color: "var(--ink-secondary)",
      }}
    >
      {children}
    </button>
  );
}

export function QueueRow({
  animal,
  channel,
  expanded,
  actioned,
  onToggle,
  onAction,
}: {
  animal: QueueAnimal;
  channel: InterventionChannel | undefined;
  expanded: boolean;
  actioned: boolean;
  onToggle: () => void;
  onAction: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const topDriver = animal.drivers[0];
  const displayName = animal.name ?? QUEUE.unnamed;

  return (
    <motion.li
      layout={reducedMotion ? false : "position"}
      transition={expandTransition}
      className="overflow-hidden border"
      style={{
        background: hovered ? "var(--surface-sunken)" : "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        opacity: actioned ? 0.4 : 1,
        transition: "background var(--dur-instant) var(--ease-out), opacity var(--dur-base)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Below 640px the row becomes a card: identity first, then the numbers,
          then the driver. */}
      <div className="flex items-stretch gap-3 p-3" style={{ minHeight: "var(--row-height)" }}>
        <RiskBar band={animal.risk_band} hovered={hovered} />

        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <MonogramTile name={animal.name} />
            <div className="min-w-0">
              <p className="t-subtitle truncate" style={{ color: "var(--ink-primary)" }}>
                {animal.name ? (
                  displayName
                ) : (
                  <span className="italic" style={{ color: "var(--ink-muted)" }}>
                    {QUEUE.unnamed}
                  </span>
                )}
                <span className="t-caption ml-2 font-mono" style={{ color: "var(--ink-muted)" }}>
                  {animal.animal_id}
                </span>
              </p>
              <p className="t-small truncate" style={{ color: "var(--ink-secondary)" }}>
                {`${animal.breed} · ${formatLabel(animal.age_band)} · ${animal.sex_upon_intake}`}
              </p>
              <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
                {`Risk band: ${BAND_LABEL[animal.risk_band]}`}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="t-title tabular" style={{ color: "var(--ink-primary)" }}>
              {formatCount(animal.days_in_care)}
            </p>
            <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
              {QUEUE.daysLabel}
            </p>
          </div>

          <div className="shrink-0">
            <ProbabilityMeter value={animal.p_adopt_30d} interval={animal.interval?.p_adopt_30d} />
            <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
              {QUEUE.probabilityLabel}
            </p>
          </div>

          {topDriver ? (
            <span
              className="t-caption shrink-0 rounded-[var(--radius-full)] px-2.5 py-1"
              style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
            >
              {`${driverPhrase(topDriver)} · ${topDriver.direction} chance`}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconAction label={expanded ? QUEUE.collapse : QUEUE.expand} onClick={onToggle}>
            {expanded ? (
              <ChevronUp size={20} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={20} strokeWidth={1.5} />
            )}
          </IconAction>
          <IconAction label={`${QUEUE.markActioned}: ${displayName}`} onClick={onAction}>
            {actioned ? (
              <motion.span variants={checkPop} initial="hidden" animate="show">
                <Check size={20} strokeWidth={1.5} color="var(--status-good)" />
              </motion.span>
            ) : (
              <Check size={20} strokeWidth={1.5} />
            )}
          </IconAction>
          <Link
            href={`/animals/${animal.animal_id}`}
            aria-label={`${QUEUE.detailLink}: ${displayName}`}
            title={QUEUE.detailLink}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border"
            style={{
              borderColor: "var(--border-hairline)",
              background: "var(--surface-card)",
              color: "var(--ink-secondary)",
            }}
          >
            <ExternalLink size={20} strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="expansion"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={expandTransition}
            style={{ overflow: "hidden" }}
          >
            <ExpandedCard animal={animal} channel={channel} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

export default QueueRow;
