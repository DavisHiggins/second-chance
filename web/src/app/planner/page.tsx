import type { Metadata } from "next";
import {
  getInterventionChannels,
  getShelterView,
  hasLiveScoring,
  queueOrder,
} from "@/lib/shelter.server";
import { loadScoringModel } from "@/lib/model/registry.server";
import { PLANNER } from "@/lib/content";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import PlannerClient from "@/components/planner/PlannerClient";
import { DataUnavailable } from "@/components/shell/StateNotices";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: PLANNER.title,
  description:
    "Turn the current queue into a week of outreach work, with the staff time it costs and the evidence behind each channel.",
};

/** The queue depth the lift figure is reported at in the artifact. */
const LIFT_K = 50;

export default async function PlannerPage() {
  const [view, model] = await Promise.all([getShelterView(), loadScoringModel()]);

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  const scoring = hasLiveScoring(view);
  const ordered = queueOrder(view.stays, view.scoringStatus);

  // Read from the artifact, never typed in. When no validated model is loaded
  // there is no lift to report and the planner says so.
  const liftAtK = model.artifact?.targets.long_stay_60d.test.liftAt50 ?? null;

  return (
    <div className="space-y-6">
      <header className="no-print">
        <p className="t-overline" style={{ color: "var(--accent-strong)" }}>
          Outreach planner
        </p>
        <h1 className="t-display mt-2" style={{ color: "var(--ink-primary)" }}>
          {PLANNER.title}
        </h1>
        <p className="t-body mt-3 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
          {PLANNER.subtitle}
        </p>
      </header>

      <div className="no-print">
        <UsePolicyBanner />
      </div>

      <PlannerClient
        stays={ordered}
        channels={getInterventionChannels()}
        scoring={scoring}
        liftAtK={liftAtK}
        k={LIFT_K}
        status={view.status}
      />
    </div>
  );
}
