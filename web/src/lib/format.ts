/**
 * Every number the product renders passes through here. Formatting inline in a
 * component is how "22.1" and "22" end up on the same screen.
 *
 * `null` and `undefined` render as NOT_MEASURED, never as zero. The API uses
 * null to mean "not measured" and the interface has to say the same thing.
 */

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

/** Hours between an ISO timestamp and now, used by the freshness chip. */
export function hoursSince(iso: string, now: number = Date.now()): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now - then) / 3_600_000;
}
