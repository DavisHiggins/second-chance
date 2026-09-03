import type { Metadata } from "next";
import { getShelterView, toPublicStays } from "@/lib/shelter.server";
import { DISCOVER } from "@/lib/content";
import { formatCount } from "@/lib/format";
import DiscoverGrid from "@/components/discover/DiscoverGrid";
import { DataUnavailable } from "@/components/shell/StateNotices";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Current shelter records",
  description:
    "Cats and dogs with an open intake record in the City of Austin's public feed, longest wait first.",
};

/**
 * The human-facing view of the current records.
 *
 * The previous version of this page was titled "Meet the ones who have been
 * waiting" and told the reader that "every one of them is ready to go home
 * today". Neither claim was supportable. Austin publishes intake and outcome
 * events; it publishes no adoptable-listing dataset, so nothing in this
 * product can confirm that any particular animal is available. The page now
 * says what the data actually is, and the accuracy note sits above the grid
 * rather than in a footnote.
 */
export default async function DiscoverPage() {
  const view = await getShelterView();

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  return (
    <div className="space-y-8">
      <header className="max-w-[70ch]">
        <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
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

      <DiscoverGrid stays={toPublicStays(view.stays)} />
    </div>
  );
}
