"use client";

import { useReducedMotion } from "framer-motion";
import ChartFrame from "@/components/charts/ChartFrame";
import { DASHBOARD } from "@/lib/content";
import { formatPercent } from "@/lib/format";
import type { OutcomeMix } from "@/lib/austin/metrics";

/**
 * How completed stays actually end.
 *
 * A stacked bar rather than a donut. The question a reader has here is "how
 * does adoption compare with transfer", and comparing two arcs by eye is a
 * worse way to answer it than comparing two lengths on a shared baseline.
 *
 * All the feed's adoption spellings are collapsed upstream into one bucket.
 * Left split out, the six variants would each look like a minor outcome and
 * adoption would appear to be a third of what it is.
 */
const SERIES = [
  "var(--series-1)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-7)",
  "var(--series-5)",
  "var(--series-2)",
  "var(--series-8)",
  "var(--series-6)",
];

export function OutcomeMixChart({ mix, total }: { mix: OutcomeMix[]; total: number }) {
  const reducedMotion = useReducedMotion();

  if (mix.length === 0 || total === 0) {
    return (
      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        No completed stays in the selected window.
      </p>
    );
  }

  // Anything under two percent joins an "other" bucket rather than becoming a
  // sliver too small to see or label.
  const major = mix.filter((row) => row.share >= 0.02);
  const minorTotal = mix.filter((row) => row.share < 0.02).reduce((sum, row) => sum + row.n, 0);
  const rows =
    minorTotal > 0
      ? [...major, { outcomeType: "Other outcomes", n: minorTotal, share: minorTotal / total }]
      : major;

  const summary = rows
    .map((row) => `${row.outcomeType} ${formatPercent(row.share)}`)
    .join(", ");

  return (
    <ChartFrame
      title={DASHBOARD.outcomesTitle}
      subtitle={DASHBOARD.outcomesSubtitle}
      summary={`Of ${total.toLocaleString("en-US")} completed stays: ${summary}.`}
      height={200}
      note="Each share is that outcome divided by completed stays that began in the window. Transfer is not adoption; open stays have no outcome yet and are not included."
      table={{
        caption: "Completed cat and dog stays by outcome",
        columns: ["Outcome", "Stays", "Share"],
        rows: rows.map((row) => [row.outcomeType, row.n, formatPercent(row.share)]),
      }}
    >
      <div className="flex h-full flex-col justify-center gap-5">
        <div
          className="flex h-7 w-full overflow-hidden"
          style={{ borderRadius: "var(--radius-full)", background: "var(--surface-sunken)" }}
        >
          {rows.map((row, index) => (
            <div
              key={row.outcomeType}
              style={{
                width: `${row.share * 100}%`,
                background: SERIES[index % SERIES.length],
                transition: reducedMotion ? "none" : "width 600ms var(--ease-out)",
              }}
              title={`${row.outcomeType}: ${formatPercent(row.share)}`}
            />
          ))}
        </div>

        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {rows.map((row, index) => (
            <li key={row.outcomeType} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0"
                style={{
                  background: SERIES[index % SERIES.length],
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <span className="t-small" style={{ color: "var(--ink-secondary)" }}>
                {row.outcomeType}
              </span>
              <span className="t-small tabular font-semibold" style={{ color: "var(--ink-primary)" }}>
                {formatPercent(row.share)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

export default OutcomeMixChart;
