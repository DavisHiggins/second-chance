import type { Metadata } from "next";
import { getShelterView, toPublicStays } from "@/lib/shelter.server";
import { DISCOVER } from "@/lib/content";
import { formatCount } from "@/lib/format";
import DiscoverGrid from "@/components/discover/DiscoverGrid";
import { DataUnavailable } from "@/components/shell/StateNotices";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: DISCOVER.title,
  description:
    "Cats and dogs with an open intake record in the City of Austin's public feed, longest wait first.",
};

/**
 * The human-facing view of the current records.
 *
 * Austin publishes intake and outcome events; it publishes no adoptable-
 * listing dataset, so nothing in this product can confirm that any
 * particular animal is available. The page says what the data actually is,
 * and the accuracy note sits above the grid rather than in a footnote. The
 * grid's first batch is server-rendered so the records are in the initial
 * HTML and readable before any script runs.
 */
type Search = Promise<Record<string, string | string[] | undefined>>;

function toQuery(search: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params.toString();
}

export default async function DiscoverPage({ searchParams }: { searchParams: Search }) {
  const [view, search] = await Promise.all([getShelterView(), searchParams]);

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  return (
    <div className="space-y-8">
      <header className="max-w-[70ch]">
        <p className="t-overline" style={{ color: "var(--accent-strong)" }}>
          Shelter records
        </p>
        <h1 className="t-display mt-2" style={{ color: "var(--ink-primary)" }}>
          {DISCOVER.title}
        </h1>
        <p className="t-body mt-3" style={{ color: "var(--ink-secondary)" }}>
          {DISCOVER.subtitle}
        </p>
        <p className="t-small mt-3" style={{ color: "var(--ink-muted)" }}>
          {`${formatCount(view.stays.length)} high-confidence open shelter stays are represented in the current public feeds.`}
        </p>

        <div
          className="mt-5 border p-4"
          style={{
            background: "var(--surface-sunken)",
            borderColor: "var(--border-hairline)",
            borderLeft: "3px solid var(--accent-warm)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <p className="t-small" style={{ color: "var(--ink-primary)" }}>
            {DISCOVER.accuracyNote}
          </p>
        </div>
      </header>

      <DiscoverGrid stays={toPublicStays(view.stays)} initialQuery={toQuery(search)} />
    </div>
  );
}
