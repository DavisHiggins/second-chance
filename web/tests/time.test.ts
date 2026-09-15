import { describe, expect, it } from "vitest";
import {
  austinOffsetMinutes,
  austinZoneLabel,
  hasExplicitOffset,
  sourceTimestampToUtcMs,
  toUtcMs,
  utcToAustinFloating,
} from "@/lib/austin/time";
import { buildDataStatus } from "@/lib/austin/status";
import { formatInstant, formatSourceTime, hoursSince } from "@/lib/format";
import type { DataQualityCounts } from "@/lib/austin/current-inventory";

/**
 * The failure these tests pin down was live on the deployed site: the newest
 * intake row was stamped 10:00:12 floating (Austin, CDT) and retrieval ran at
 * 16:16Z, an hour and a quarter later. Comparing the floating value as UTC
 * reported a six-hour delay on a feed that was fresh. Austin's portal
 * metadata put `rowsUpdatedAt` at 15:00:16Z, which fixes the zone.
 */

describe("Austin floating timestamps", () => {
  it("reads a summer stamp as CDT (UTC−5)", () => {
    const ms = sourceTimestampToUtcMs("2026-09-15T10:00:12.000");
    expect(ms).toBe(Date.parse("2026-09-15T15:00:12.000Z"));
    expect(austinOffsetMinutes(ms as number)).toBe(-300);
    expect(austinZoneLabel(ms as number)).toBe("CDT");
  });

  it("reads a winter stamp as CST (UTC−6)", () => {
    const ms = sourceTimestampToUtcMs("2026-01-15T10:00:00");
    expect(ms).toBe(Date.parse("2026-01-15T16:00:00.000Z"));
    expect(austinZoneLabel(ms as number)).toBe("CST");
  });

  it("handles the spring-forward transition without landing in the gap", () => {
    // 2026-03-08 02:30 local does not exist; 03:30 CDT is 08:30Z.
    const ms = sourceTimestampToUtcMs("2026-03-08T03:30:00");
    expect(ms).toBe(Date.parse("2026-03-08T08:30:00.000Z"));
  });

  it("handles the fall-back transition on the later, safer side of the fold", () => {
    // 2026-11-01 01:30 local occurs twice; the result must be one of them.
    const ms = sourceTimestampToUtcMs("2026-11-01T01:30:00") as number;
    const candidates = [Date.parse("2026-11-01T06:30:00Z"), Date.parse("2026-11-01T07:30:00Z")];
    expect(candidates).toContain(ms);
  });

  it("round-trips through the floating formatter", () => {
    const iso = "2026-09-15T16:16:43.037Z";
    const floating = utcToAustinFloating(Date.parse(iso));
    expect(floating).toBe("2026-09-15T11:16:43.037");
    expect(sourceTimestampToUtcMs(floating)).toBe(Date.parse(iso));
  });

  it("never shifts a value that already carries an offset", () => {
    expect(hasExplicitOffset("2026-09-15T16:16:43.037Z")).toBe(true);
    expect(hasExplicitOffset("2026-09-02T21:14:29+00:00")).toBe(true);
    expect(hasExplicitOffset("2026-09-15T10:00:12.000")).toBe(false);
    expect(toUtcMs("2026-09-15T16:16:43.037Z")).toBe(Date.parse("2026-09-15T16:16:43.037Z"));
    expect(sourceTimestampToUtcMs("2026-09-15T16:16:43.037Z")).toBeNull();
  });

  it("formats instants on Austin's clock with the zone named", () => {
    expect(formatInstant("2026-09-15T15:00:16.000Z")).toBe("15 Sep 2026, 10:00 CDT");
    expect(formatSourceTime("2026-09-15T10:00:12.000")).toBe("15 Sep 2026, 10:00 CDT");
    expect(formatInstant("2026-01-15T16:00:00.000Z")).toBe("15 Jan 2026, 10:00 CST");
  });

  it("measures age from a floating stamp through the publisher's zone", () => {
    const now = Date.parse("2026-09-15T16:16:43.037Z");
    expect(hoursSince("2026-09-15T10:00:12.000", now)).toBeCloseTo(1.27, 1);
  });
});

