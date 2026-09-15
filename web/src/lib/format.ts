/**
 * Every number the product renders passes through here. Formatting inline in a
 * component is how "22.1" and "22" end up on the same screen.
 *
 * `null` and `undefined` render as NOT_MEASURED, never as zero. The API uses
 * null to mean "not measured" and the interface has to say the same thing.
 */

import { austinZoneLabel, sourceTimestampToUtcMs, toUtcMs, utcToAustinFloating } from "@/lib/austin/time";

export const NOT_MEASURED = "not measured";

type Maybe = number | null | undefined;

function isMissing(value: Maybe): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** 0.412 becomes "41%". Whole percents, always with the sign. */
export function formatPercent(value: Maybe, fractionDigits = 0): string {
  if (isMissing(value)) return NOT_MEASURED;
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/** A percentage that is already on a 0-100 scale. */
export function formatPercentPoints(value: Maybe, fractionDigits = 1): string {
  if (isMissing(value)) return NOT_MEASURED;
  return `${value.toFixed(fractionDigits)}%`;
}

/** 12 becomes "12 days"; 1 becomes "1 day". */
export function formatDays(value: Maybe, fractionDigits = 0): string {
  if (isMissing(value)) return NOT_MEASURED;
  const rounded = Number(value.toFixed(fractionDigits));
  return `${formatNumber(rounded, fractionDigits)} ${rounded === 1 ? "day" : "days"}`;
}

/** Thousands separators, fixed decimals, negatives kept. */
export function formatNumber(value: Maybe, fractionDigits = 0): string {
  if (isMissing(value)) return NOT_MEASURED;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatCount(value: Maybe): string {
  return formatNumber(value, 0);
}

/** Metrics that live in [0, 1] and are read to three places: AUC, ECE, Brier. */
export function formatMetric(value: Maybe, fractionDigits = 3): string {
  if (isMissing(value)) return NOT_MEASURED;
  return value.toFixed(fractionDigits);
}

/** A signed delta, for the dashboard tiles. Always carries its sign. */
export function formatSignedPercent(value: Maybe, fractionDigits = 1): string {
  if (isMissing(value)) return NOT_MEASURED;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value * 100).toFixed(fractionDigits)}%`;
}

export function formatSigned(value: Maybe, fractionDigits = 2): string {
  if (isMissing(value)) return NOT_MEASURED;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(fractionDigits)}`;
}

export function formatMultiplier(value: Maybe, fractionDigits = 1): string {
  if (isMissing(value)) return NOT_MEASURED;
  return `${value.toFixed(fractionDigits)}x`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Timestamps are formatted from their own string rather than through the
 * viewer's locale, so a fixture stamped in Austin does not silently shift by a
 * timezone on someone else's laptop.
 */
function parts(iso: string): { y: number; m: number; d: number; hh: string; mm: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
    hh: match[4] ?? "00",
    mm: match[5] ?? "00",
  };
}

/** "4 Mar 2022, 11:25" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_MEASURED;
  const p = parts(iso);
  if (!p) return NOT_MEASURED;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${p.hh}:${p.mm}`;
}

/** "4 Mar 2022" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_MEASURED;
  const p = parts(iso);
  if (!p) return NOT_MEASURED;
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** "Mar 2022", for a "YYYY-MM" period key. */
export function formatMonth(period: string | null | undefined): string {
  if (!period) return NOT_MEASURED;
  const match = /^(\d{4})-(\d{2})/.exec(period);
  if (!match) return period;
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/** Age in days rendered the way a person would say it. */
export function formatAge(days: Maybe): string {
  if (isMissing(days)) return NOT_MEASURED;
  if (days < 31) return `${Math.max(0, Math.round(days))} days old`;
  if (days < 365) {
    const months = Math.round(days / 30.44);
    return `${months} month${months === 1 ? "" : "s"} old`;
  }
  const years = Math.floor(days / 365.25);
  return `${years} year${years === 1 ? "" : "s"} old`;
}

/** "young_adult" becomes "Young adult". */
export function formatLabel(value: string | null | undefined): string {
  if (!value) return NOT_MEASURED;
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Minutes of staff time rendered as hours once it stops being readable. */
export function formatStaffTime(minutes: Maybe): string {
  if (isMissing(minutes)) return NOT_MEASURED;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} hours`;
}

/** "About 3 in 10 animals like this one go home within 30 days." */
export function formatInTen(probability: Maybe): string | null {
  if (isMissing(probability)) return null;
  const n = Math.round(probability * 10);
  if (n <= 0) return "Fewer than 1 in 10";
  return `${n} in 10`;
}

/** Hours between a timestamp and now. Floating values are read as Austin
 *  time; offset-bearing values as written. */
export function hoursSince(iso: string, now: number = Date.now()): number {
  const then = toUtcMs(iso);
  if (then === null) return Number.POSITIVE_INFINITY;
  return (now - then) / 3_600_000;
}

/**
 * A real instant (our own retrieval time, the publisher's write time),
 * shown on Austin's clock with the zone named: "15 Sep 2026, 10:00 CDT".
 * Every clock on the site reads the same way, so a viewer in another zone
 * is never left comparing a UTC stamp with a local one.
 */
export function formatInstant(isoUtc: string | null | undefined): string {
  if (!isoUtc) return NOT_MEASURED;
  const ms = toUtcMs(isoUtc);
  if (ms === null) return NOT_MEASURED;
  return `${formatDateTime(utcToAustinFloating(ms))} ${austinZoneLabel(ms)}`;
}

/** A floating source timestamp, with the zone it was written in. */
export function formatSourceTime(floating: string | null | undefined): string {
  if (!floating) return NOT_MEASURED;
  const ms = sourceTimestampToUtcMs(floating);
  const base = formatDateTime(floating);
  if (base === NOT_MEASURED || ms === null) return base;
  return `${base} ${austinZoneLabel(ms)}`;
}

/** "about 2 hours ago", "about 40 minutes ago". For status lines only. */
export function formatRelativeAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return NOT_MEASURED;
  if (hours < 1) return `about ${Math.max(1, Math.round(hours * 60))} minutes ago`;
  if (hours < 48) {
    const rounded = Math.round(hours);
    return `about ${rounded} ${rounded === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.round(hours / 24);
  return `about ${days} days ago`;
}

/** 0.083 becomes "+8.3 percentage points"; unit spelled out so it is never
 *  mistaken for a relative change. */
export function formatPercentagePoints(value: Maybe, fractionDigits = 1, signed = true): string {
  if (isMissing(value)) return NOT_MEASURED;
  const points = value * 100;
  const sign = signed ? (points > 0 ? "+" : points < 0 ? "−" : "") : "";
  const magnitude = Math.abs(points).toFixed(fractionDigits);
  const unit = Number(magnitude) === 1 ? "percentage point" : "percentage points";
  return `${sign}${magnitude} ${unit}`;
}

/** Short form for tight cells: "+8.3 pp". */
export function formatPp(value: Maybe, fractionDigits = 1): string {
  if (isMissing(value)) return NOT_MEASURED;
  const points = value * 100;
  const sign = points > 0 ? "+" : points < 0 ? "−" : "";
  return `${sign}${Math.abs(points).toFixed(fractionDigits)} pp`;
}
