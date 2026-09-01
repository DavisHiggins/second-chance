import { DETAIL } from "@/lib/content";
import { formatDateTime, formatLabel } from "@/lib/format";
import type { TimelineEvent } from "@/types/api";

/** Repeat visitors show every prior episode with its outcome. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section>
      <h2 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
        {DETAIL.timelineTitle}
      </h2>
      {events.length === 0 ? (
        <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
          No history was exported for this animal.
        </p>
      ) : (
        <ol className="mt-3 space-y-4">
          {events.map((event, index) => (
            <li key={`${event.event}-${event.at}-${index}`} className="flex gap-3">
              <span className="flex flex-col items-center" aria-hidden="true">
                <span
                  className="mt-1.5 block h-2 w-2 rounded-[var(--radius-full)]"
                  style={{ background: "var(--accent)" }}
                />
                {index < events.length - 1 ? (
                  <span className="mt-1 w-px flex-1" style={{ background: "var(--grid-line)" }} />
                ) : null}
              </span>
              <div>
                <p className="t-small" style={{ color: "var(--ink-primary)" }}>
                  {formatLabel(event.event)}
                </p>
                <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
                  {formatDateTime(event.at)}
                </p>
                <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
                  {event.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default Timeline;
