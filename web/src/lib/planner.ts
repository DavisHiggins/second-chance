import { ADOPTION_HORIZON_DAYS } from "@/lib/model/horizon";
import { resolveChannel, suggestChannel } from "@/lib/interventions";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";
import type { PlanPick } from "@/lib/planPicks";

/**
 * Planner arithmetic and export, kept free of React so it can be tested.
 *
 * Three ideas are held apart throughout: the queue's ordering (from the
 * model or from wait), the written rule that pairs an animal with a
 * channel, and the planning assumption about what an action is worth. Each
 * row records which of them put it in the plan and which channel it has,
 * and the scenario arithmetic states its formula in words beside the
 * number.
 */

export interface PlanRow {
  stay: ScoredStay;
  channel: InterventionChannel;
  /** The rule's suggestion, even when a person overrode it. */
  suggestedChannel: string;
  reason: string;
  source: "manual" | "automatic";
}

export interface BuildPlanInput {
  stays: ScoredStay[];
  channels: InterventionChannel[];
  capacity: number;
  /** Channel names switched on this week. */
  selected: string[];
  picks: PlanPick[];
  /** Episode ids the person removed from the automatic fill. */
  removed: string[];
  /** Channel overrides for automatic rows, by episode id. */
  overrides: Record<string, string>;
}

/**
 * Builds the week's plan.
 *
 * Manual picks come first, in the order they were added, with whatever
 * channel the person chose (or the rule's suggestion). The remaining
 * capacity is filled automatically, one animal per selected channel in
 * rotation, in queue order within each channel. Taking the top of the
 * combined queue looks right and is not: the highest long-stay estimates in
 * Austin are overwhelmingly adult bully-breed dogs, so a straight top-20
 * becomes twenty animals in one channel and the foster coordinator and the
 * photographer are handed nothing.
 */
export function buildPlan(input: BuildPlanInput): PlanRow[] {
  const { stays, channels, capacity, selected, picks, removed, overrides } = input;
  const byId = new Map(stays.map((stay) => [stay.episodeId, stay]));
  const removedSet = new Set(removed);
  const rows: PlanRow[] = [];
  const taken = new Set<string>();

  for (const pick of picks) {
    const stay = byId.get(pick.episodeId);
    if (!stay || taken.has(stay.episodeId)) continue;
    const suggestion = suggestChannel(stay);
    const channel = resolveChannel(channels, pick.channel ?? suggestion.channel) ?? resolveChannel(channels, suggestion.channel);
    if (!channel) continue;
    rows.push({ stay, channel, suggestedChannel: suggestion.channel, reason: suggestion.reason, source: "manual" });
    taken.add(stay.episodeId);
  }

  const queues = new Map<string, { stay: ScoredStay; reason: string; suggested: string }[]>();
  for (const stay of stays) {
    if (taken.has(stay.episodeId) || removedSet.has(stay.episodeId)) continue;
    const suggestion = suggestChannel(stay);
    const name = overrides[stay.episodeId] ?? suggestion.channel;
    if (!selected.includes(name)) continue;
    const queue = queues.get(name);
    const entry = { stay, reason: suggestion.reason, suggested: suggestion.channel };
    if (queue) queue.push(entry);
    else queues.set(name, [entry]);
  }

  const rotation = [...queues.keys()];
  const cursor = new Map<string, number>();
  while (rows.length < capacity && rotation.length > 0) {
    for (let i = 0; i < rotation.length && rows.length < capacity; ) {
      const name = rotation[i];
      const queue = queues.get(name) ?? [];
      const at = cursor.get(name) ?? 0;
      if (at >= queue.length) {
        rotation.splice(i, 1);
        continue;
      }
      const entry = queue[at];
      const channel = resolveChannel(channels, name);
      cursor.set(name, at + 1);
      if (channel) {
        rows.push({
          stay: entry.stay,
          channel,
          suggestedChannel: entry.suggested,
          reason: entry.reason,
          source: "automatic",
        });
      }
      i += 1;
    }
  }

  return rows;
}

export interface ScenarioResult {
  /** Expected additional adoptions under the assumption. */
  additional: number;
  /** Rows whose 30-day window has already passed; their contribution is hypothetical. */
  hypotheticalRows: number;
  /** Rows whose baseline came from an intake-time estimate still inside its window. */
  modelBaselineRows: number;
  /** Rows with no baseline available; treated as zero baseline. */
  noBaselineRows: number;
}

