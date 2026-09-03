"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import { QUEUE } from "@/lib/content";
import { formatCount, formatLabel } from "@/lib/format";
import { expandContent, expandTransition } from "@/lib/motion";
import { BAND_LABEL } from "@/lib/model/presentation";
import MonogramTile from "@/components/ui/MonogramTile";
import RiskMeter from "@/components/queue/RiskMeter";
import StayExplanation from "@/components/queue/StayExplanation";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

const CELL: React.CSSProperties = {
  borderBottom: "1px solid var(--border-hairline)",
  height: "var(--row-height)",
};

/**
 * One open stay, as a table row.
 *
 * The expansion is a second row spanning the table rather than a nested
 * layout, so the columns above it stay aligned while it is open and the
 * reading order a screen reader follows is still row, then detail for that
 * row.
 *
 * The risk column is the only place a probability appears in the table, and it
 * renders nothing at all when scoring is off: the fallback shows how long the
 * animal has been waiting, which is a fact, rather than a greyed-out number
 * that looks like a prediction the page is withholding.
 */
export function QueueRow({
  stay,
  scoring,
  channels,
  expanded,
  onToggle,
}: {
  stay: ScoredStay;
  scoring: boolean;
  channels: readonly InterventionChannel[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const displayName = stay.name ?? QUEUE.unnamed;
  const detailId = `queue-detail-${stay.episodeId.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  const details = [
    stay.species,
    stay.breed,
    stay.lifeStage === "unknown" ? null : formatLabel(stay.lifeStage),
    stay.sex ? formatLabel(stay.sex) : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <tr style={{ background: expanded ? "var(--surface-sunken)" : "transparent" }}>
        <td className="px-4" style={CELL}>
          <div className="flex items-center gap-3">
            <MonogramTile name={stay.name} species={stay.species} size={40} />
            <div className="min-w-0">
              <p className="t-small truncate font-medium" style={{ color: "var(--ink-primary)" }}>
                {stay.name ?? (
                  <span className="italic" style={{ color: "var(--ink-muted)" }}>
                    {QUEUE.unnamed}
                  </span>
                )}
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
              <RiskMeter
                value={stay.pLongStay60d}
                band={stay.riskBand}
                label={BAND_LABEL[stay.riskBand]}
              />
            ) : (
              <span
                className="t-caption text-right"
                style={{ color: "var(--ink-muted)" }}
                title={stay.predictionUnavailableReason ?? undefined}
              >
                {scoring ? QUEUE.predictionUnavailable : `Waiting ${formatCount(stay.daysInCare)} days`}
              </span>
            )}
          </div>
        </td>

        <td className="px-4" style={CELL}>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailId}
              aria-label={`${expanded ? QUEUE.collapse : QUEUE.expand}: ${displayName}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border"
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
            <Link
              href={`/discover/${encodeURIComponent(stay.episodeId)}`}
              aria-label={`${QUEUE.detailLink}: ${displayName}`}
              title={QUEUE.detailLink}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border"
              style={{
                borderColor: "var(--border-hairline)",
                background: "var(--surface-card)",
                color: "var(--ink-secondary)",
              }}
            >
              <ExternalLink size={18} strokeWidth={1.5} aria-hidden="true" />
            </Link>
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
                  <StayExplanation stay={stay} scoring={scoring} channels={channels} />
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
