import { getQueue } from "@/lib/dataSource";
import { DISCOVER } from "@/lib/content";
import { formatCount } from "@/lib/format";
import DiscoverGrid from "@/components/discover/DiscoverGrid";

export default async function DiscoverPage() {
  const queue = await getQueue();
  // Longest waiting first, which is the entire point of the page.
  const animals = queue.animals.slice().sort((a, b) => b.days_in_care - a.days_in_care);

  return (
    <div className="space-y-8 py-4">
      <header className="max-w-2xl">
        <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {DISCOVER.title}
        </h1>
        <p className="t-body mt-3" style={{ color: "var(--ink-secondary)" }}>
          {DISCOVER.subtitle}
        </p>
        <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
          {`${formatCount(animals.length)} animals are looking for a home right now.`}
        </p>
      </header>

      <DiscoverGrid animals={animals} />
    </div>
  );
}