/**
 * The planning estimate.
 *
 * `upliftPoints` is an absolute increase in each animal's probability of
 * adoption within 30 days, in percentage points (0.10 = 10 points). For each
 * row the contribution is min(uplift, 1 − baseline), so no animal can be
 * pushed past 100%. The baseline is the intake-time 30-day estimate only
 * while that window is still open; once it has passed the estimate is not a
 * next-month baseline, so the baseline is taken as zero and the row is
 * counted as hypothetical. Twenty animals at ten points is two additional
 * adoptions; that is a ten-percentage-point assumption, not a ten-percent
 * one.
 */
export function scenarioAdoptions(rows: readonly PlanRow[], upliftPoints: number): ScenarioResult {
  const uplift = Math.max(0, Math.min(1, upliftPoints));
  let additional = 0;
  let hypotheticalRows = 0;
  let modelBaselineRows = 0;
  let noBaselineRows = 0;

  for (const row of rows) {
    const windowOpen = row.stay.daysInCare <= ADOPTION_HORIZON_DAYS;
    let baseline = 0;
    if (windowOpen && row.stay.pAdopt30d !== null) {
      baseline = row.stay.pAdopt30d;
      modelBaselineRows += 1;
    } else if (!windowOpen) {
      hypotheticalRows += 1;
    } else {
      noBaselineRows += 1;
    }
    additional += Math.min(uplift, Math.max(0, 1 - baseline));
  }

  return { additional, hypotheticalRows, modelBaselineRows, noBaselineRows };
}

export function totalStaffMinutes(rows: readonly PlanRow[]): number {
  return rows.reduce((sum, row) => sum + row.channel.staff_minutes, 0);
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Escapes a CSV cell and neutralises spreadsheet formula injection.
 *
 * A name typed as "=HYPERLINK(...)" into a shelter system would otherwise
 * execute when the export is opened in Excel. Cells starting with =, +, −,
 * @, tab or carriage return are prefixed with a single quote, which Excel
 * and Sheets treat as "this is text".
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface CsvMeta {
  planDate: string;
  snapshotAt: string | null;
  publisherUpdatedAt: string | null;
  modelVersion: string | null;
  scoring: boolean;
  upliftPoints: number;
  capacity: number;
  scenario: ScenarioResult;
}

export const CSV_COLUMNS = [
  "animal_id",
  "episode_id",
  "name",
  "species",
  "breed",
  "days_in_care",
  "already_past_60_days",
  "p_long_stay_60d_at_intake",
  "p_adopt_30d_at_intake",
  "channel",
  "suggested_channel",
  "source",
  "evidence",
  "assumed_staff_minutes",
  "progress",
  "notes",
] as const;

/**
 * The export. Metadata lines come first as comments so a spreadsheet user
 * sees the snapshot, the plan date, the assumptions and the horizon before
 * the rows; the header row follows and the data is plain CSV after it.
 */
export function buildCsv(
  rows: readonly PlanRow[],
  meta: CsvMeta,
  progress: Record<string, string> = {},
): string {
  const preamble = [
    `# SecondChance outreach plan`,
    `# plan_date,${csvCell(meta.planDate)}`,
    `# source_snapshot,${csvCell(meta.snapshotAt ?? "")}`,
    `# publisher_last_updated,${csvCell(meta.publisherUpdatedAt ?? "")}`,
    `# model_version,${csvCell(meta.modelVersion ?? "none")}`,
    `# ordering,${meta.scoring ? "intake-time long-stay estimate" : "days waiting (descriptive)"}`,
    `# capacity,${meta.capacity}`,
    `# assumed_uplift_percentage_points,${(meta.upliftPoints * 100).toFixed(0)}`,
    `# estimate_horizon,adoption within 30 days of intake; rows past day 30 are hypothetical`,
    `# scenario_additional_adoptions,${meta.scenario.additional.toFixed(2)}`,
    `# scenario_hypothetical_rows,${meta.scenario.hypotheticalRows}`,
    `# note,Estimates were made at intake. Channel is a written rule or a staff choice. Not a measured effect.`,
  ];
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    [
      row.stay.animalId,
      row.stay.episodeId,
      row.stay.name ?? "Unnamed",
      row.stay.species,
      row.stay.breed ?? "",
      row.stay.daysInCare,
      row.stay.daysInCare > 60 ? "yes" : "no",
      // An unscored animal exports as empty, never as a zero.
      row.stay.pLongStay60d === null ? "" : row.stay.pLongStay60d.toFixed(4),
      row.stay.pAdopt30d === null ? "" : row.stay.pAdopt30d.toFixed(4),
      row.channel.channel,
      row.suggestedChannel,
      row.source,
      row.channel.evidence,
      row.channel.staff_minutes,
      progress[row.stay.episodeId] ?? "",
      "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [...preamble, header, ...lines].join("\r\n");
}
