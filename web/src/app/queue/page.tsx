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
import { TRIAGE_DEFINITION } from "@/lib/model/horizon";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import QueueClient from "@/components/queue/QueueClient";
import { DataUnavailable, ScoringNotice } from "@/components/shell/StateNotices";
import Disclosure from "@/components/ui/Disclosure";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Animals that may need extra support",
  description:
    "Open shelter stays with intake-time long-stay estimates beside actual waiting times, so staff attention goes where it may change an outcome.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;

function toQuery(search: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params.toString();
}

export default async function QueuePage({ searchParams }: { searchParams: Search }) {
  const [view, model, search] = await Promise.all([getShelterView(), loadScoringModel(), searchParams]);

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  const scoring = hasLiveScoring(view);
  const ordered = queueOrder(view.stays, view.scoringStatus);
  const channels = getInterventionChannels();

  return (
    <div className="space-y-6">
      <header>
        <p className="t-overline" style={{ color: "var(--accent-strong)" }}>
          Needs attention
        </p>
        <h1 className="t-display mt-2" style={{ color: "var(--ink-primary)" }}>
          {QUEUE.title}
        </h1>
        <p className="t-body mt-3 max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
          {scoring ? QUEUE.subtitleScored : QUEUE.subtitleDescriptive}
        </p>
        <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
          {`${formatCount(ordered.length)} open stays as of the current snapshot.`}
        </p>
        {scoring ? (
          <Disclosure summary="How the estimate bands work" className="mt-2">
            <p className="t-small max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
              {TRIAGE_DEFINITION}
            </p>
          </Disclosure>
        ) : null}
      </header>

      <UsePolicyBanner />

      {!scoring ? <ScoringNotice note={model.note} /> : null}

      <QueueClient
        stays={ordered}
        scoring={scoring}
        channels={channels}
        drivers={view.modelDrivers}
        initialQuery={toQuery(search)}
      />
    </div>
  );
}
