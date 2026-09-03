"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DETAIL, QUEUE } from "@/lib/content";
import { formatInTen, formatPercent } from "@/lib/format";
import { BAND_SENTENCE } from "@/lib/model/presentation";
import DriverBars from "@/components/charts/DriverBars";
import { resolveChannel, suggestChannel } from "@/lib/interventions";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

/**
 * The "why this animal" panel, shared by the queue's table row and its card.
 *
 * Three things are kept strictly apart here, because collapsing them is how a
 * dashboard starts lying: what the model estimated, what the shelter's own
 * records say, and what a human policy suggests doing about it. Each is
 * labelled as what it is, and the suggested channel carries its evidence
 * status so nobody reads an assumption as a finding.
 */
export function StayExplanation({
  stay,
  scoring,
  channels,
  drivers,
}: {
  stay: ScoredStay;
  scoring: boolean;
  channels: readonly InterventionChannel[];
  /** Population-level importance, passed in once rather than carried on every
   *  stay. It is the same list for every animal, which is why the panel below
   *  says so in as many words. */
  drivers: readonly { feature: string; gain: number }[];
}) {
  const suggestion = suggestChannel(stay);
  const channel = resolveChannel(channels, suggestion.channel);
  const inTen = formatInTen(stay.pAdopt30d);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
          {QUEUE.headingWait}
        </h3>

        {!scoring || stay.pLongStay60d === null ? (
          <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {stay.predictionUnavailableReason ??
              "No validated model is scoring right now, so this animal's position reflects how long it has waited, not a prediction."}
          </p>
        ) : (
          <>
            <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-primary)" }}>
              {BAND_SENTENCE[stay.riskBand ?? "ok"]}
            </p>
            <dl className="mt-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="t-caption" style={{ color: "var(--ink-muted)" }}>
                  Still here after 60 days
                </dt>
                <dd className="t-small tabular" style={{ color: "var(--ink-primary)" }}>
                  {formatPercent(stay.pLongStay60d)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="t-caption" style={{ color: "var(--ink-muted)" }}>
                  Adopted within 30 days
                </dt>
                <dd className="t-small tabular" style={{ color: "var(--ink-primary)" }}>
                  {stay.pAdopt30d === null
                    ? QUEUE.predictionUnavailable
                    : `${formatPercent(stay.pAdopt30d)}${inTen ? ` · about ${inTen}` : ""}`}
                </dd>
              </div>
            </dl>
            <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
              {DETAIL.intervalNote}
            </p>
          </>
        )}

        {stay.possiblyStale ? (
          <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {QUEUE.staleExplain}
          </p>
        ) : null}
      </div>

      <div className="space-y-6">
        {scoring && drivers.length > 0 ? (
          <div>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              {QUEUE.headingDrivers}
            </h3>
            <p className="t-caption mt-1 max-w-prose" style={{ color: "var(--ink-muted)" }}>
              {DETAIL.driversNote}
            </p>
            <div className="mt-3">
              <DriverBars drivers={drivers} limit={4} />
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.headingHelp}
          </h3>
          {channel ? (
            <>
              <p className="t-small mt-2 font-medium" style={{ color: "var(--ink-primary)" }}>
                {channel.label}
              </p>
              <p className="t-caption mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                {suggestion.reason}
              </p>
              <p
                className="t-caption mt-2 inline-block rounded-[var(--radius-full)] px-2 py-0.5"
                style={{
                  background: "var(--surface-sunken)",
                  color: "var(--ink-secondary)",
                }}
              >
                {channel.evidence === "measured"
                  ? DETAIL.evidenceMeasured
                  : DETAIL.evidenceAssumed}
              </p>
              <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-muted)" }}>
                {channel.evidence_detail}
              </p>
            </>
          ) : (
            <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
              No outreach channel is configured for this case.
            </p>
          )}

          <Link
            href={`/discover/${encodeURIComponent(stay.episodeId)}`}
            className="t-small mt-4 inline-flex items-center gap-1 underline underline-offset-2"
            style={{ color: "var(--accent-strong)" }}
          >
            {QUEUE.detailLink}
            <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default StayExplanation;
