"use client";

import { useId, useState, type ReactNode } from "react";
import { Table2, LineChart as LineChartIcon } from "lucide-react";
import { A11Y } from "@/lib/content";

export interface TableView {
  columns: string[];
  rows: Array<Array<string | number>>;
  caption: string;
}

/**
 * Every chart in the product is wrapped in this: a written summary for screen
 * readers, a legend slot, and a table toggle. A chart with more than one series
 * that cannot be read as a table is not finished.
 */
export function ChartFrame({
  title,
  subtitle,
  summary,
  table,
  legend,
  height,
  children,
  action,
  note,
  headingLevel = "h2",
}: {
  title: string;
  subtitle?: string;
  summary: string;
  table: TableView;
  legend?: ReactNode;
  height: number;
  children: ReactNode;
  action?: ReactNode;
  /** One sentence beneath the chart on how to read it. */
  note?: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading className="t-title" id={headingId} style={{ color: "var(--ink-primary)" }}>
            {title}
          </Heading>
          {subtitle ? (
            <p className="t-small mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-pressed={showTable}
            className="t-caption inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5"
            style={{
              borderColor: "var(--border-hairline)",
              background: "var(--surface-card)",
              color: "var(--ink-secondary)",
            }}
          >
            {showTable ? (
              <LineChartIcon size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Table2 size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
            {showTable ? A11Y.chartToggle : A11Y.tableToggle}
          </button>
        </div>
      </div>

      {legend ? <div className="mt-3">{legend}</div> : null}

      {/* The height is reserved either way, so switching views shifts nothing. */}
      <div className="mt-4" style={{ minHeight: height }}>
        {showTable ? (
          <div className="overflow-x-auto" style={{ maxHeight: height + 40 }}>
            <table className="w-full border-collapse">
              <caption className="t-caption pb-2 text-left" style={{ color: "var(--ink-muted)" }}>
                {table.caption}
              </caption>
              <thead>
                <tr>
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className="t-caption border-b px-2 py-2"
                      style={{
                        borderColor: "var(--border-hairline)",
                        color: "var(--ink-muted)",
                        textAlign: index === 0 ? "left" : "right",
                      }}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={String(row[0])}>
                    {row.map((cell, index) => (
                      <td
                        key={`${String(row[0])}-${index}`}
                        className="t-small tabular border-b px-2"
                        style={{
                          borderColor: "var(--border-hairline)",
                          color: index === 0 ? "var(--ink-primary)" : "var(--ink-secondary)",
                          textAlign: index === 0 ? "left" : "right",
                          height: "var(--table-row-height)",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div role="img" aria-label={`Chart. ${summary}`} style={{ height }}>
            {children}
          </div>
        )}
      </div>

      {note ? (
        <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export default ChartFrame;
