import { getInterventions, getModelSummary, getQueue } from "@/lib/dataSource";
import { PLANNER } from "@/lib/content";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import PlannerClient from "@/components/planner/PlannerClient";

export default async function PlannerPage() {
  const [queue, interventions, summary] = await Promise.all([
    getQueue(),
    getInterventions(),
    getModelSummary(),
  ]);

  // The measured lift is read from the results file, never hardcoded.
  const headlineLift = summary.headline.long_stay_lift_at_50;
  const liftAtK = typeof headlineLift === "number" ? headlineLift : null;

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
          animals={queue.animals}
          channels={interventions.channels}
          liftAtK={liftAtK}
          k={50}
        />
      </MotionChild>
    </PageMotion>
  );
}
