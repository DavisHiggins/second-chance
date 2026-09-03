import { describe, expect, it } from "vitest";
import {
  buildShelterBuddyEpisodes,
  openEpisodesAt,
  shelterBuddyEpisodeId,
} from "@/lib/austin/build-episodes";
import { isAdoptionOutcome, normalizeSpecies, isCompanionSpecies } from "@/lib/austin/types";
import type { ShelterBuddyIntakeRow, ShelterBuddyOutcomeRow } from "@/lib/austin/schemas";

/**
 * The failures these tests exist to prevent are the ones the previous version
 * of this product actually shipped: animals shown as waiting after they had
 * been adopted, one animal rendered twice in the active list, and juvenile
 * animals silently dropped out of their own species.
 */

function intake(
  animalId: string,
  sourceDate: string,
  overrides: Partial<ShelterBuddyIntakeRow> = {},
): ShelterBuddyIntakeRow {
  return {
    id: `i-${animalId}-${sourceDate}`,
    animal_id: animalId,
    source_date: sourceDate,
    type: "Dog",
    date_of_birth: "2020-01-01T00:00:00.000",
    ...overrides,
  };
}

function outcome(
  animalId: string,
  intakeDate: string,
  outcomeDate: string,
  overrides: Partial<ShelterBuddyOutcomeRow> = {},
): ShelterBuddyOutcomeRow {
  return {
    id: `o-${animalId}-${outcomeDate}`,
    animal_id: animalId,
    intake_date: intakeDate,
    outcome_date: outcomeDate,
    outcome_status: "Adopted",
    type: "Dog",
    ...overrides,
  };
}

describe("species normalization", () => {
  it("folds juveniles into their species", () => {
    expect(normalizeSpecies("Kitten")).toBe("Cat");
    expect(normalizeSpecies("Puppy")).toBe("Dog");
    expect(normalizeSpecies("Cat")).toBe("Cat");
    expect(normalizeSpecies("dog")).toBe("Dog");
  });

  it("keeps wildlife and livestock out of the companion species", () => {
    for (const raw of ["Bat - Little Brown Myotis", "Mammal", "Reptile", "Goat", "Fowl"]) {
      expect(isCompanionSpecies(normalizeSpecies(raw))).toBe(false);
    }
    expect(normalizeSpecies(null)).toBe("Other");
  });
});

describe("adoption vocabulary", () => {
  it("recognises every adoption variant the feed uses", () => {
    for (const status of [
      "Adopted",
      "Adopted Altered",
      "Adopted Unaltered",
      "Adopted Offsite",
      "Adopted Offsite(Altered)",
      "Adopted Offsite(Unaltered)",
      "Adopted to Finder",
      "Adoption",
      "Rto-Adopt",
    ]) {
      expect(isAdoptionOutcome(status)).toBe(true);
    }
  });

  it("does not count a transfer or a euthanasia as an adoption", () => {
    for (const status of ["Transfer Out", "Euthanized", "Reclaimed", "DOA", "Return to Habitat"]) {
      expect(isAdoptionOutcome(status)).toBe(false);
    }
    expect(isAdoptionOutcome(null)).toBe(false);
  });
});

