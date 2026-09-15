import { describe, expect, it } from "vitest";
import { buildCsv, buildPlan, csvCell, scenarioAdoptions, type PlanRow } from "@/lib/planner";
import { describeHorizon, TRIAGE_LABEL } from "@/lib/model/horizon";
import { recordTitle, resolveOrigin } from "@/lib/recordTitle";
import { formatPercentagePoints, formatPp } from "@/lib/format";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

function stay(overrides: Partial<ScoredStay>): ScoredStay {
  return {
    episodeId: `sb:${overrides.animalId ?? "1"}:2026-08-01T10:00:00.000`,
    animalId: "1",
    name: "Latke",
    species: "Dog",
    rawType: "Dog",
    breed: "Mixed",
    color: null,
    sex: null,
    alteredAtIntake: null,
    intakeReason: null,
    condition: null,
    intakeAt: "2026-08-01T10:00:00.000",
    daysInCare: 10,
    ageAtIntakeDays: 900,
    currentAgeDays: 910,
    lifeStage: "adult",
    dataQualityFlags: [],
    possiblyStale: false,
    pLongStay60d: 0.3,
    pAdopt30d: 0.4,
    riskBand: "warning",
    predictionUnavailableReason: null,
    ...overrides,
  };
}

const CHANNELS: InterventionChannel[] = [
  { channel: "social media", label: "Social", rationale: "", evidence: "assumed", evidence_detail: "", staff_minutes: 15, time_note: "" },
  { channel: "photography", label: "Photos", rationale: "", evidence: "assumed", evidence_detail: "", staff_minutes: 25, time_note: "" },
  { channel: "adoption event", label: "Event", rationale: "", evidence: "assumed", evidence_detail: "", staff_minutes: 90, time_note: "" },
  { channel: "foster recruitment", label: "Foster", rationale: "", evidence: "historical", evidence_detail: "", staff_minutes: 45, time_note: "" },
  { channel: "senior adoption event", label: "Senior", rationale: "", evidence: "historical", evidence_detail: "", staff_minutes: 60, time_note: "" },
  { channel: "medical and behaviour support", label: "Medical", rationale: "", evidence: "historical", evidence_detail: "", staff_minutes: 120, time_note: "" },
];

describe("horizon labels", () => {
  it("leads with the fact for an animal already past 60 days", () => {
    const h = describeHorizon({ daysInCare: 299, pLongStay60d: 0.71, scoring: true });
    expect(h.status).toBe("already_past_horizon");
    expect(h.headline).toBe("Already waiting over 60 days");
    expect(h.estimateNote).toMatch(/At intake the model estimated a 71% chance/);
    expect(h.estimateNote).toMatch(/not as a forecast/);
    expect(h.adoptionWindowPassed).toBe(true);
  });

  it("calls a live estimate an intake-time estimate with days remaining", () => {
    const h = describeHorizon({ daysInCare: 10, pLongStay60d: 0.42, scoring: true });
    expect(h.status).toBe("estimate");
    expect(h.headline).toMatch(/^Intake-time estimate: 42%/);
    expect(h.daysToHorizon).toBe(50);
    expect(h.adoptionWindowPassed).toBe(false);
  });

  it("describes an unscored animal by its wait only", () => {
    const h = describeHorizon({ daysInCare: 45, pLongStay60d: null, scoring: true });
    expect(h.status).toBe("unavailable");
    expect(h.headline).toBe("Waiting 45 days");
    expect(h.estimateNote).toBeNull();
  });

  it("uses supportive triage words rather than medical urgency", () => {
    expect(Object.values(TRIAGE_LABEL)).not.toContain("Critical");
    expect(TRIAGE_LABEL.critical).toBe("Priority outreach");
  });
});

describe("record titles", () => {
  it("derives the title from name and animal id, not the episode id tail", () => {
    expect(recordTitle("Latke", "18333")).toBe("Latke · Animal 18333");
    expect(recordTitle(null, "18333")).toBe("Animal 18333");
    expect(recordTitle("  ", "7")).toBe("Animal 7");
  });

  it("only accepts known origins for the breadcrumb", () => {
    expect(resolveOrigin("queue")).toBe("queue");
    expect(resolveOrigin(["planner"])).toBe("planner");
    expect(resolveOrigin("javascript:alert(1)")).toBe("records");
    expect(resolveOrigin(undefined)).toBe("records");
  });
});

