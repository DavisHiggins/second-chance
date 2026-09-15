"use client";

import ChartFrame from "@/components/charts/ChartFrame";
import { DASHBOARD } from "@/lib/content";
import { formatPercent, NOT_MEASURED } from "@/lib/format";
import type { SegmentRow } from "@/lib/austin/metrics";

const LABELS: Record<string, string> = {
  juvenile: "Under a year",
  adult: "Adult",
  senior: "Senior",
  unknown: "Age not recorded",
};

/**
 * Observed median days to adoption by life stage.
 *
 * This is a measurement, not a model output. It stays truthful and useful even
 * when no model is scoring, which is why the dashboard leans on it rather than
 * on a predicted-wait chart.
 *
 * The "age not recorded" row is kept rather than dropped. Those animals have no
 * date of birth in the feed, the model declines to score them for exactly that
 * reason, and hiding the row would hide how many of them there are.
 */
export function SegmentBars({ segments }: { segments: SegmentRow[] }) {
  // A median over fewer than twenty adoptions moves when a handful of
  // records change, so those rows are listed in the table but not drawn.
  const rows = segments.filter((row) => row.adopted >= 20);

  if (rows.length === 0) {
    return (
      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        Not enough completed stays to break down by life stage yet.
      </p>
    );
  }

  const max = Math.max(...rows.map((row) => row.medianDaysToAdoption ?? 0), 1);

  const summary = rows
    .map(
      (row) =>
        `${LABELS[row.level] ?? row.level}: ${
          row.medianDaysToAdoption === null
            ? "not measured"
            : `${row.medianDaysToAdoption.toFixed(0)} days, based on ${row.adopted} adoptions`
        }`,
    )
    .join("; ");

  return (
    <ChartFrame
      title={DASHBOARD.segmentsTitle}
      subtitle={DASHBOARD.segmentsSubtitle}
      summary={summary}
      height={190}
      note="The median counts adopted animals only; the adoption share divides adoptions by all completed stays. A short median can sit beside a low share. Life stage is age at intake; the archive study used a different era and metric, so its ranking can differ."
      table={{
        caption: "Observed median days to adoption by life stage at intake, stays begun in the last twelve months",
        columns: ["Life stage", "Adoptions (median sample)", "Completed stays", "Median days", "Share adopted"],
        rows: segments.map((row) => [
          LABELS[row.level] ?? row.level,
          row.adopted,
          row.n,
          row.medianDaysToAdoption === null ? NOT_MEASURED : row.medianDaysToAdoption.toFixed(1),
          row.adoptionShare === null ? NOT_MEASURED : formatPercent(row.adoptionShare),
        ]),
      }}
    >
      <ul className="flex h-full flex-col justify-center gap-4">
        {rows.map((row) => {
          const days = row.medianDaysToAdoption;
          return (
            <li key={row.level}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-small" style={{ color: "var(--ink-primary)" }}>
                  {LABELS[row.level] ?? row.level}
                </span>
                <span className="t-small tabular" style={{ color: "var(--ink-secondary)" }}>
                  {days === null ? NOT_MEASURED : `${days.toFixed(0)} days`}
                  <span className="t-caption ml-2" style={{ color: "var(--ink-muted)" }}>
                    {`based on ${row.adopted.toLocaleString("en-US")} adoptions`}
                  </span>
                </span>
              </div>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden"
                style={{ background: "var(--surface-sunken)", borderRadius: "var(--radius-full)" }}
              >
                <div
                  style={{
                    width: days === null ? "0%" : `${(days / max) * 100}%`,
                    height: "100%",
                    background: "var(--series-1)",
                    borderRadius: "var(--radius-full)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

export default SegmentBars;