const QUALITY: DataQualityCounts = {
  currentEpisodeCount: 1226,
  companionEpisodeCount: 993,
  nonCompanionEpisodeCount: 233,
  ambiguousEpisodeCount: 11,
  orphanedIntakeCount: 0,
  orphanedOutcomeCount: 1051,
  preCutoverOutcomeCount: 1000,
  duplicateIntakeKeyCount: 0,
  toleranceMatchedCount: 11,
  staleOpenEpisodeCount: 30,
  rejectedRowCount: 0,
  totalIntakeRows: 17423,
  totalOutcomeRows: 17248,
};

const MODEL = { version: "v1", trainedAt: "2026-09-02T21:14:29+00:00", scoringStatus: "live" as const, note: null };

describe("freshness status", () => {
  it("calls the deployed snapshot live, not six hours delayed", () => {
    const status = buildDataStatus({
      intakesUpdatedAt: "2026-09-15T10:00:12.000",
      outcomesUpdatedAt: "2026-09-15T11:00:12.000",
      retrievedAt: "2026-09-15T16:16:43.037Z",
      intakeRowsRetrieved: 17423,
      outcomeRowsRetrieved: 17248,
      quality: QUALITY,
      model: MODEL,
    });
    expect(status.mode).toBe("live");
    expect(status.problem).toBeNull();
    expect(status.publisherAgeHours).toBeCloseTo(1.27, 1);
  });

  it("prefers the publisher's own write time when the portal reports one", () => {
    const status = buildDataStatus({
      intakesUpdatedAt: "2026-09-15T10:00:12.000",
      outcomesUpdatedAt: "2026-09-15T10:00:12.000",
      intakesPublisherUpdatedAt: "2026-09-15T15:00:16.000Z",
      outcomesPublisherUpdatedAt: "2026-09-15T15:00:20.000Z",
      retrievedAt: "2026-09-15T16:16:43.037Z",
      intakeRowsRetrieved: 1,
      outcomeRowsRetrieved: 1,
      quality: QUALITY,
      model: MODEL,
    });
    expect(status.publisherUpdatedAt).toBe("2026-09-15T15:00:16.000Z");
    expect(status.mode).toBe("live");
  });

  it("reports a genuine delay when the publisher is more than three hours behind", () => {
    const status = buildDataStatus({
      intakesUpdatedAt: "2026-09-15T04:00:00.000",
      outcomesUpdatedAt: "2026-09-15T04:00:00.000",
      retrievedAt: "2026-09-15T16:16:43.037Z",
      intakeRowsRetrieved: 1,
      outcomeRowsRetrieved: 1,
      quality: QUALITY,
      model: MODEL,
    });
    expect(status.mode).toBe("delayed");
    expect(status.problem).toMatch(/about 7 hours/);
  });

  it("does not depend on the server's own clock or zone", () => {
    const input = {
      intakesUpdatedAt: "2026-09-15T10:00:12.000",
      outcomesUpdatedAt: "2026-09-15T10:00:12.000",
      retrievedAt: "2026-09-15T16:16:43.037Z",
      intakeRowsRetrieved: 1,
      outcomeRowsRetrieved: 1,
      quality: QUALITY,
      model: MODEL,
    };
    // `now` is deliberately a day later: freshness is judged at retrieval.
    const later = buildDataStatus(input, Date.parse("2026-09-16T16:00:00Z"));
    expect(later.mode).toBe("live");
  });

  it("is unavailable, never live, when nothing was retrieved", () => {
    const status = buildDataStatus({
      intakesUpdatedAt: null,
      outcomesUpdatedAt: null,
      retrievedAt: null,
      intakeRowsRetrieved: null,
      outcomeRowsRetrieved: null,
      quality: null,
      model: MODEL,
      failure: "boom",
    });
    expect(status.mode).toBe("unavailable");
    expect(status.problem).toBe("boom");
  });
});
