/**
 * Austin time.
 *
 * Socrata serves the City of Austin's timestamp columns as floating values
 * with no offset: "2026-09-15T10:00:12.000". They are wall-clock readings in
 * the publisher's zone, America/Chicago, which was verified against the
 * dataset's own `rowsUpdatedAt` (a real epoch): the newest row stamped
 * 10:00:12 floating corresponds to 15:00:16Z, a five-hour gap, which is CDT.
 *
 * Two rules follow, and everything in this module exists to keep them apart:
 *
 * 1. Two floating values from the same feed may be compared directly. The
 *    clock reading is what matters and the offset cancels out.
 * 2. A floating value may only be compared with the real wall clock after it
 *    has been converted through the publisher's zone. Appending "Z" to it
 *    quietly shifts every reading by five or six hours, which is how the
 *    freshness chip came to report a six-hour delay on a feed that was an
 *    hour old.
 *
 * Everything internal stays in UTC epoch milliseconds. Display code adds the
 * zone label so a reader in another timezone is told which clock they are
 * looking at.
 */

export const AUSTIN_TIME_ZONE = "America/Chicago";

const MS_PER_MINUTE = 60_000;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUSTIN_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const zoneNameFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUSTIN_TIME_ZONE,
  timeZoneName: "short",
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(epochMs: number): WallClock {
  const parts = partsFormatter.formatToParts(new Date(epochMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // Some engines still emit "24" for midnight with hourCycle h23.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

function asUtcMs(clock: WallClock, millis = 0): number {
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second, millis);
}

/** Austin's UTC offset, in minutes, at a given instant. −300 in CDT, −360 in CST. */
export function austinOffsetMinutes(epochMs: number): number {
  const clock = wallClockAt(epochMs);
  const asIfUtc = asUtcMs(clock, epochMs % 1000);
  return Math.round((asIfUtc - epochMs) / MS_PER_MINUTE);
}

const FLOATING = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

/**
 * A floating Austin timestamp as a real UTC instant.
 *
 * The offset depends on the instant itself (daylight saving), so it is read
 * from a first guess and then re-read once at the corrected instant. That
 * settles every case except the one repeated hour on the autumn transition,
 * where the earlier reading is chosen, which errs on the side of calling data
 * older rather than fresher.
 *
 * Returns null for a value that already carries an offset: those are not
 * floating and must not be shifted a second time.
 */
export function sourceTimestampToUtcMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = FLOATING.exec(value.trim());
  if (!match) return null;

  const clock: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
  };
  const millis = match[7] ? Number(match[7].padEnd(3, "0")) : 0;
  const naive = asUtcMs(clock, millis);

  const firstOffset = austinOffsetMinutes(naive);
  let instant = naive - firstOffset * MS_PER_MINUTE;
  const secondOffset = austinOffsetMinutes(instant);
  if (secondOffset !== firstOffset) instant = naive - secondOffset * MS_PER_MINUTE;
  return instant;
}

/** True when a timestamp string carries its own offset ("Z" or ±hh:mm). */
export function hasExplicitOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim());
}

/**
 * Any timestamp the product handles, as a UTC instant.
 *
 * Offset-bearing values (our own `retrievedAt`, the model's `trainedAt`) are
 * parsed as written. Floating values are treated as Austin wall-clock time.
 */
export function toUtcMs(value: string | null | undefined): number | null {
  if (!value) return null;
  if (hasExplicitOffset(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return sourceTimestampToUtcMs(value);
}

/**
 * The current instant as a floating Austin timestamp, so it can be compared
 * with source rows under rule 1 above without converting every row.
 */
export function utcToAustinFloating(epochMs: number): string {
  const clock = wallClockAt(epochMs);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const millis = ((epochMs % 1000) + 1000) % 1000;
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(
    clock.minute,
  )}:${pad(clock.second)}.${pad(millis, 3)}`;
}

export function austinNowFloating(now: number = Date.now()): string {
  return utcToAustinFloating(now);
}

/** "CDT" or "CST" at the given instant, for display beside a converted time. */
export function austinZoneLabel(epochMs: number): string {
  const part = zoneNameFormatter
    .formatToParts(new Date(epochMs))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "CT";
}

/** Hours between a UTC instant and now. Positive means in the past. */
export function hoursSinceUtc(epochMs: number | null, now: number = Date.now()): number | null {
  if (epochMs === null) return null;
  return (now - epochMs) / 3_600_000;
}
