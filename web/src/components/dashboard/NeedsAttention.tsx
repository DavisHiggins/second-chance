import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DASHBOARD, QUEUE } from "@/lib/content";
import { formatPercent } from "@/lib/format";
import { describeHorizon } from "@/lib/model/horizon";
import { BAND_COLOR, BAND_LABEL } from "@/lib/model/presentation";
import Card from "@/components/ui/Card";
import MonogramTile from "@/components/ui/MonogramTile";
import { ButtonLink } from "@/components/ui/Button";
import type { ScoredStay } from "@/lib/shelter.server";

/**
 * The top of the queue, on the dashboard.
 *
 * This section only renders when a validated model is actually scoring. That
 * is enforced upstream in `needsAttentionNow`, which returns an empty list
 * otherwise, because a "needs attention now" panel built from longest-wait
 * ordering would be a descriptive list wearing a prediction's clothes.
 *
 * Each row leads with the actual wait. An estimate is shown as what it is,
 * an intake-time estimate, and for an animal already past 60 days the row
 * says so instead of presenting a past event as a future chance.
 */
export function NeedsAttention({ stays }: { stays: ScoredStay[] }) {
  return (
    <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="needs-attention-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[60ch]">
          <h2 id="needs-attention-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
            {DASHBOARD.needsAttentionTitle}
          </h2>
          <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
            {DASHBOARD.needsAttentionSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/queue" variant="primary" size="sm" arrow>
            {DASHBOARD.needsAttentionQueue}
          </ButtonLink>
          <ButtonLink href="/planner" variant="secondary" size="sm">
            {DASHBOARD.needsAttentionPlanner}
          </ButtonLink>
        </div>
      </div>

      <ol className="mt-4 divide-y" style={{ borderColor: "var(--border-hairline)" }}>
        {stays.map((stay) => {
          const horizon = describeHorizon({
            daysInCare: stay.daysInCare,
            pLongStay60d: stay.pLongStay60d,
            scoring: true,
          });
          const past = horizon.status === "already_past_horizon";
          return (
            <li key={stay.episodeId}>
              <Link
                href={`/discover/${encodeURIComponent(stay.episodeId)}?from=dashboard`}
                className="row-hover -mx-2 flex items-center gap-4 rounded-[var(--radius-md)] px-2 py-3"
              >
                <MonogramTile name={stay.name} species={stay.species} size={40} />

                <div className="min-w-0 flex-1">
                  <p className="t-small font-medium" style={{ color: "var(--ink-primary)", overflowWrap: "anywhere" }}>
                    {stay.name ?? QUEUE.unnamed}
                    <span className="t-caption ml-2 font-mono" style={{ color: "var(--ink-muted)" }}>
                      {stay.animalId}
                    </span>
                  </p>
                  <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
                    {[stay.species, stay.breed].filter(Boolean).join(" · ")}
                  </p>
                </div>

                <span className="shrink-0 text-right">
                  <span
                    className="t-small tabular font-semibold"
                    style={{ color: past ? "var(--accent-warm-strong)" : "var(--ink-primary)" }}
                  >
                    {past ? horizon.headline : `${stay.daysInCare} days waiting`}
                  </span>
                  <span className="t-caption block" style={{ color: past ? "var(--ink-muted)" : BAND_COLOR[stay.riskBand ?? "ok"] }}>
                    {stay.pLongStay60d === null
                      ? QUEUE.predictionUnavailable
                      : past
                        ? `intake estimate was ${formatPercent(stay.pLongStay60d)}`
                        : `${formatPercent(stay.pLongStay60d)} at intake · ${BAND_LABEL[stay.riskBand ?? "ok"]}`}
                  </span>
                </span>
                <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" className="hidden shrink-0 sm:block" color="var(--ink-muted)" />
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default NeedsAttention;
