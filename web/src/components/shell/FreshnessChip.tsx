"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { STATUS } from "@/lib/content";
import { StatusIcon, type StatusTone } from "@/components/ui/Status";
import type { DataMode } from "@/lib/austin/status";

/**
 * The data-status chip.
 *
 * This replaced a boolean called `usingFallback` that was hardcoded to true,
 * so the header permanently announced "Showing sample data" while the page
 * behind it presented a three-year-old fixture as the current shelter. The
 * mode below has no value that lets stale or synthetic data wear the live
 * label, and the chip is the one element in the product that pulses: it is
 * reserved for the case where the screen might be misleading you.
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
  mode,
  updatedAt,
  problem,
  onOpenDetails,
}: {
  mode: DataMode;
  updatedAt: string | null;
  problem: string | null;
  onOpenDetails?: () => void;
}) {
  // The timestamp is formatted on the client so the server render never bakes
  // in a reading that is already wrong by the time it reaches the browser.
  const [stamp, setStamp] = useState<string | null>(null);

  useEffect(() => {
    setStamp(updatedAt ? formatDateTime(updatedAt) : null);
  }, [updatedAt]);

  const tone = TONE_BY_MODE[mode];
  const label = LABEL_BY_MODE[mode];
  const pulse = mode === "delayed";

  const suffix =
    stamp === null
      ? ""
      : mode === "live"
        ? ` · updated ${stamp}`
        : mode === "delayed"
          ? ` · last update ${stamp}`
          : mode === "historical_demo"
            ? ` · data from ${stamp}`
            : "";

  const content = (
    <>
      <StatusIcon tone={tone} size={14} label={`Data status: ${label}`} />
      <span>
        {label}
        {suffix}
      </span>
      {problem ? <span className="sr-only">{` ${problem}`}</span> : null}
    </>
  );

  const className = `t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-1 ${
    pulse ? "freshness-pulse" : ""
  }`;

  const style = {
    background: "var(--surface-sunken)",
    borderColor: "var(--border-hairline)",
    color: "var(--ink-secondary)",
  } as const;

  if (!onOpenDetails) {
    return (
      <span className={className} style={style} title={problem ?? undefined}>
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
      title={problem ?? "Where this data comes from"}
    >
      {content}
    </button>
  );
}

export default FreshnessChip;
