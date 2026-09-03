import type { Metadata } from "next";
import {
  getInterventionChannels,
  getShelterView,
  hasLiveScoring,
  queueOrder,
} from "@/lib/shelter.server";
import { loadScoringModel } from "@/lib/model/registry.server";
import { QUEUE } from "@/lib/content";
import { formatCount } from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import QueueClient from "@/components/queue/QueueClient";
import { DataUnavailable, ScoringNotice } from "@/components/shell/StateNotices";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Needs attention",
  description:
    "Open shelter stays ranked by estimated long-stay risk, so staff attention goes where it may change an outcome.",
};

export default async function QueuePage() {
  const [view, model] = await Promise.all([getShelterView(), loadScoringModel()]);

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  const scoring = hasLiveScoring(view);
  const ordered = queueOrder(view.stays, view.scoringStatus);
  const channels = getInterventionChannels();

  return (
    <PageMotion className="space-y-6">
      <MotionChild index={0}>
        <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {QUEUE.title}
        </h1>
        <p className="t-body mt-2 max-w-[70ch]" style={{ color: "var(--ink-secondary)" }}>
          {scoring ? QUEUE.subtitleScored : QUEUE.subtitleDescriptive}
        </p>
        <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
          {`${formatCount(ordered.length)} open stays.`}
        </p>
      </MotionChild>

      <MotionChild index={1}>
        <UsePolicyBanner />
      </MotionChild>

      {!scoring ? (
        <MotionChild index={2}>
          <ScoringNotice note={model.note} />
        </MotionChild>
      ) : null}

      <MotionChild index={3}>
        <QueueClient stays={ordered} scoring={scoring} channels={channels} />
      </MotionChild>
    </PageMotion>
  );
}
