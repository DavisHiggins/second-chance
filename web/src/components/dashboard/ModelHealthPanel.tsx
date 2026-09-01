import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DASHBOARD } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { StatusIcon, statusLabel } from "@/components/ui/Status";
import type { ModelHealthRow } from "@/types/api";

export function ModelHealthPanel({ rows }: { rows: ModelHealthRow[] }) {
  return (
    <div>
      <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
        {DASHBOARD.healthTitle}
      </h2>
      <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
        Measured on the held-out test block. Each row links to the section of the model page it
        comes from.
      </p>
      <ul className="mt-4 divide-y" style={{ borderColor: "var(--border-hairline)" }}>
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="flex items-center gap-3 py-3"
              style={{ color: "var(--ink-primary)" }}
            >
              <StatusIcon tone={row.status} size={20} label={`${row.label}: ${statusLabel(row.status)}`} />
              <span className="t-small flex-1" style={{ color: "var(--ink-secondary)" }}>
                {row.label}
              </span>
              <span className="t-small tabular text-right">
                {row.id === "retrained" ? formatDate(String(row.value)) : row.display}
              </span>
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--ink-muted)" }} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ModelHealthPanel;
