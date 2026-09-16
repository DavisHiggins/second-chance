import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getShelterView, hasLiveScoring, needsAttentionNow } from "@/lib/shelter.server";
import { loadScoringModel } from "@/lib/model/registry.server";
import { DASHBOARD } from "@/lib/content";
import { formatCount, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import Card from "@/components/ui/Card";
import { type StatTileData } from "@/components/dashboard/StatTile";
import StatTileGrid from "@/components/dashboard/StatTileGrid";
import TrendChart from "@/components/dashboard/TrendChart";
import OutcomeMixChart from "@/components/dashboard/OutcomeMixChart";
import SegmentBars from "@/components/dashboard/SegmentBars";
import ModelHealthPanel, { type ModelHealthRow } from "@/components/dashboard/ModelHealthPanel";
import { DataUnavailable, ScoringNotice } from "@/components/shell/StateNotices";
import DashboardHero from "@/components/dashboard/DashboardHero";
import ContextStrip from "@/components/dashboard/ContextStrip";
import NeedsAttention from "@/components/dashboard/NeedsAttention";
import AnimatedDivider from "@/components/motion/AnimatedDivider";
import RevealSection, { RevealItem } from "@/components/motion/RevealSection";
import type { StatusTone } from "@/components/ui/Status";

export const revalidate = 1800;

// The root page shares the root layout's segment, so the layout's title
// template does not apply to it; the suffix is written out here.
export const metadata: Metadata = {
  title: { absolute: `${DASHBOARD.pageTitle} · SecondChance` },
};

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
      label: "Discrimination (ROC AUC)",
      display: auc === null ? "" : auc.toFixed(3),
      tone: tone(auc, 0.7, 0.62, true),
      note: "How often the model ranks a long stay above a short one, on the held-out block. 0.5 is chance.",
    },
    {
      id: "calibration",
      label: "Calibration error (ECE)",
      display: ece === null ? "" : ece.toFixed(3),
      tone: tone(ece, 0.04, 0.08, false),
      note: "Average gap between stated and observed rates, in probability points. A model can rank well and still say the wrong number.",
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
      note: "The moment training ran against the current ShelterBuddy feeds. It changes only after a documented retrain.",
    },
  ];
}

