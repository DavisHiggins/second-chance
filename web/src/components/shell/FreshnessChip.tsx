"use client";

import { useEffect, useState } from "react";
import { formatInstant, formatRelativeAge } from "@/lib/format";
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
 * served; the server-rendered copy carries no time at all.
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
  onBand = false,
}: {
  status: DataStatus;
  onOpenDetails?: () => void;
  /** Icon and short label only, for narrow headers. */
  compact?: boolean;
  /** Drawn on the navy band. */
  onBand?: boolean;
}) {
  const [stamp, setStamp] = useState<{ time: string; age: string } | null>(null);

  useEffect(() => {
    const iso = dataAsOf(status);
    if (!iso) {
      setStamp(null);
      return;
    }
    const compute = () => {
      const ms = toUtcMs(iso);
      setStamp({
        time: formatInstant(iso),
        age: ms === null ? "" : formatRelativeAge((Date.now() - ms) / 3_600_000),
      });
    };
    compute();
    const timer = window.setInterval(compute, 60_000);
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

  const content = (
    <>
      <StatusIcon tone={tone} size={14} label={`Data status: ${label}`} />
      <span className={compact ? "sr-only sm:not-sr-only" : ""}>
        {label}
        {compact ? "" : detail}
      </span>
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
      <span className={className} style={style} title={status.problem ?? undefined}>
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
      title={status.problem ?? "Where this data comes from"}
      aria-haspopup="dialog"
    >
      {content}
    </button>
  );
}

export default FreshnessChip;
