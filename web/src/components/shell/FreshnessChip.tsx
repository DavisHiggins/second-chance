"use client";

import { useEffect, useState } from "react";
import { formatDateTime, hoursSince } from "@/lib/format";
import { SHELL } from "@/lib/content";
import { StatusIcon, type StatusTone } from "@/components/ui/Status";

/**
 * The freshness chip is the one element in the product that pulses, and it only
 * pulses in the stale state. It is reserved for the case where the screen might
 * be lying to you.
 */
export function FreshnessChip({
  dataAsOf,
  usingFallback,
}: {
  dataAsOf: string;
  usingFallback: boolean;
}) {
  // Age is computed on the client so the server render never bakes in a clock
  // reading that is wrong by the time it arrives.
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    setAge(hoursSince(dataAsOf));
  }, [dataAsOf]);

  let tone: StatusTone = "good";
  let text = `Data current as of ${formatDateTime(dataAsOf)}`;
  let pulse = false;

  if (usingFallback) {
    tone = "critical";
    text = SHELL.freshnessFallback;
  } else if (age !== null && age > 48) {
    tone = "critical";
    text = `Data is ${Math.round(age)} hours old`;
  } else if (age !== null && age >= 24) {
    tone = "warning";
    text = `Data is ${Math.round(age)} hours old`;
    pulse = true;
  }

  return (
    <span
      className={`t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-1 ${
        pulse ? "freshness-pulse" : ""
      }`}
      style={{
        background: "var(--surface-sunken)",
        borderColor: "var(--border-hairline)",
        color: "var(--ink-secondary)",
      }}
      title={usingFallback ? `Fixture stamped ${formatDateTime(dataAsOf)}` : undefined}
    >
      <StatusIcon tone={tone} size={14} label={`Data freshness: ${tone}`} />
      {text}
      {usingFallback ? (
        <span className="sr-only">
          {` Fixture stamped ${formatDateTime(dataAsOf)}.`}
        </span>
      ) : null}
    </span>
  );
}

export default FreshnessChip;