export default async function DashboardPage() {
  const [view, model] = await Promise.all([getShelterView(), loadScoringModel()]);

  if (!view.status.retrievedAt || view.stays.length === 0) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  const scoring = hasLiveScoring(view);
  const { metrics } = view;

  const recent = view.trends.slice(-12);
  const intakesSpark = recent.map((m) => ({ label: formatMonth(m.month), value: m.intakes, partial: m.partial }));
  const medianSpark = recent
    .filter((m) => m.medianDaysToAdoption !== null)
    .map((m) => ({ label: formatMonth(m.month), value: m.medianDaysToAdoption as number, partial: m.partial }));
  // Only months whose arrivals have had a full 30 days contribute a rate, so
  // the spark is comparable with the tile: same unit, same eligibility rule.
  const rateSpark = recent
    .filter((m) => m.adoptedWithin30dRate !== null)
    .map((m) => ({ label: formatMonth(m.month), value: (m.adoptedWithin30dRate as number) * 100 }));

  const tiles: StatTileData[] = [
    {
      id: "in-care",
      metricId: "open-stays",
      label: DASHBOARD.tiles.census,
      display: formatCount(metrics.animalsInCare.value),
      countTo: metrics.animalsInCare.value,
      unit: "stays",
      spark: intakesSpark,
      sparkLabel: "Monthly intakes, last 12 months",
      sampleLine: null,
      footnote: "Open intake records at the snapshot. Not a roster of adoptable animals.",
    },
    {
      id: "median-days",
      metricId: "median-days-to-adoption",
      label: DASHBOARD.tiles.medianDays,
      display:
        metrics.medianDaysToAdoption.value === null ? null : formatNumber(metrics.medianDaysToAdoption.value, 0),
      unit: "days",
      spark: medianSpark,
      sparkLabel: "Monthly median, by adoption month",
      sampleLine: `Based on ${formatCount(metrics.medianDaysToAdoption.n)} adoptions`,
      footnote: "Adopted animals only, stays begun in the last twelve months.",
    },
    {
      id: "adopted-30",
      metricId: "adopted-within-30d",
      label: DASHBOARD.tiles.adoptionRate,
      display: metrics.adoptedWithin30d.value === null ? null : formatPercent(metrics.adoptedWithin30d.value),
      unit: "of eligible arrivals",
      spark: rateSpark,
      sparkLabel: "Monthly rate (%), by arrival month",
      sampleLine: `Based on ${formatCount(metrics.adoptedWithin30d.n)} arrivals`,
      footnote: "Arrivals too recent for a full 30 days are excluded, not counted as failures.",
    },
    {
      id: "long-stay",
      metricId: "long-stay-observed",
      label: DASHBOARD.tiles.longStay,
      display: metrics.observedLongStay.value === null ? null : formatPercent(metrics.observedLongStay.value),
      unit: "of completed stays",
      spark: [],
      sparkLabel: null,
      sampleLine: `Based on ${formatCount(metrics.observedLongStay.n)} completed stays`,
      footnote: "What was observed in completed history, not what the model predicts.",
    },
  ];

  const attention = needsAttentionNow(view, 5);

  return (
    <div className="space-y-8">
      <DashboardHero openStays={metrics.animalsInCare.value} mode={view.status.mode} />

      <ContextStrip status={view.status} window={view.window} />

      <UsePolicyBanner />

      {!scoring ? <ScoringNotice note={model.note} /> : null}

      <AnimatedDivider number="01" label={DASHBOARD.sections.overview} id="overview" />

      <StatTileGrid tiles={tiles} />

      {scoring && attention.length > 0 ? (
        <>
          <AnimatedDivider number="02" label={DASHBOARD.sections.attention} id="attention" />
          <RevealSection as="div">
            <RevealItem>
              <NeedsAttention stays={attention} />
            </RevealItem>
          </RevealSection>
        </>
      ) : null}

      <AnimatedDivider number={scoring && attention.length > 0 ? "03" : "02"} label={DASHBOARD.sections.trends} id="trends" />

      <RevealSection as="div" className="space-y-4">
        <RevealItem>
          <Card style={{ padding: "var(--card-padding)" }}>
            <TrendChart months={view.trends} />
          </Card>
        </RevealItem>
        <div className="grid gap-4 lg:grid-cols-2">
          <RevealItem index={1} className="h-full">
            <Card className="h-full" style={{ padding: "var(--card-padding)" }}>
              <SegmentBars segments={view.segments} />
            </Card>
          </RevealItem>
          <RevealItem index={2} className="h-full">
            <Card className="h-full" style={{ padding: "var(--card-padding)" }}>
              <OutcomeMixChart mix={metrics.outcomes.value} total={metrics.outcomes.n} />
            </Card>
          </RevealItem>
        </div>
      </RevealSection>

      <AnimatedDivider number={scoring && attention.length > 0 ? "04" : "03"} label={DASHBOARD.sections.model} id="model-context" />

      <RevealSection as="div">
        <RevealItem>
          <Card style={{ padding: "var(--card-padding)" }}>
            <ModelHealthPanel
              rows={
                model.artifact
                  ? healthRows(model.artifact.targets.long_stay_60d.test, model.trainedAt, model.version)
                  : []
              }
              scoringStatus={view.scoringStatus}
              summary={DASHBOARD.healthSummary}
            />
          </Card>
        </RevealItem>
      </RevealSection>

      <AnimatedDivider number={scoring && attention.length > 0 ? "05" : "04"} label={DASHBOARD.sections.workflow} id="workflow" />

      <RevealSection as="div">
        <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
          {DASHBOARD.workflowTitle}
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {DASHBOARD.workflowSteps.map((step, index) => (
            <RevealItem key={step.title} as="li" index={index} className="h-full">
              <Card className="h-full" style={{ padding: "var(--space-5)" }}>
                <p className="t-caption tabular" style={{ color: "var(--accent-strong)" }}>
                  {`Step ${index + 1}`}
                </p>
                <h3 className="t-subtitle mt-1" style={{ color: "var(--ink-primary)" }}>
                  {step.title}
                </h3>
                <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
                  {step.body}
                </p>
                {step.href === "/" ? (
                  <p className="t-small mt-3" style={{ color: "var(--ink-muted)" }}>
                    {step.cta}
                  </p>
                ) : (
                  <Link href={step.href} className="t-small link-reveal mt-3 inline-flex items-center gap-1">
                    {step.cta}
                    <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                )}
              </Card>
            </RevealItem>
          ))}
        </ol>
        <p className="t-small mt-6" style={{ color: "var(--ink-muted)" }}>
          {DASHBOARD.openStaysNote}{" "}
          <Link href="/impact" className="link-reveal">
            Why this distinction matters
          </Link>
        </p>
      </RevealSection>
    </div>
  );
}
