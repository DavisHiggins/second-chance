"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, Plus } from "lucide-react";
import Link from "next/link";
import { QUEUE } from "@/lib/content";
import { formatCount, formatLabel } from "@/lib/format";
import { expandContent, expandTransition } from "@/lib/motion";
import { describeHorizon } from "@/lib/model/horizon";
import type { usePlanPicks } from "@/lib/planPicks";
import MonogramTile from "@/components/ui/MonogramTile";
import RiskMeter from "@/components/queue/RiskMeter";
import StayExplanation from "@/components/queue/StayExplanation";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

const CELL: React.CSSProperties = {
  borderBottom: "1px solid var(--border-hairline)",
  height: "var(--row-height)",
};

export interface QueueRowShared {
  scoring: boolean;
  channels: readonly InterventionChannel[];
  drivers: readonly { feature: string; gain: number }[];
  picks: ReturnType<typeof usePlanPicks>;
}

/**
 * One open stay, as a table row.
 *
 * The expansion is a second row spanning the table rather than a nested
 * layout, so the columns above it stay aligned while it is open and the
 * reading order a screen reader follows is still row, then detail for that
 * row.
 *
 * The estimate column is the only place a probability appears in the table.
 * For an animal already past 60 days it leads with that fact; with no score
 * it shows the wait, which is a fact, rather than a greyed-out number that
 * looks like a prediction the page is withholding. Two explicit actions sit
 * on every row: view the record, and add it to this week's plan.
 */
export function QueueRow({
  stay,
  scoring,
  channels,
  drivers,
  picks,
  expanded,
  onToggle,
}: QueueRowShared & {
  stay: ScoredStay;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const displayName = stay.name ?? QUEUE.unnamed;
  const detailId = `queue-detail-${stay.episodeId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const horizon = describeHorizon({ daysInCare: stay.daysInCare, pLongStay60d: stay.pLongStay60d, scoring });
  const inPlan = picks.has(stay.episodeId);

  const details = [
    stay.species,
    stay.breed,
    stay.lifeStage === "unknown" ? null : formatLabel(stay.lifeStage),
    stay.sex ? formatLabel(stay.sex) : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <tr className="row-hover" style={{ background: expanded ? "var(--surface-sunken)" : undefined }}>
        <td className="px-4" style={CELL}>
          <div className="flex items-center gap-3">
            <MonogramTile name={stay.name} species={stay.species} size={40} />
            <div className="min-w-0">
              <p className="t-small font-medium" style={{ color: "var(--ink-primary)", overflowWrap: "anywhere" }}>
                <Link href={`/discover/${encodeURIComponent(stay.episodeId)}?from=queue`} className="hover:underline">
                  {stay.name ?? (
                    <span className="italic" style={{ color: "var(--ink-muted)" }}>
                      {QUEUE.unnamed}
                    </span>
                  )}
                </Link>
              </p>
              <p className="t-caption font-mono" style={{ color: "var(--ink-muted)" }}>
                {stay.animalId}
              </p>
            </div>
          </div>
        </td>

        <td className="px-4" style={CELL}>
          <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
            {details.join(" · ")}
          </p>
          {stay.possiblyStale ? (
            <p className="t-caption mt-0.5" style={{ color: "var(--status-warning)" }}>
              {QUEUE.staleBadge}
            </p>
          ) : null}
        </td>

        <td className="px-4 text-right" style={CELL}>
          <span className="t-subtitle tabular" style={{ color: "var(--ink-primary)" }}>
            {formatCount(stay.daysInCare)}
          </span>
          <span className="t-caption ml-1" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.daysLabel}
          </span>
        </td>

        <td className="px-4" style={CELL}>
          <div className="flex justify-end">
            {scoring && stay.pLongStay60d !== null && stay.riskBand ? (
              <RiskMeter value={stay.pLongStay60d} band={stay.riskBand} daysInCare={stay.daysInCare} />
            ) : (
              <span
                className="t-caption max-w-[18ch] text-right"
                style={{ color: horizon.status === "already_past_horizon" ? "var(--accent-warm-strong)" : "var(--ink-muted)" }}
                title={stay.predictionUnavailableReason ?? undefined}
              >
                {horizon.status === "already_past_horizon"
                  ? horizon.headline
                  : scoring
                    ? QUEUE.predictionUnavailable
                    : horizon.headline}
              </span>
            )}
          </div>
        </td>

        <td className="px-4" style={CELL}>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => picks.toggle(stay.episodeId)}
              aria-pressed={inPlan}
              aria-label={`${inPlan ? QUEUE.removeFromPlan : QUEUE.addToPlan}: ${displayName}`}
              title={inPlan ? QUEUE.removeFromPlan : QUEUE.addToPlan}
              className="btn btn--sm"
              style={
                inPlan
                  ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-strong)" }
                  : { background: "var(--surface-card)", borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }
              }
            >
              {inPlan ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : <Plus size={15} strokeWidth={2} aria-hidden="true" />}
              <span className="hidden xl:inline">{inPlan ? QUEUE.inPlan : QUEUE.addToPlan}</span>
            </button>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailId}
              aria-label={`${expanded ? QUEUE.collapse : QUEUE.expand}: ${displayName}`}
              title={expanded ? QUEUE.collapse : QUEUE.expand}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
              style={{
                borderColor: "var(--border-hairline)",
                background: "var(--surface-card)",
                color: "var(--ink-secondary)",
              }}
            >
              {expanded ? (
                <ChevronUp size={18} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
          </div>
        </td>
      </tr>

      <AnimatePresence initial={false}>
        {expanded ? (
          <tr id={detailId}>
            <td
              colSpan={5}
              className="px-4"
              style={{
                borderBottom: "1px solid var(--border-hairline)",
                background: "var(--surface-sunken)",
              }}
            >
              <motion.div
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={expandTransition}
                style={{ overflow: "hidden" }}
              >
                <motion.div
                  variants={expandContent}
                  initial={reducedMotion ? false : "hidden"}
                  animate="show"
                  className="py-5"
                >
                  <StayExplanation stay={stay} scoring={scoring} channels={channels} drivers={drivers} />
                </motion.div>
              </motion.div>
            </td>
          </tr>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export default QueueRow;
