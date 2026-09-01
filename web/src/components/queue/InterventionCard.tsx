import Link from "next/link";
import { BadgeCheck, FlaskConical } from "lucide-react";
import { DETAIL } from "@/lib/content";
import { formatStaffTime } from "@/lib/format";
import type { InterventionChannel } from "@/types/api";

/**
 * A measured claim gets its figure and a link to the model page. An assumed
 * claim gets an assumption chip and the reason it cannot be measured, in plain
 * sight. Presenting the second as the first is the failure this card exists to
 * prevent.
 */
export function InterventionCard({ channel }: { channel: InterventionChannel }) {
  const measured = channel.evidence === "measured";
  const Icon = measured ? BadgeCheck : FlaskConical;

  return (
    <div
      className="border p-4"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
          {channel.label}
        </h4>
        <span
          className="t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2 py-1"
          style={{
            background: "var(--surface-sunken)",
            color: measured ? "var(--status-good)" : "var(--ink-secondary)",
          }}
        >
          <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
          {measured ? DETAIL.evidenceMeasured : DETAIL.evidenceAssumed}
        </span>
      </div>

      <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
        {channel.rationale}
      </p>
      <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
        {channel.evidence_detail}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="t-caption tabular" style={{ color: "var(--ink-secondary)" }}>
          {`About ${formatStaffTime(channel.staff_minutes)} of staff time`}
        </span>
        {measured ? (
          <Link
            className="t-caption underline underline-offset-2"
            href="/model#how-well"
            style={{ color: "var(--ink-secondary)" }}
          >
            Where this number comes from
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default InterventionCard;
