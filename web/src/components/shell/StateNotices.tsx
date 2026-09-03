import Link from "next/link";
import { AlertOctagon, Wrench } from "lucide-react";
import { ERRORS, STATUS } from "@/lib/content";

/**
 * The two states this product must be able to show without embarrassment.
 *
 * The previous build had neither. When live data was missing it served a
 * three-year-old fixture and labelled it sample data, and when the model was
 * absent it showed frozen probabilities as though something had computed them.
 * Both failures shared one cause: there was nowhere for "we do not know" to go,
 * so the interface filled the space with whatever it had.
 */

export function DataUnavailable({ problem }: { problem: string | null }) {
  return (
    <section
      className="flex flex-col items-start gap-3 border p-6"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--status-critical)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <AlertOctagon
        size={24}
        strokeWidth={1.5}
        color="var(--status-critical)"
        aria-hidden="true"
      />
      <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
        {ERRORS.dataUnavailableTitle}
      </h2>
      <p className="t-body max-w-prose" style={{ color: "var(--ink-secondary)" }}>
        {ERRORS.dataUnavailableBody}
      </p>
      {problem ? (
        <p className="t-small max-w-prose" style={{ color: "var(--ink-muted)" }}>
          {problem}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href="/impact"
          className="t-small rounded-[var(--radius-md)] px-4 py-2.5 font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
        >
          Read what this project does
        </Link>
        <Link
          href="/model"
          className="t-small rounded-[var(--radius-md)] border px-4 py-2.5 font-medium"
          style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
        >
          How the model works
        </Link>
      </div>
    </section>
  );
}

/**
 * Shown wherever a prediction would have gone, when no validated model is
 * scoring. It is deliberately plain: this is the honest state, not an error,
 * and everything else on the page is still live and correct.
 */
export function ScoringNotice({ note }: { note: string | null }) {
  return (
    <div
      className="flex items-start gap-3 border p-4"
      style={{
        background: "var(--surface-sunken)",
        borderColor: "var(--status-warning)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <Wrench
        size={18}
        strokeWidth={1.5}
        color="var(--status-warning)"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      />
      <div>
        <p className="t-small font-semibold" style={{ color: "var(--ink-primary)" }}>
          {STATUS.scoringInProgress}
        </p>
        <p className="t-small mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
          {note ?? STATUS.scoringInProgressBody}
        </p>
      </div>
    </div>
  );
}

/** The inline version, for a single row or card where one prediction is
 *  missing while the rest of the page has them. */
export function PredictionUnavailable({ reason }: { reason: string | null }) {
  return (
    <span className="t-caption" style={{ color: "var(--ink-muted)" }} title={reason ?? undefined}>
      Prediction unavailable
    </span>
  );
}
