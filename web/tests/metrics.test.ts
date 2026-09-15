import { describe, expect, it } from "vitest";
import { monthlySeries, segmentByLifeStage } from "@/lib/austin/metrics";
import type { Episode } from "@/lib/austin/types";

function episode(overrides: Partial<Episode>): Episode {
  return {
    episodeId: `sb:${overrides.animalId ?? "1"}:${overrides.intakeAt ?? "2026-05-10T10:00:00.000"}`,
    sourceSystem: "shelterbuddy",
    sourceEventId: "x",
    animalId: "1",
    intakeAt: "2026-05-10T10:00:00.000",
    species: "Dog",
    rawType: "Dog",
    name: null,
    sex: null,
    alteredAtIntake: null,
    breed: null,
    color: null,
    intakeReason: null,
    condition: null,
    dateOfBirth: null,
    ageAtIntakeDays: 900,
    outcomeAt: null,
    outcomeType: null,
    closedDaysInCare: null,
    reportedDaysInShelter: null,
    sourceUpdatedAt: null,
    joinStatus: "open",
    joinConfidence: "high",
    dataQualityFlags: [],
    ...overrides,
  };
}

function adopted(animalId: string, intakeAt: string, days: number): Episode {
  const outcome = new Date(Date.parse(`${intakeAt}Z`) + days * 86_400_000).toISOString().replace("Z", "");
  return episode({
    animalId,
    intakeAt,
    outcomeAt: outcome,
    outcomeType: "Adopted",
    closedDaysInCare: days,
    joinStatus: "matched",
  });
}

function transferred(animalId: string, intakeAt: string, days: number): Episode {
  return { ...adopted(animalId, intakeAt, days), outcomeType: "Transfer" };
}

describe("monthly series", () => {
  const episodes = [
    ...Array.from({ length: 25 }, (_, i) => adopted(`a${i}`, "2026-06-05T10:00:00.000", 10)),
    ...Array.from({ length: 25 }, (_, i) => transferred(`t${i}`, "2026-06-06T10:00:00.000", 40)),
    ...Array.from({ length: 30 }, (_, i) => episode({ animalId: `o${i}`, intakeAt: "2026-09-10T10:00:00.000" })),
  ];
  const series = monthlySeries(episodes, "2026-09-15T12:00:00.000");

  it("keeps intakes and adoptions as separate event counts", () => {
    const june = series.find((p) => p.month === "2026-06");
    expect(june?.intakes).toBe(50);
    expect(june?.adoptions).toBe(25);
  });

  it("computes a cohort adoption rate only over arrivals with a full 30-day opportunity", () => {
    const june = series.find((p) => p.month === "2026-06");
    expect(june?.eligible30d).toBe(50);
    expect(june?.adoptedWithin30dRate).toBeCloseTo(0.5, 10);
    const september = series.find((p) => p.month === "2026-09");
    expect(september?.eligible30d).toBe(0);
    expect(september?.adoptedWithin30dRate).toBeNull();
  });

  it("marks the current month as partial", () => {
    expect(series.find((p) => p.month === "2026-09")?.partial).toBe(true);
    expect(series.find((p) => p.month === "2026-06")?.partial).toBe(false);
  });
});

describe("life-stage segments", () => {
  const episodes = [
    ...Array.from({ length: 30 }, (_, i) => adopted(`a${i}`, "2026-03-01T10:00:00.000", 8)),
    ...Array.from({ length: 70 }, (_, i) => transferred(`t${i}`, "2026-03-02T10:00:00.000", 8)),
    // Outside the window: must not count.
    ...Array.from({ length: 50 }, (_, i) => adopted(`old${i}`, "2024-03-01T10:00:00.000", 90)),
  ];
  const rows = segmentByLifeStage(
    episodes,
    () => "adult",
    "2025-09-15T00:00:00.000",
    "2026-09-15T00:00:00.000",
  );

  it("reports the adopted sample beside the median and the completed count beside the share", () => {
    const adult = rows.find((r) => r.level === "adult");
    expect(adult?.adopted).toBe(30);
    expect(adult?.n).toBe(100);
    expect(adult?.medianDaysToAdoption).toBe(8);
    expect(adult?.adoptionShare).toBeCloseTo(0.3, 10);
  });

  it("respects the window so the count matches the dashboard's cohort", () => {
    const unwindowed = segmentByLifeStage(episodes, () => "adult");
    expect(unwindowed[0].adopted).toBe(80);
    expect(rows[0].adopted).toBe(30);
  });
});
