import type { Metadata } from "next";
import {
  getInterventionChannels,
  getShelterView,
  hasLiveScoring,
  queueOrder,
} from "@/lib/shelter.server";
import { loadScoringModel } from "@/lib/model/registry.server";
import { PLANNER } from "@/lib/content";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import PlannerClient from "@/components/planner/PlannerClient";
import { DataUnavailable } from "@/components/shell/StateNotices";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Outreach plan",
  description:
    "Turn the current queue into a week of outreach work, with the staff time it costs and the evidence behind each channel.",
};

/** The queue depth the measured lift figure is reported at in the artifact. */
const LIFT_K = 50;

export default async function PlannerPage() {
  const [view, model] = await Promise.all([getShelterView(), loadScoringModel()]);

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  const scoring = hasLiveScoring(view);
  const ordered = queueOrder(view.stays, view.scoringStatus);

  // Read from the artifact, never typed in. When no validated model is loaded
  // there is no measured lift to report and the planner says so.
  const liftAtK = model.artifact?.targets.long_stay_60d.test.liftAt50 ?? null;

  return (
    <PageMotion className="space-y-6">
      <MotionChild index={0}>
        <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {PLANNER.title}
        </h1>
        <p className="t-body mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
          {PLANNER.subtitle}
        </p>
      </MotionChild>

      <MotionChild index={1}>
        <UsePolicyBanner />
      </MotionChild>

      <MotionChild index={2}>
        <PlannerClient
          stays={ordered}
          channels={getInterventionChannels()}
          scoring={scoring}
          liftAtK={liftAtK}
          k={LIFT_K}
        />
      </MotionChild>
    </PageMotion>
  );
}
