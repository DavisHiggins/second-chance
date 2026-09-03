import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DASHBOARD, QUEUE } from "@/lib/content";
import { formatPercent } from "@/lib/format";
import Card from "@/components/ui/Card";
import MonogramTile from "@/components/ui/MonogramTile";
import { BAND_COLOR } from "@/lib/model/presentation";
import type { ScoredStay } from "@/lib/shelter.server";

/**
 * The top of the queue, on the dashboard.
 *
 * This section only renders when a validated model is actually scoring. That
 * is enforced upstream in `needsAttentionNow`, which returns an empty list
 * otherwise, because a "needs attention now" panel built from longest-wait
 * ordering would be a descriptive list wearing a prediction's clothes.
 */
export function NeedsAttention({ stays }: { stays: ScoredStay[] }) {
  return (
    <Card style={{ padding: "var(--card-padding)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
            {DASHBOARD.needsAttentionTitle}
          </h2>
          <p className="t-small mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {DASHBOARD.needsAttentionSubtitle}
          </p>
        </div>
        <Link
          href="/queue"
          className="t-small inline-flex items-center gap-1 underline underline-offset-2"
          style={{ color: "var(--accent-strong)" }}
        >
          Open the full queue
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-4 divide-y" style={{ borderColor: "var(--border-hairline)" }}>
        {stays.map((stay) => (
          <li key={stay.episodeId}>
            <Link
              href={`/discover/${encodeURIComponent(stay.episodeId)}`}
              className="flex items-center gap-4 py-3"
            >
              <MonogramTile name={stay.name} species={stay.species} size={40} />

              <div className="min-w-0 flex-1">
                <p className="t-small truncate font-medium" style={{ color: "var(--ink-primary)" }}>
                  {stay.name ?? QUEUE.unnamed}
                  <span className="t-caption ml-2 font-mono" style={{ color: "var(--ink-muted)" }}>
                    {stay.animalId}
                  </span>
                </p>
                <p className="t-caption truncate" style={{ color: "var(--ink-muted)" }}>
                  {[stay.species, stay.breed, `${stay.daysInCare} days waiting`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <span className="shrink-0 text-right">
                <span
                  className="t-small tabular font-semibold"
                  style={{ color: BAND_COLOR[stay.riskBand ?? "ok"] }}
                >
                  {stay.pLongStay60d === null ? "—" : formatPercent(stay.pLongStay60d)}
                </span>
                <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
                  past 60 days
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default NeedsAttention;
