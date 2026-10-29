"use client";

import { useEffect, useState } from "react";
import { formatInstant, formatRelativeAge, formatShortAge } from "@/lib/format";
import { STATUS } from "@/lib/content";
import { toUtcMs } from "@/lib/austin/time";
import { dataAsOf, type DataMode, type DataStatus } from "@/lib/austin/status";
import { StatusIcon, type StatusTone } from "@/components/ui/Status";

/**
 * The data-status chip.
 *
 * This replaced a boolean called `usingFallback` that was hardcoded to true,
 * so the header permanently announced "Showing sample data" while the page
 * behind it presented a three-year-old fixture as the current shelter. The
 * mode below has no value that lets stale or synthetic data wear the live
 * label, and the chip is the one element in the product that pulses: it is
 * reserved for the case where the screen might be misleading you.
 *
 * The time it shows is the publisher's last write when Austin reported one,
 * otherwise the newest row stamp, both read on Austin's clock with the zone
 * named. A new request from this site does not count as a new publication.
 * The age is computed on the client so it keeps counting after the page was
 * served; the server-rendered copy carries no time at all. In the header it
 * is drawn in its short form ("12 min ago") inside the pill, so the chip
 * reads as a clock that is running rather than a static badge.
 */

const TONE_BY_MODE: Record<DataMode, StatusTone> = {
  live: "good",
  delayed: "warning",
  historical_demo: "serious",
  unavailable: "critical",
};

const LABEL_BY_MODE: Record<DataMode, string> = {
  live: STATUS.liveLabel,
  delayed: STATUS.delayedLabel,
  historical_demo: STATUS.historicalLabel,
  unavailable: STATUS.unavailableLabel,
};

export function FreshnessChip({
  status,
  onOpenDetails,
  compact = false,
  showAge = true,
  onBand = false,
  shortAge = false,
}: {
  status: DataStatus;
  onOpenDetails?: () => void;
  /** Icon and short label only, for narrow headers. */
  compact?: boolean;
  /** Show "· last published …" after the label. Off where the header needs
   *  the room; the age then stays in the tooltip and screen-reader text. */
  showAge?: boolean;
  /** Drawn on the navy band. */
  onBand?: boolean;
  /** Show the age in its short form ("12 min ago"), even when compact. */
  shortAge?: boolean;
}) {
  const [stamp, setStamp] = useState<{ time: string; age: string; short: string } | null>(null);

  useEffect(() => {
    const iso = dataAsOf(status);
    if (!iso) {
      setStamp(null);
      return;
    }
    const compute = () => {
      const ms = toUtcMs(iso);
      const hours = ms === null ? null : (Date.now() - ms) / 3_600_000;
      setStamp({
        time: formatInstant(iso),
        age: hours === null ? "" : formatRelativeAge(hours),
        short: formatShortAge(hours),
      });
    };
    compute();
    const timer = window.setInterval(compute, 30_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const tone = TONE_BY_MODE[status.mode];
  const label = LABEL_BY_MODE[status.mode];
  const pulse = status.mode === "delayed";

  const detail =
    stamp === null
      ? ""
      : status.mode === "live"
        ? ` · published ${stamp.age}`
        : status.mode === "delayed"
          ? ` · last published ${stamp.age}`
          : status.mode === "historical_demo"
            ? ` · data from ${stamp.time}`
            : "";

  // The short age is only meaningful for a feed that is publishing.
  const short =
    shortAge && stamp && (status.mode === "live" || status.mode === "delayed") ? stamp.short : "";
  const longAgeDrawn = !shortAge && !compact && showAge;

  // When the full age is not drawn, it moves into the tooltip rather than vanishing.
  const tooltip = [longAgeDrawn ? null : `${label}${detail}`, status.problem]
    .filter(Boolean)
    .join(". ");

  const content = (
    <>
      <StatusIcon tone={tone} size={14} label={`Data status: ${label}`} />
      <span className={compact ? "sr-only sm:not-sr-only" : ""}>
        {label}
        {longAgeDrawn ? detail : ""}
        {short ? <span aria-hidden="true">{" ·"}</span> : null}
      </span>
      {short ? (
        <span className="tabular" aria-hidden="true" style={{ color: onBand ? "var(--brand-band-ink-muted)" : "var(--ink-muted)" }}>
          {short}
        </span>
      ) : null}
      {stamp ? <span className="sr-only">{` Published ${stamp.time}.`}</span> : null}
      {status.problem ? <span className="sr-only">{` ${status.problem}`}</span> : null}
    </>
  );

  const className = `t-caption inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-full)] border px-3 ${
    pulse ? "freshness-pulse" : ""
  }`;

  const style = onBand
    ? ({
        background: "rgba(255,255,255,0.06)",
        borderColor: "var(--brand-band-hairline)",
        color: "var(--brand-band-ink)",
      } as const)
    : ({
        background: "var(--surface-sunken)",
        borderColor: "var(--border-hairline)",
        color: "var(--ink-secondary)",
      } as const);

  if (!onOpenDetails) {
    return (
      <span className={className} style={style} title={tooltip || undefined}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className={`${className} text-left`}
      style={style}
      title={tooltip || "Where this data comes from"}
      aria-haspopup="dialog"
    >
      {content}
    </button>
  );
}

export default FreshnessChip;