describe("plan building", () => {
  it("places manual picks first and fills the rest in rotation", () => {
    const stays = [
      stay({ animalId: "1", daysInCare: 5, pLongStay60d: 0.9 }), // social (recent)
      stay({ animalId: "2", daysInCare: 25, pLongStay60d: 0.8 }), // photography
      stay({ animalId: "3", daysInCare: 70, pLongStay60d: 0.7 }), // event
      stay({ animalId: "4", daysInCare: 6, pLongStay60d: 0.6 }), // social
    ];
    const plan = buildPlan({
      stays,
      channels: CHANNELS,
      capacity: 3,
      selected: CHANNELS.map((c) => c.channel),
      picks: [{ episodeId: stays[3].episodeId, channel: "adoption event", addedAt: "2026-09-15T00:00:00Z" }],
      removed: [],
      overrides: {},
    });
    expect(plan).toHaveLength(3);
    expect(plan[0].stay.animalId).toBe("4");
    expect(plan[0].source).toBe("manual");
    expect(plan[0].channel.channel).toBe("adoption event");
    expect(plan[0].suggestedChannel).toBe("social media");
    // Two automatic rows from different channels, not two from the same one.
    expect(new Set(plan.slice(1).map((row) => row.channel.channel)).size).toBe(2);
  });

  it("honours removals and channel overrides on automatic rows", () => {
    const stays = [stay({ animalId: "1", daysInCare: 5 }), stay({ animalId: "2", daysInCare: 6 })];
    const plan = buildPlan({
      stays,
      channels: CHANNELS,
      capacity: 5,
      selected: ["social media", "photography"],
      picks: [],
      removed: [stays[0].episodeId],
      overrides: { [stays[1].episodeId]: "photography" },
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].stay.animalId).toBe("2");
    expect(plan[0].channel.channel).toBe("photography");
  });
});

describe("scenario arithmetic", () => {
  const row = (s: ScoredStay): PlanRow => ({
    stay: s,
    channel: CHANNELS[0],
    suggestedChannel: "social media",
    reason: "",
    source: "automatic",
  });

  it("treats the dial as percentage points and caps at 100% per animal", () => {
    const rows = [
      row(stay({ animalId: "1", daysInCare: 5, pAdopt30d: 0.4 })), // +0.10 → 0.10
      row(stay({ animalId: "2", daysInCare: 5, pAdopt30d: 0.95 })), // capped at 0.05
    ];
    const result = scenarioAdoptions(rows, 0.1);
    expect(result.additional).toBeCloseTo(0.15, 10);
    expect(result.modelBaselineRows).toBe(2);
    expect(result.hypotheticalRows).toBe(0);
  });

  it("makes 20 animals at 10 points equal 2 additional adoptions when baselines allow", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(stay({ animalId: String(i), daysInCare: 3, pAdopt30d: 0.3 })),
    );
    expect(scenarioAdoptions(rows, 0.1).additional).toBeCloseTo(2, 10);
  });

  it("counts an animal past day 30 as hypothetical rather than using its intake estimate as a baseline", () => {
    const rows = [row(stay({ animalId: "1", daysInCare: 299, pAdopt30d: 0.1 }))];
    const result = scenarioAdoptions(rows, 0.1);
    expect(result.hypotheticalRows).toBe(1);
    expect(result.modelBaselineRows).toBe(0);
    expect(result.additional).toBeCloseTo(0.1, 10);
  });

  it("spells the unit out", () => {
    expect(formatPercentagePoints(0.1)).toBe("+10.0 percentage points");
    expect(formatPercentagePoints(0.01)).toBe("+1.0 percentage point");
    expect(formatPp(-0.083)).toBe("−8.3 pp");
  });
});

describe("CSV export", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvCell('Fluffy, "the" cat')).toBe('"Fluffy, ""the"" cat"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
  });

  it("carries ids, snapshot, plan date, assumptions and horizon; unscored exports as empty", () => {
    const rows: PlanRow[] = [
      {
        stay: stay({ animalId: "9", name: "=SUM(1)", pLongStay60d: null, pAdopt30d: null, daysInCare: 80 }),
        channel: CHANNELS[1],
        suggestedChannel: "photography",
        reason: "",
        source: "manual",
      },
    ];
    const csv = buildCsv(
      rows,
      {
        planDate: "2026-09-15",
        snapshotAt: "2026-09-15T16:16:48.300Z",
        publisherUpdatedAt: "2026-09-15T15:00:16.000Z",
        modelVersion: "sc-sb-2026-09-02-v1",
        scoring: true,
        upliftPoints: 0.1,
        capacity: 20,
        scenario: { additional: 0.1, hypotheticalRows: 1, modelBaselineRows: 0, noBaselineRows: 0 },
      },
      { [rows[0].stay.episodeId]: "In progress" },
    );
    const lines = csv.split("\r\n");
    expect(lines).toContain("# plan_date,2026-09-15");
    expect(lines).toContain("# source_snapshot,2026-09-15T16:16:48.300Z");
    expect(lines).toContain("# assumed_uplift_percentage_points,10");
    expect(lines.some((l) => l.startsWith("# estimate_horizon,"))).toBe(true);
    const header = lines.find((l) => l.startsWith("animal_id,"));
    expect(header).toContain("episode_id");
    const data = lines[lines.length - 1].split(",");
    expect(data[0]).toBe("9");
    expect(data[1]).toBe(rows[0].stay.episodeId);
    expect(data[2]).toBe("'=SUM(1)");
    expect(data[6]).toBe("yes");
    expect(data[7]).toBe("");
    expect(data[8]).toBe("");
    expect(data[14]).toBe("In progress");
  });
});
