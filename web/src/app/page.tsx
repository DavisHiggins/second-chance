import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getShelterView, hasLiveScoring, needsAttentionNow } from "@/lib/shelter.server";
import { loadScoringModel } from "@/lib/model/registry.server";
import { DASHBOARD } from "@/lib/content";
import { formatCount, formatNumber, formatPercent } from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import Card from "@/components/ui/Card";
import StatTile, { type StatTileData } from "@/components/dashboard/StatTile";
import TrendChart from "@/components/dashboard/TrendChart";
import OutcomeMixChart from "@/components/dashboard/OutcomeMixChart";
import SegmentBars from "@/components/dashboard/SegmentBars";
import ModelHealthPanel, { type ModelHealthRow } from "@/components/dashboard/ModelHealthPanel";
import { DataUnavailable, ScoringNotice } from "@/components/shell/StateNotices";
import DashboardHero from "@/components/dashboard/DashboardHero";
import NeedsAttention from "@/components/dashboard/NeedsAttention";
import type { StatusTone } from "@/components/ui/Status";

/** Austin publishes hourly; there is nothing to gain from asking more often. */
export const revalidate = 3600;

function healthRows(
  test: { rocAuc: number | null; ece: number | null; brier: number | null },
  trainedAt: string | null,
  version: string | null,
): ModelHealthRow[] {
  const auc = test.rocAuc;
  const ece = test.ece;

  const tone = (value: number | null, good: number, warn: number, higherIsBetter: boolean): StatusTone => {
    if (value === null) return "warning";
    if (higherIsBetter) return value >= good ? "good" : value >= warn ? "warning" : "serious";
    return value <= good ? "good" : value <= warn ? "warning" : "serious";
  };

  return [
    {
      id: "discrimination",
      label: "Discrimination",
      display: auc === null ? "" : `AUC ${auc.toFixed(3)}`,
      tone: tone(auc, 0.7, 0.62, true),
      note: "How well the model ranks a long stay above a short one, on the held-out block.",
    },
    {
      id: "calibration",
      label: "Calibration error",
      display: ece === null ? "" : `ECE ${ece.toFixed(3)}`,
      tone: tone(ece, 0.04, 0.08, false),
      note: "How far a stated percentage sits from what actually happened. A model can rank well and still say the wrong number.",
    },
    {
      id: "version",
      label: "Model version",
      display: version ?? "",
      tone: "good",
      note: "Read from the published artifact, not from a constant in the interface.",
    },
    {
      id: "trained",
      label: "Trained",
      display: trainedAt ? trainedAt.slice(0, 10) : "",
      tone: "good",
      note: "The moment training actually ran against the current ShelterBuddy feeds.",
    },
  ];
}

export default async function DashboardPage() {
  const [view, model] = await Promise.all([getShelterView(), loadScoringModel()]);

  if (!view.status.retrievedAt || view.stays.length === 0) {
    return (
      <PageMotion className="space-y-6">
        <MotionChild index={0}>
          <DataUnavailable problem={view.status.problem} />
        </MotionChild>
      </PageMotion>
    );
  }

  const scoring = hasLiveScoring(view);
  const { metrics } = view;

  const adoptionsSpark = view.trends.slice(-12).map((m) => m.adoptions);
  const intakesSpark = view.trends.slice(-12).map((m) => m.intakes);
  const medianSpark = view.trends
    .slice(-12)
    .map((m) => m.medianDaysToAdoption)
    .filter((v): v is number => v !== null);

  const tiles: StatTileData[] = [
    {
      id: "in-care",
      label: DASHBOARD.tiles.census,
      display: formatCount(metrics.animalsInCare.value),
      countTo: metrics.animalsInCare.value,
      unit: "stays",
      spark: intakesSpark,
      sampleSize: null,
      footnote: "Inferred from open intake records. Not a roster of adoptable animals.",
    },
    {
      id: "median-days",
      label: DASHBOARD.tiles.medianDays,
      // The tile renders its own unit, so the value is the bare number here.
      display:
        metrics.medianDaysToAdoption.value === null
          ? null
          : formatNumber(metrics.medianDaysToAdoption.value, 0),
      unit: "days",
      spark: medianSpark,
      sampleSize: metrics.medianDaysToAdoption.n,
      footnote: "Adoptions only. Transfers and returns to owner are excluded.",
    },
    {
      id: "adopted-30",
      label: DASHBOARD.tiles.adoptionRate,
      display:
        metrics.adoptedWithin30d.value === null ? null : formatPercent(metrics.adoptedWithin30d.value),
      unit: "of arrivals",
      spark: adoptionsSpark,
      sampleSize: metrics.adoptedWithin30d.n,
      footnote: "Stays too recent to have had a full 30 days are excluded, not counted as failures.",
    },
    {
      id: "long-stay",
      label: DASHBOARD.tiles.longStay,
      display:
        metrics.observedLongStay.value === null ? null : formatPercent(metrics.observedLongStay.value),
      unit: "of completed stays",
      spark: [],
      sampleSize: metrics.observedLongStay.n,
      footnote: "What was observed, not what the model predicts.",
    },
  ];

  const attention = needsAttentionNow(view, 5);

  return (
    <PageMotion className="space-y-8">
      <MotionChild index={0}>
        <DashboardHero
          openStays={metrics.animalsInCare.value}
          mode={view.status.mode}
          updatedAt={view.status.intakesUpdatedAt}
        />
      </MotionChild>

      <MotionChild index={1}>
        <UsePolicyBanner />
      </MotionChild>

      {!scoring ? (
        <MotionChild index={2}>
          <ScoringNotice note={model.note} />
        </MotionChild>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile, index) => (
          <MotionChild key={tile.id} index={3 + index} className="h-full">
            <StatTile tile={tile} />
          </MotionChild>
        ))}
      </div>

      {scoring && attention.length > 0 ? (
        <MotionChild index={7}>
          <NeedsAttention stays={attention} />
        </MotionChild>
      ) : null}

      <MotionChild index={8}>
        <Card style={{ padding: "var(--card-padding)" }}>
          <TrendChart months={view.trends} />
        </Card>
      </MotionChild>

      <div className="grid gap-4 lg:grid-cols-2">
        <MotionChild index={9} className="h-full">
          <Card className="h-full" style={{ padding: "var(--card-padding)" }}>
            <SegmentBars segments={view.segments} />
          </Card>
        </MotionChild>
        <MotionChild index={10} className="h-full">
          <Card className="h-full" style={{ padding: "var(--card-padding)" }}>
            <OutcomeMixChart mix={metrics.outcomes.value} total={metrics.outcomes.n} />
          </Card>
        </MotionChild>
      </div>

      <MotionChild index={11}>
        <Card style={{ padding: "var(--card-padding)" }}>
          <ModelHealthPanel
            rows={
              model.artifact
                ? healthRows(
                    model.artifact.targets.long_stay_60d.test,
                    model.trainedAt,
                    model.version,
                  )
                : []
            }
            scoringStatus={view.scoringStatus}
          />
        </Card>
      </MotionChild>

      <MotionChild index={12}>
        <p className="t-small" style={{ color: "var(--ink-muted)" }}>
          {DASHBOARD.openStaysNote}{" "}
          <Link href="/impact" className="underline underline-offset-2" style={{ color: "var(--accent-strong)" }}>
            Why this distinction matters
          </Link>
          <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" className="ml-1 inline" />
        </p>
      </MotionChild>
    </PageMotion>
  );
}
