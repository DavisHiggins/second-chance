import { describe, expect, it } from "vitest";
import { buildShelterBuddyEpisodes, openEpisodesAt } from "@/lib/austin/build-episodes";
import { parseRows, shelterBuddyIntakeRow, shelterBuddyOutcomeRow } from "@/lib/austin/schemas";
import { isCompanionSpecies } from "@/lib/austin/types";

async function soda(id: string, select: string): Promise<unknown[]> {
  const url = `https://data.austintexas.gov/resource/${id}.json?$select=${select}&$order=id&$limit=50000`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${id} -> ${res.status}`);
  return (await res.json()) as unknown[];
}

// Network-dependent. Opt in with AUSTIN_LIVE_TESTS=1 so a CI run without
// egress, or an Austin outage, cannot fail the suite for the wrong reason.
const live = process.env.AUSTIN_LIVE_TESTS === "1" ? describe : describe.skip;

live("live Austin feeds", () => {
  it("builds episodes that agree with an independent anti-join", async () => {
    const [rawIn, rawOut] = await Promise.all([
      soda("pyqf-r2dc", "id,animal_id,source_date,type,source_name,sex,ispreviouslyspayedneutered,primary_breed,primary_color,secondary_color,intake_health_condition,date_of_birth,name_at_intake,timestamp"),
      soda("gsvs-ypi7", "id,animal_id,intake_date,outcome_date,outcome_status,type,name,sex,spayed_neutered,primary_breed,primary_color,secondary_color,date_of_birth,days_in_shelter,timestamp"),
    ]);

    const ins = parseRows(shelterBuddyIntakeRow, rawIn);
    const outs = parseRows(shelterBuddyOutcomeRow, rawOut);

    // eslint-disable-next-line no-console
    console.log("rejected:", ins.rejected, outs.rejected, ins.sampleErrors, outs.sampleErrors);

    const result = buildShelterBuddyEpisodes(ins.rows, outs.rows, {
      rejectedIntakeRows: ins.rejected,
      rejectedOutcomeRows: outs.rejected,
    });

    const open = openEpisodesAt(result.episodes, new Date().toISOString());
    const companion = open.filter((e) => isCompanionSpecies(e.species));

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ...result.counts, openNow: open.length, companionOpen: companion.length }, null, 2));

    expect(ins.rejected).toBe(0);
    expect(outs.rejected).toBe(0);
    expect(result.counts.duplicateIntakeKeys).toBe(0);
    // Independent shell anti-join on 2026-09-02 gave 1224 open / 1043 orphans.
    expect(open.length).toBeGreaterThan(1100);
    expect(open.length).toBeLessThan(1400);
    expect(result.counts.orphanedOutcomes).toBeGreaterThan(900);
  }, 180_000);
});
