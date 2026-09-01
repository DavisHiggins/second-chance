import Link from "next/link";
import { getDashboard, lifeStageSegments } from "@/lib/dataSource";
import { DASHBOARD } from "@/lib/content";
import { formatCount } from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import UsePolicyBanner from "@/components/shell/UsePolicyBanner";
import Card from "@/components/ui/Card";
import CountUp from "@/components/dashboard/CountUp";
import PopulationDonut from "@/components/dashboard/PopulationDonut";
import StatTile from "@/components/dashboard/StatTile";
import ForecastChart from "@/components/dashboard/ForecastChart";
import SegmentBars from "@/components/dashboard/SegmentBars";
import ModelHealthPanel from "@/components/dashboard/ModelHealthPanel";

export default async function DashboardPage() {
  const data = await getDashboard();
  const { metadata } = data;

  return (
    <PageMotion className="space-y-6">
      <MotionChild index={0}>
        <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {DASHBOARD.title}
        </h1>
        <p className="t-body mt-2" style={{ color: "var(--ink-secondary)" }}>
          {`${formatCount(metadata.current_census)} animals in care. ${formatCount(
            metadata.needs_attention,
          )} the model expects to wait longest.`}
        </p>
      </MotionChild>

      <MotionChild index={1}>
        <UsePolicyBanner />
      </MotionChild>

      <MotionChild index={2}>
        <Card
          elevation={2}
          surface="raised"
          radius="xl"
          className="grid gap-8 lg:grid-cols-5"
          style={{ padding: "var(--space-6)" }}
        >
          <div className="lg:col-span-3">
            <p className="t-hero" style={{ color: "var(--ink-primary)" }}>
              <CountUp value={data.heroCount} id="dashboard-hero" />
            </p>
            <p className="t-subtitle mt-2" style={{ color: "var(--ink-secondary)" }}>
              {DASHBOARD.heroLabel}
            </p>
            <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
              {`out of ${formatCount(metadata.current_census)} currently in care, ranked by predicted 60-day stay risk`}
            </p>
            <Link
              href="/queue"
              className="t-small mt-5 inline-flex items-center rounded-[var(--radius-md)] px-4 py-2.5 font-medium"
              style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
            >
              {DASHBOARD.heroButton}
            </Link>
          </div>

          <div className="lg:col-span-2">
            <h2 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              {DASHBOARD.donutTitle}
            </h2>
            <div className="mt-4">
              <PopulationDonut
                bands={data.bands}
                total={data.totalInQueue}
                title={DASHBOARD.donutTitle}
              />
            </div>
          </div>
        </Card>
      </MotionChild>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.tiles.map((tile, index) => (
          <MotionChild key={tile.id} index={3 + index} className="h-full">
            <StatTile tile={tile} />
          </MotionChild>
        ))}
      </div>

      <MotionChild index={7}>
        <Card style={{ padding: "var(--card-padding)" }}>
          <ForecastChart forecast={data.forecast} dataAsOf={metadata.data_as_of} />
        </Card>
      </MotionChild>

      <div className="grid gap-4 lg:grid-cols-2">
        <MotionChild index={8} className="h-full">
          <Card className="h-full" style={{ padding: "var(--card-padding)" }}>
            <SegmentBars segments={lifeStageSegments(data.segments)} />
          </Card>
        </MotionChild>
        <MotionChild index={9} className="h-full">
          <Card className="h-full" style={{ padding: "var(--card-padding)" }}>
            <ModelHealthPanel rows={data.health} />
          </Card>
        </MotionChild>
      </div>
    </PageMotion>
  );
}