describe("episode construction", () => {
  it("closes an episode with the outcome that names its intake", () => {
    const result = buildShelterBuddyEpisodes(
      [intake("100", "2026-01-05T10:00:00.000")],
      [outcome("100", "2026-01-05T10:00:00.000", "2026-01-20T12:00:00.000")],
    );

    expect(result.episodes).toHaveLength(1);
    const [episode] = result.episodes;
    expect(episode.joinStatus).toBe("matched");
    expect(episode.joinConfidence).toBe("high");
    expect(episode.outcomeAt).toBe("2026-01-20T12:00:00.000");
    expect(episode.closedDaysInCare).toBeCloseTo(15.083, 2);
    expect(result.counts.orphanedOutcomes).toBe(0);
  });

  it("gives a repeat visitor one distinct episode per stay, never a cross product", () => {
    // This is the bug that put duplicate active rows on the old planner.
    const intakes = [
      intake("31410", "2026-08-11T12:09:00.000"),
      intake("31410", "2026-08-20T17:41:00.000"),
      intake("31410", "2026-09-01T11:13:00.000"),
    ];
    const outcomes = [
      outcome("31410", "2026-08-11T12:09:00.000", "2026-08-15T09:00:00.000"),
      outcome("31410", "2026-08-20T17:41:00.000", "2026-08-25T09:00:00.000"),
      outcome("31410", "2026-09-01T11:13:00.000", "2026-09-02T14:53:12.000"),
    ];

    const result = buildShelterBuddyEpisodes(intakes, outcomes);

    expect(result.episodes).toHaveLength(3);
    expect(new Set(result.episodes.map((e) => e.episodeId)).size).toBe(3);
    expect(result.episodes.every((e) => e.joinStatus === "matched")).toBe(true);

    // Each outcome closed the stay it named, not merely the earliest one.
    const byIntake = new Map(result.episodes.map((e) => [e.intakeAt, e.outcomeAt]));
    expect(byIntake.get("2026-08-11T12:09:00.000")).toBe("2026-08-15T09:00:00.000");
    expect(byIntake.get("2026-09-01T11:13:00.000")).toBe("2026-09-02T14:53:12.000");
  });

  it("never lets one outcome close two intakes", () => {
    const result = buildShelterBuddyEpisodes(
      [intake("200", "2026-02-01T09:00:00.000"), intake("200", "2026-03-01T09:00:00.000")],
      [outcome("200", "2026-02-01T09:00:00.000", "2026-02-10T09:00:00.000")],
    );

    const closed = result.episodes.filter((e) => e.outcomeAt !== null);
    expect(closed).toHaveLength(1);
    expect(closed[0].intakeAt).toBe("2026-02-01T09:00:00.000");

    const stillOpen = result.episodes.filter((e) => e.joinStatus === "open");
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0].intakeAt).toBe("2026-03-01T09:00:00.000");
  });

  it("counts an outcome whose intake predates the cutover as a pre-cutover orphan", () => {
    const result = buildShelterBuddyEpisodes(
      [],
      [outcome("300", "2025-03-14T09:00:00.000", "2025-06-01T09:00:00.000")],
    );

    expect(result.orphanOutcomes).toHaveLength(1);
    expect(result.orphanOutcomes[0].reason).toBe("pre_cutover_intake");
    expect(result.counts.orphanedOutcomes).toBe(1);
  });

  it("marks a tolerance match as ambiguous and low confidence", () => {
    const result = buildShelterBuddyEpisodes(
      [intake("400", "2026-04-01T09:00:00.000")],
      // The outcome names an intake two hours off from the one on record.
      [outcome("400", "2026-04-01T11:00:00.000", "2026-04-08T09:00:00.000")],
    );

    expect(result.counts.toleranceMatched).toBe(1);
    const [episode] = result.episodes;
    expect(episode.joinConfidence).toBe("low");
    expect(episode.joinStatus).toBe("ambiguous");
    expect(episode.dataQualityFlags).toContain("tolerance_matched");
  });

  it("counts a duplicate intake key instead of producing two episodes", () => {
    const result = buildShelterBuddyEpisodes(
      [intake("500", "2026-05-01T09:00:00.000"), intake("500", "2026-05-01T09:00:00.000")],
      [],
    );

    expect(result.episodes).toHaveLength(1);
    expect(result.counts.duplicateIntakeKeys).toBe(1);
  });

  it("records a stable episode id keyed on the stay, not the animal", () => {
    expect(shelterBuddyEpisodeId("31410", "2026-09-01T11:13:00.000")).toBe(
      "sb:31410:2026-09-01T11:13:00.000",
    );
  });
});

describe("open episodes at a moment", () => {
  const intakes = [
    intake("A", "2026-01-01T09:00:00.000"),
    intake("B", "2026-01-10T09:00:00.000"),
    intake("C", "2026-02-01T09:00:00.000"),
  ];
  const outcomes = [
    // A left before the snapshot; B leaves after it; C never leaves.
    outcome("A", "2026-01-01T09:00:00.000", "2026-01-15T09:00:00.000"),
    outcome("B", "2026-01-10T09:00:00.000", "2026-03-20T09:00:00.000"),
  ];

  it("excludes an animal whose outcome falls on or before the as-of time", () => {
    // The exact failure the March 2022 fixture shipped: three animals shown as
    // waiting when the official feed already recorded their adoption.
    const result = buildShelterBuddyEpisodes(intakes, outcomes);
    const open = openEpisodesAt(result.episodes, "2026-02-15T00:00:00.000");

    expect(open.map((e) => e.animalId).sort()).toEqual(["B", "C"]);
    expect(open.map((e) => e.animalId)).not.toContain("A");
  });

  it("excludes an animal that has not arrived yet", () => {
    const result = buildShelterBuddyEpisodes(intakes, outcomes);
    const open = openEpisodesAt(result.episodes, "2026-01-05T00:00:00.000");
    expect(open.map((e) => e.animalId)).toEqual(["A"]);
  });

  it("excludes ambiguous joins from the operational count", () => {
    const result = buildShelterBuddyEpisodes(
      [intake("600", "2026-04-01T09:00:00.000")],
      [outcome("600", "2026-04-01T11:00:00.000", "2026-04-08T09:00:00.000")],
    );
    expect(openEpisodesAt(result.episodes, "2026-04-05T00:00:00.000")).toHaveLength(0);
  });

  it("never returns an episode with an outcome at or before the snapshot", () => {
    const result = buildShelterBuddyEpisodes(intakes, outcomes);
    for (const asOf of ["2026-01-20T00:00:00.000", "2026-02-15T00:00:00.000", "2026-04-01T00:00:00.000"]) {
      for (const episode of openEpisodesAt(result.episodes, asOf)) {
        if (episode.outcomeAt) {
          expect(Date.parse(`${episode.outcomeAt}Z`)).toBeGreaterThan(Date.parse(`${asOf}Z`));
        }
      }
    }
  });
});
