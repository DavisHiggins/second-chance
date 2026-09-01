import { Suspense } from "react";
import { getInterventions, getQueue } from "@/lib/dataSource";
import { QUEUE } from "@/lib/content";
import { formatCount } from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import QueueClient from "@/components/queue/QueueClient";
import QueueSkeleton from "@/components/queue/QueueSkeleton";

export default async function QueuePage() {
  const [queue, interventions] = await Promise.all([getQueue(), getInterventions()]);

  return (
    <PageMotion className="space-y-6">
      <MotionChild index={0}>
        <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {QUEUE.title}
        </h1>
        <p className="t-body mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
          {`${formatCount(
            queue.total_available,
          )} animals ranked by how likely the model thinks they are to still be here in 60 days. Work from the top.`}
        </p>
      </MotionChild>

      <MotionChild index={1}>
        <UsePolicyBanner />
      </MotionChild>

      <MotionChild index={2}>
        <Suspense fallback={<QueueSkeleton />}>
          <QueueClient animals={queue.animals} channels={interventions.channels} />
        </Suspense>
      </MotionChild>
    </PageMotion>
  );
}
