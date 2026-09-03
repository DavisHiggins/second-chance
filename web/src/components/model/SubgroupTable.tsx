"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatCount, formatLabel, formatMetric, formatPercent, formatSigned, NOT_MEASURED } from "@/lib/format";
import { StatusIcon } from "@/components/ui/Status";
import type { SubgroupMetric } from "@/lib/model/artifact";

type SortKey = "attribute" | "level" | "n" | "rocAuc" | "calibrationGap";

/** A gap this wide is worth flagging on screen rather than leaving to be found. */
const GAP_FLAG = 0.04;

export function SubgroupTable({ rows, sample }: { rows: SubgroupMetric[]; sample: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("attribute");
  const [ascending, setAscending] = useState(true);

  const sorted = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === "number" && typeof right === "number") {
        return ascending ? left - right : right - left;
      }
      return ascending
        ? String(left).localeCompare(String(right))
        : String(right).localeCompare(String(left));
    });
    return copy;
  }, [rows, sortKey, ascending]);

  const columns: Array<{ key: SortKey; label: string; numeric: boolean }> = [
    { key: "attribute", label: "Attribute", numeric: false },
    { key: "level", label: "Level", numeric: false },
    { key: "n", label: "Animals", numeric: true },
    { key: "rocAuc", label: "AUC", numeric: true },
    { key: "calibrationGap", label: "Calibration gap", numeric: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="t-small pb-3 text-left" style={{ color: "var(--ink-secondary)" }}>
          {sample}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sortKey === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className="t-caption border-b px-2 py-2"
                  style={{
                    borderColor: "var(--border-hairline)",
                    color: "var(--ink-muted)",
                    textAlign: column.numeric ? "right" : "left",
                  }}
                  aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (active) setAscending((value) => !value);
                      else {
                        setSortKey(column.key);
                        setAscending(true);
                      }
                    }}
                    className="inline-flex items-center gap-1"
                    style={{ color: "inherit" }}
                  >
                    {column.label}
                    {active ? (
                      ascending ? (
                        <ArrowUp size={12} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <ArrowDown size={12} strokeWidth={1.5} aria-hidden="true" />
                      )
                    ) : null}
                  </button>
                </th>
              );
            })}
            <th
              scope="col"
              className="t-caption border-b px-2 py-2 text-left"
              style={{ borderColor: "var(--border-hairline)", color: "var(--ink-muted)" }}
            >
              Flag
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const gap = row.calibrationGap;
            const flagged = gap !== null && Math.abs(gap) > GAP_FLAG;
            return (
              <tr key={`${row.attribute}-${row.level}`}>
                <td
                  className="t-small border-b px-2"
                  style={{
                    borderColor: "var(--border-hairline)",
                    height: "var(--table-row-height)",
                    color: "var(--ink-secondary)",
                  }}
                >
                  {formatLabel(row.attribute)}
                </td>
                <td
                  className="t-small border-b px-2"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
                >
                  {formatLabel(row.level)}
                </td>
                <td
                  className="t-small tabular border-b px-2 text-right"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                >
                  {formatCount(row.n)}
                </td>
                <td
                  className="t-small tabular border-b px-2 text-right"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                >
                  {row.rocAuc === null ? NOT_MEASURED : formatMetric(row.rocAuc)}
                </td>
                <td
                  className="t-small tabular border-b px-2 text-right"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                >
                  {gap === null ? NOT_MEASURED : formatSigned(gap, 3)}
                </td>
                <td
                  className="t-caption border-b px-2"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                >
                  {flagged ? (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusIcon tone="warning" size={14} />
                      {gap !== null && gap > 0
                        ? `Over-predicts by ${formatPercent(Math.abs(gap), 1)}`
                        : `Under-predicts by ${formatPercent(Math.abs(gap ?? 0), 1)}`}
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-muted)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default SubgroupTable;
