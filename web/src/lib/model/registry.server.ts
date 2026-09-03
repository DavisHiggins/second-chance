import "server-only";

import { cache } from "react";
import rawArtifact from "@/data/model/model.json";
import type { ModelArtifact, ReadyModelArtifact, TargetName } from "./artifact";
import { hasCredibleTrainingDate, isReady } from "./artifact";
import type { ScoringStatus } from "@/lib/austin/status";
import type { Episode } from "@/lib/austin/types";
import {
  buildEpisodeContext,
  buildFeatureVector,
  deriveRow,
  scoreability,
  type EpisodeContext,
} from "./features";
import { predictCalibrated, UnsupportedModelError } from "./evaluator";

/**
 * Loads the committed model artifact and scores episodes against it.
 *
 * The gate below is the important part. An artifact is only used when it is
 * marked ready, carries both targets, and claims a training date that has
 * already happened. Anything else leaves scoring switched off and the product
 * shows a plain "model update in progress" state. A wrong number presented
 * confidently is worse than a missing one, and this is where that is enforced.
 */

export interface LoadedModel {
  version: string | null;
  trainedAt: string | null;
  scoringStatus: ScoringStatus;
  note: string | null;
  artifact: ReadyModelArtifact | null;
}

function evaluateArtifact(artifact: ModelArtifact): LoadedModel {
  if (!isReady(artifact)) {
    return {
      version: artifact.version,
      trainedAt: artifact.trainedAt,
      scoringStatus: artifact.status === "in_progress" ? "in_progress" : "unavailable",
      note: artifact.note,
      artifact: null,
    };
  }

  if (!hasCredibleTrainingDate(artifact)) {
    return {
      version: artifact.version,
      trainedAt: artifact.trainedAt,
      scoringStatus: "unavailable",
      note: "The published model reports a training date in the future, so its scores are not being shown.",
      artifact: null,
    };
  }

  const missing = (["long_stay_60d", "adopted_within_30d"] as TargetName[]).filter(
    (target) => !artifact.targets?.[target]?.booster,
  );
  if (missing.length > 0) {
    return {
      version: artifact.version,
      trainedAt: artifact.trainedAt,
      scoringStatus: "unavailable",
      note: `The published model is missing predictions for ${missing.join(" and ")}.`,
      artifact: null,
    };
  }

  return {
    version: artifact.version,
    trainedAt: artifact.trainedAt,
    scoringStatus: "live",
    note: artifact.note,
    artifact,
  };
}

export const loadScoringModel = cache(async (): Promise<LoadedModel> => {
  return evaluateArtifact(rawArtifact as unknown as ModelArtifact);
});

/* -------------------------------------------------------------------------- */

export interface EpisodeScore {
  episodeId: string;
  /** Null whenever the row could not be scored. Never a filler value. */
  pLongStay60d: number | null;
  pAdopt30d: number | null;
  /** Set when scoring was refused, and shown to the user as the reason. */
  unavailableReason: string | null;
}

export type RiskBand = "critical" | "serious" | "warning" | "ok";

/**
 * Risk bands from calibrated long-stay probability.
 *
 * The cut points are stated here rather than derived per page so the same
 * animal never lands in two different bands in two different views.
 */
export function riskBand(pLongStay: number | null): RiskBand | null {
  if (pLongStay === null) return null;
  if (pLongStay >= 0.6) return "critical";
  if (pLongStay >= 0.4) return "serious";
  if (pLongStay >= 0.25) return "warning";
  return "ok";
}

export interface ScoredEpisodes {
  scores: Map<string, EpisodeScore>;
  scoringStatus: ScoringStatus;
  /** Rows the model declined to score, by reason, for the data-quality panel. */
  unscored: { reason: string; count: number }[];
  /**
   * What the model relies on across the population, for the explanation panel.
   *
   * This lives on the result rather than on each score because it is the same
   * list for every animal: it is mean gain over the training set, not a
   * per-row attribution. Copying it onto a thousand stays inflated the queue
   * payload by roughly 800KB and quietly implied a per-animal explanation the
   * artifact does not contain.
   */
  drivers: { feature: string; gain: number }[];
}

/**
 * Scores a set of episodes.
 *
 * Context features are built from the full episode set, not just the rows
 * being scored, because how full the shelter was on the day an animal arrived
 * depends on every other stay, not on which rows a page happens to display.
 */
export function scoreEpisodes(
  model: LoadedModel,
  allEpisodes: Episode[],
  toScore: Episode[],
): ScoredEpisodes {
  const scores = new Map<string, EpisodeScore>();
  const unscoredCounts = new Map<string, number>();

  const noteUnscored = (reason: string) => {
    unscoredCounts.set(reason, (unscoredCounts.get(reason) ?? 0) + 1);
  };

  if (!model.artifact) {
    for (const episode of toScore) {
      scores.set(episode.episodeId, {
        episodeId: episode.episodeId,
        pLongStay60d: null,
        pAdopt30d: null,
        unavailableReason: model.note ?? "No validated model is currently scoring.",
      });
    }
    return {
      scores,
      scoringStatus: model.scoringStatus,
      unscored: [{ reason: model.note ?? "No validated model is currently scoring.", count: toScore.length }],
      drivers: [],
    };
  }

  const artifact = model.artifact;
  let context: EpisodeContext;
  try {
    context = buildEpisodeContext(allEpisodes);
  } catch {
    return {
      scores,
      scoringStatus: "unavailable",
      unscored: [{ reason: "Shelter context features could not be built.", count: toScore.length }],
      drivers: [],
    };
  }

  const longStay = artifact.targets.long_stay_60d;
  const adopt = artifact.targets.adopted_within_30d;
  const importance = longStay.featureImportance ?? [];

  for (const episode of toScore) {
    const eligibility = scoreability(episode);
    if (!eligibility.ok) {
      noteUnscored(eligibility.reason ?? "Row is out of the model's scope.");
      scores.set(episode.episodeId, {
        episodeId: episode.episodeId,
        pLongStay60d: null,
        pAdopt30d: null,
        unavailableReason: eligibility.reason,
      });
      continue;
    }

    try {
      const vector = buildFeatureVector(deriveRow(episode, context), artifact.features);
      const longStayResult = predictCalibrated(longStay.booster, longStay.calibration, vector);
      const adoptResult = predictCalibrated(adopt.booster, adopt.calibration, vector);

      scores.set(episode.episodeId, {
        episodeId: episode.episodeId,
        pLongStay60d: longStayResult.calibrated,
        pAdopt30d: adoptResult.calibrated,
        unavailableReason: null,
      });
    } catch (cause) {
      const reason =
        cause instanceof UnsupportedModelError
          ? "The published model uses a split type this runtime cannot evaluate."
          : "This record could not be transformed into the model's inputs.";
      noteUnscored(reason);
      scores.set(episode.episodeId, {
        episodeId: episode.episodeId,
        pLongStay60d: null,
        pAdopt30d: null,
        unavailableReason: reason,
      });
    }
  }

  return {
    scores,
    scoringStatus: model.scoringStatus,
    unscored: [...unscoredCounts.entries()].map(([reason, count]) => ({ reason, count })),
    drivers: importance.slice(0, 8),
  };
}
