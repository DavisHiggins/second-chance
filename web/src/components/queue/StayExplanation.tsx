"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DETAIL, QUEUE } from "@/lib/content";
import { formatDate, formatInTen, formatPercent } from "@/lib/format";
import { BAND_SENTENCE } from "@/lib/model/presentation";
import { describeHorizon } from "@/lib/model/horizon";
import DriverBars from "@/components/charts/DriverBars";
import { resolveChannel, suggestChannel } from "@/lib/interventions";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

/**
 * The "why this animal" panel, shared by the queue's table row and its card.
 *
 * Four things are kept strictly apart here, because collapsing them is how a
 * dashboard starts lying: what the record says was observed, what the model
 * estimated and when, why a written rule suggested a channel, and how
 * complete the record is. Each is labelled as what it is. Population-level
 * feature importance is shown under its own heading and says in words that it
 * is not an explanation of this animal.
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
  const horizon = describeHorizon({ daysInCare: stay.daysInCare, pLongStay60d: stay.pLongStay60d, scoring });

  const missing: string[] = [];
  if (stay.ageAtIntakeDays === null) missing.push("date of birth");
  if (!stay.condition) missing.push("intake condition");
  if (!stay.breed) missing.push("breed");
  if (!stay.sex) missing.push("sex");
  if (stay.alteredAtIntake === null) missing.push("spay/neuter status at intake");

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-5">
        <section>
          <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.headingObserved}
          </h3>
          <dl className="mt-2 space-y-1">
            <Line label="Arrived" value={formatDate(stay.intakeAt)} />
            <Line label="Days waiting" value={`${stay.daysInCare}`} />
            {stay.intakeReason ? <Line label="Reason recorded" value={stay.intakeReason} /> : null}
            {stay.condition ? <Line label="Condition at intake" value={stay.condition} /> : null}
          </dl>
          {stay.possiblyStale ? (
            <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              {QUEUE.staleExplain}
            </p>
          ) : null}
        </section>

        <section>
          <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.headingEstimated}
          </h3>
          {horizon.status === "unavailable" ? (
            <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              {stay.predictionUnavailableReason ??
                "No validated model is scoring right now, so this animal's position reflects how long it has waited, not a prediction."}
            </p>
          ) : (
            <>
              <p className="t-small mt-2 max-w-prose font-medium" style={{ color: "var(--ink-primary)" }}>
                {horizon.headline}
              </p>
              <p className="t-caption mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                {horizon.estimateNote}
              </p>
              <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                {BAND_SENTENCE[stay.riskBand ?? "ok"]}
              </p>
              <dl className="mt-3 space-y-1.5">
                <Line label="Stay past 60 days, estimated at intake" value={formatPercent(stay.pLongStay60d)} />
                <Line
                  label={
                    horizon.adoptionWindowPassed
                      ? "Adopted by day 30 from intake (window has passed)"
                      : "Adopted by day 30 from intake"
                  }
                  value={
                    stay.pAdopt30d === null
                      ? QUEUE.predictionUnavailable
                      : `${formatPercent(stay.pAdopt30d)}${inTen ? ` · about ${inTen}` : ""}`
                  }
                />
              </dl>
              <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
                {DETAIL.intervalNote}
              </p>
            </>
          )}
        </section>
      </div>

      <div className="space-y-5">
        <section>
          <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.headingWhy}
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
                style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
              >
                {channel.evidence === "historical" ? DETAIL.evidenceHistorical : DETAIL.evidenceAssumed}
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
        </section>

        <section>
          <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.headingCompleteness}
          </h3>
          <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {missing.length === 0
              ? "Every input the model reads is present on this record."
              : `Not recorded: ${missing.join(", ")}. Unknown is not zero; the model treats a missing value as missing.`}
          </p>
          <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.verifyReminder}
          </p>
        </section>

        {scoring && drivers.length > 0 ? (
          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              {QUEUE.headingDrivers}
            </h3>
            <p className="t-caption mt-1 max-w-prose" style={{ color: "var(--ink-muted)" }}>
              {DETAIL.driversNote}
            </p>
            <div className="mt-3">
              <DriverBars drivers={drivers} limit={4} />
            </div>
          </section>
        ) : null}

        <Link
          href={`/discover/${encodeURIComponent(stay.episodeId)}?from=queue`}
          className="t-small link-reveal inline-flex items-center gap-1"
        >
          {QUEUE.viewRecord}
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="t-caption" style={{ color: "var(--ink-muted)" }}>
        {label}
      </dt>
      <dd className="t-small tabular text-right" style={{ color: "var(--ink-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

export default StayExplanation;
