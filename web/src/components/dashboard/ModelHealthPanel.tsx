import Link from "next/link";
import { DASHBOARD, STATUS } from "@/lib/content";
import { StatusIcon, type StatusTone } from "@/components/ui/Status";
import { NOT_MEASURED } from "@/lib/format";

export interface ModelHealthRow {
  id: string;
  label: string;
  display: string;
  tone: StatusTone;
  note: string;
}

/**
 * Model health, read from the published artifact.
 *
 * Discrimination and calibration error sit next to each other on purpose. The
 * archive study documented a model that kept ranking animals correctly for two
 * years while its probabilities drifted twelve points away from reality, and a
 * panel showing only AUC would have reported that model as healthy the entire
 * time.
 */
export function ModelHealthPanel({
  rows,
  scoringStatus,
}: {
  rows: ModelHealthRow[];
  scoringStatus: "live" | "in_progress" | "unavailable";
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
          {DASHBOARD.healthTitle}
        </h2>
        <Link
          href="/model"
          className="t-small underline underline-offset-2"
          style={{ color: "var(--accent-strong)" }}
        >
          Full methodology
        </Link>
      </div>

      {scoringStatus !== "live" ? (
        <p className="t-small mt-3" style={{ color: "var(--ink-secondary)" }}>
          {STATUS.scoringInProgressBody}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              <div>
                <p className="t-small font-medium" style={{ color: "var(--ink-primary)" }}>
                  {row.label}
                </p>
                <p className="t-caption mt-0.5 max-w-[38ch]" style={{ color: "var(--ink-muted)" }}>
                  {row.note}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <StatusIcon tone={row.tone} size={14} />
                <span className="t-small tabular font-mono" style={{ color: "var(--ink-primary)" }}>
                  {row.display || NOT_MEASURED}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ModelHealthPanel;
