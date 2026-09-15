"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { QUEUE } from "@/lib/content";
import { formatCount, formatLabel } from "@/lib/format";
import { expandContent, expandTransition } from "@/lib/motion";
import { describeHorizon } from "@/lib/model/horizon";
import Card from "@/components/ui/Card";
import MonogramTile from "@/components/ui/MonogramTile";
import RiskMeter from "@/components/queue/RiskMeter";
import StayExplanation from "@/components/queue/StayExplanation";
import type { QueueRowShared } from "@/components/queue/QueueRow";
import type { ScoredStay } from "@/lib/shelter.server";

/**
 * The card form of a queue entry, for narrow screens and for staff who want to
 * see faces rather than rows.
 *
 * It carries exactly the same facts as the table row and expands to exactly
 * the same explanation. A second view that shows less is a second view people
 * learn not to trust.
 */
export function QueueCard({
  stay,
  scoring,
  channels,
  drivers,
  picks,
}: QueueRowShared & { stay: ScoredStay }) {
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const displayName = stay.name ?? QUEUE.unnamed;
  const detailId = `queue-card-${stay.episodeId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const horizon = describeHorizon({ daysInCare: stay.daysInCare, pLongStay60d: stay.pLongStay60d, scoring });
  const inPlan = picks.has(stay.episodeId);

  const details = [
    stay.species,
    stay.breed,
    stay.lifeStage === "unknown" ? null : formatLabel(stay.lifeStage),
  ].filter(Boolean) as string[];

  return (
    <Card as="article" className="h-full" style={{ padding: "var(--space-4)" }}>
      <div className="flex items-start gap-3">
        <MonogramTile name={stay.name} species={stay.species} size={48} radius="lg" />

        <div className="min-w-0 flex-1">
          <h3 className="t-subtitle" style={{ color: "var(--ink-primary)", overflowWrap: "anywhere" }}>
            <Link
              href={`/discover/${encodeURIComponent(stay.episodeId)}?from=queue`}
              className="underline-offset-2 hover:underline"
              style={{ color: "inherit" }}
            >
              {stay.name ?? (
                <span className="italic" style={{ color: "var(--ink-muted)" }}>
                  {QUEUE.unnamed}
                </span>
              )}
            </Link>
          </h3>
          <p className="t-caption font-mono" style={{ color: "var(--ink-muted)" }}>
            {stay.animalId}
          </p>
          <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
            {details.join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-title tabular" style={{ color: "var(--ink-primary)" }}>
            {formatCount(stay.daysInCare)}
          </p>
          <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
            {`${QUEUE.daysLabel} waiting`}
          </p>
        </div>

        {scoring && stay.pLongStay60d !== null && stay.riskBand ? (
          <RiskMeter value={stay.pLongStay60d} band={stay.riskBand} daysInCare={stay.daysInCare} width={132} />
        ) : (
          <p
            className="t-caption max-w-[18ch] text-right"
            style={{ color: horizon.status === "already_past_horizon" ? "var(--accent-warm-strong)" : "var(--ink-muted)" }}
            title={stay.predictionUnavailableReason ?? undefined}
          >
            {horizon.status === "already_past_horizon"
              ? horizon.headline
              : scoring
                ? QUEUE.predictionUnavailable
                : "Ordered by wait, not by prediction"}
          </p>
        )}
      </div>

      {stay.possiblyStale ? (
        <p className="t-caption mt-2" style={{ color: "var(--status-warning)" }}>
          {QUEUE.staleBadge}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="btn btn--sm btn--secondary"
        >
          {expanded ? QUEUE.collapse : QUEUE.expand}
          {expanded ? (
            <ChevronUp size={15} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" />
          )}
          <span className="sr-only">{` — ${displayName}`}</span>
        </button>
        <button
          type="button"
          onClick={() => picks.toggle(stay.episodeId)}
          aria-pressed={inPlan}
          className={`btn btn--sm ${inPlan ? "btn--success" : "btn--secondary"}`}
        >
          {inPlan ? null : <Plus size={15} strokeWidth={2} aria-hidden="true" />}
          {inPlan ? QUEUE.inPlan : QUEUE.addToPlan}
          <span className="sr-only">{` — ${displayName}`}</span>
        </button>
        <Link
          href={`/discover/${encodeURIComponent(stay.episodeId)}?from=queue`}
          className="btn btn--sm btn--ghost"
          aria-label={`${QUEUE.viewRecord}: ${displayName}`}
        >
          {QUEUE.viewRecord}
        </Link>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={detailId}
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
              className="mt-4 border-t pt-4"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              <StayExplanation stay={stay} scoring={scoring} channels={channels} drivers={drivers} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}

export default QueueCard;
