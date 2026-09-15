import { CalendarRange, Database } from "lucide-react";
import { DASHBOARD } from "@/lib/content";
import { formatDate, formatInstant } from "@/lib/format";
import FreshnessChip from "@/components/shell/FreshnessChip";
import DataDetailsTrigger from "@/components/shell/DataDetailsTrigger";
import type { DataStatus } from "@/lib/austin/status";

/**
 * One strip under the hero that says where the numbers come from and what
 * window they cover, so the tiles beneath it never have to repeat it.
 */
export function ContextStrip({
  status,
  window,
}: {
  status: DataStatus;
  window: { start: string; end: string };
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-3 border px-4 py-3"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <FreshnessChip status={status} />
      <span className="t-small inline-flex items-center gap-1.5" style={{ color: "var(--ink-secondary)" }}>
        <Database size={15} strokeWidth={1.5} aria-hidden="true" />
        {`Snapshot ${formatInstant(status.snapshotAt)}`}
      </span>
      <span className="t-small inline-flex items-center gap-1.5" style={{ color: "var(--ink-secondary)" }}>
        <CalendarRange size={15} strokeWidth={1.5} aria-hidden="true" />
        {`${DASHBOARD.contextWindow}: ${formatDate(window.start)} to ${formatDate(window.end)}`}
      </span>
      <DataDetailsTrigger className="t-small link-reveal ml-auto min-h-[32px]">
        {DASHBOARD.dataDetailsCta}
      </DataDetailsTrigger>
    </div>
  );
}

export default ContextStrip;
