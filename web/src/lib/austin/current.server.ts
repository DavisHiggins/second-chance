import "server-only";

import { cache } from "react";
import {
  CURRENT_INTAKES,
  CURRENT_INTAKE_COLUMNS,
  CURRENT_OUTCOMES,
  CURRENT_OUTCOME_COLUMNS,
} from "./datasets";
import { fetchDataset, SocrataError } from "./client.server";
import { parseRows, shelterBuddyIntakeRow, shelterBuddyOutcomeRow } from "./schemas";
import { buildShelterBuddyEpisodes } from "./build-episodes";
import { buildCurrentInventory, type CurrentInventory } from "./current-inventory";
import type { Episode } from "./types";
import { buildDataStatus, type DataStatus } from "./status";
import { logEvent, logFailure } from "@/lib/observability.server";
import { loadScoringModel } from "@/lib/model/registry.server";

/**
 * The single entry point for current shelter data.
 *
 * Order matters here and is the whole point of the module: fetch, validate,
 * join, then derive. Nothing downstream is allowed to see a raw source row, so
 * there is no path by which an un-normalized field, or a found address, can
 * reach a page. If any step fails the result carries an unavailable status
 * rather than substituting stored data.
 */

export interface CurrentShelterData {
  status: DataStatus;
  inventory: CurrentInventory | null;
  /** Every episode, open and closed, for the metrics layer. */
  episodes: Episode[];
}

function latestTimestamp(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

async function loadCurrentShelterData(): Promise<CurrentShelterData> {
  const model = await loadScoringModel();

  try {
    const [intakeResult, outcomeResult] = await Promise.all([
      fetchDataset(CURRENT_INTAKES, CURRENT_INTAKE_COLUMNS),
      fetchDataset(CURRENT_OUTCOMES, CURRENT_OUTCOME_COLUMNS),
    ]);

    const intakes = parseRows(shelterBuddyIntakeRow, intakeResult.rows);
    const outcomes = parseRows(shelterBuddyOutcomeRow, outcomeResult.rows);

    const build = buildShelterBuddyEpisodes(intakes.rows, outcomes.rows, {
      rejectedIntakeRows: intakes.rejected,
      rejectedOutcomeRows: outcomes.rejected,
    });

    // The feed's own `timestamp` column is when Austin last wrote the row, and
    // is the honest answer to "how current is this", rather than when we asked.
    const intakesUpdatedAt = latestTimestamp(intakes.rows.map((row) => row.timestamp));
    const outcomesUpdatedAt = latestTimestamp(outcomes.rows.map((row) => row.timestamp));

    const inventory = buildCurrentInventory(build, new Date().toISOString());

    // The join is where this product previously went wrong: the old fixture
    // reported 250 current animals of whom 218 had already gone home. These
    // counts are the evidence that the join is behaving, and they are logged
    // as well as shown, so a regression is visible without opening the site.
    logEvent("austin.episodes.built", {
      intakeRows: intakes.rows.length,
      outcomeRows: outcomes.rows.length,
      rejectedIntakeRows: intakes.rejected,
      rejectedOutcomeRows: outcomes.rejected,
      episodes: build.counts.episodes,
      matched: build.counts.matched,
      open: build.counts.open,
      ambiguous: build.counts.ambiguous,
      orphanedOutcomes: build.counts.orphanedOutcomes,
      duplicateIntakeKeys: build.counts.duplicateIntakeKeys,
      companionOpen: inventory.quality.companionEpisodeCount,
      nonCompanionOpen: inventory.nonCompanionOpen,
      staleOpen: inventory.quality.staleOpenEpisodeCount,
      intakesUpdatedAt,
      outcomesUpdatedAt,
      retrievedAt: intakeResult.retrievedAt,
      asOf: inventory.asOf,
      scoringStatus: model.scoringStatus,
    });

    const status = buildDataStatus({
      intakesUpdatedAt,
      outcomesUpdatedAt,
      retrievedAt: intakeResult.retrievedAt,
      intakeRowsRetrieved: intakes.rows.length,
      outcomeRowsRetrieved: outcomes.rows.length,
      quality: inventory.quality,
      model: {
        version: model.version,
        trainedAt: model.trainedAt,
        scoringStatus: model.scoringStatus,
        note: model.note,
      },
    });

    return { status, inventory, episodes: build.episodes };
  } catch (cause) {
    const detail =
      cause instanceof SocrataError
        ? `The City of Austin feed ${cause.datasetId} could not be read${
            cause.status ? ` (HTTP ${cause.status})` : ""
          }.`
        : "The City of Austin open data feed could not be reached.";

    logFailure("austin.current.unavailable", { detail }, cause);

    const status = buildDataStatus({
      intakesUpdatedAt: null,
      outcomesUpdatedAt: null,
      retrievedAt: null,
      intakeRowsRetrieved: null,
      outcomeRowsRetrieved: null,
      quality: null,
      model: {
        version: model.version,
        trainedAt: model.trainedAt,
        scoringStatus: model.scoringStatus,
        note: model.note,
      },
      failure: detail,
    });

    return { status, inventory: null, episodes: [] };
  }
}

/**
 * Per-request memoisation on top of the hourly data cache.
 *
 * A single page render asks for this from the layout, the header and two or
 * three sections. `cache` collapses those into one call without changing how
 * often Austin is actually contacted.
 */
export const getCurrentShelterData = cache(loadCurrentShelterData);
