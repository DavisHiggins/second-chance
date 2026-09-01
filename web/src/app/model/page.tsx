import { getModelSummary } from "@/lib/dataSource";
import { MODEL, USE_POLICY_FULL } from "@/lib/content";
import { formatCount, formatDate, formatMetric, formatPercent, NOT_MEASURED } from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import AucByTarget from "@/components/model/AucByTarget";
import CalibrationPlot from "@/components/model/CalibrationPlot";
import PrecisionAtK from "@/components/model/PrecisionAtK";
import SubgroupTable from "@/components/model/SubgroupTable";
import ShapImportance from "@/components/model/ShapImportance";
import MonthlyTimeline from "@/components/model/MonthlyTimeline";

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
        {heading}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Prose({ children }: { children: string }) {
  return (
    <p className="t-body max-w-prose" style={{ color: "var(--ink-secondary)" }}>
      {children}
    </p>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--card-padding)",
      }}
    >
      {children}
    </div>
  );
}

export default async function ModelPage() {
  const summary = await getModelSummary();

  const champion = summary.targets.adopted_within_30d?.models.lightgbm?.test_calibrated;
  const longStay = summary.targets.long_stay_60d?.models.lightgbm?.test_calibrated;
  const testRange = summary.block_date_ranges?.test;
  const drift = summary.drift as unknown as {
    baseline?: { roc_auc?: number };
    thresholds: Record<string, number>;
    known_shift_date: string;
  };

  const strip: Array<{ label: string; value: string; gloss: string }> = [
    {
      label: "Held-out AUC",
      value: champion?.roc_auc ? formatMetric(champion.roc_auc) : NOT_MEASURED,
      gloss: champion?.roc_auc_ci
        ? `Take two animals, one adopted within 30 days and one not. The model ranks them the right way round about ${formatPercent(
            champion.roc_auc ?? 0,
          )} of the time. Interval ${formatMetric(champion.roc_auc_ci[0])} to ${formatMetric(
            champion.roc_auc_ci[1],
          )}.`
        : "Ranking accuracy on animals the model never saw.",
    },
    {
      label: "Calibration error",
      value: champion?.ece ? formatMetric(champion.ece) : NOT_MEASURED,
      gloss:
        "Average distance between a predicted chance and what actually happened at that chance. Smaller means the number on screen means what it says.",
    },
    {
      label: "Episodes trained on",
      value: formatCount(summary.block_counts?.train),
      gloss: `Shelter stays used for training, out of ${formatCount(
        summary.cohort?.episodes_final,
      )} in the modelling cohort.`,
    },
    {
      label: "Evaluation period",
      value: testRange ? `${formatDate(testRange[0])} to ${formatDate(testRange[1])}` : NOT_MEASURED,
      gloss: `Held-out arrivals, ${formatCount(summary.block_counts?.test)} episodes, none seen in training.`,
    },
  ];

  return (
    <PageMotion className="space-y-10">
      <MotionChild index={0}>
        <h1 className="t-display max-w-3xl" style={{ color: "var(--ink-primary)" }}>
          {MODEL.title}
        </h1>
        <p className="t-small mt-2 font-mono" style={{ color: "var(--ink-muted)" }}>
          {`${summary.metadata.model_version} · trained ${formatDate(
            summary.metadata.model_trained_at,
          )} · data as of ${formatDate(summary.metadata.data_as_of)}`}
        </p>
      </MotionChild>

      <MotionChild index={1}>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {strip.map((item) => (
            <Panel key={item.label}>
              <dt className="t-overline" style={{ color: "var(--ink-muted)" }}>
                {item.label}
              </dt>
              <dd>
                <p className="t-title tabular mt-2" style={{ color: "var(--ink-primary)" }}>
                  {item.value}
                </p>
                <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
                  {item.gloss}
                </p>
              </dd>
            </Panel>
          ))}
        </dl>
      </MotionChild>

      <MotionChild index={2}>
        <Section id="what-it-does" heading={MODEL.section1Heading}>
          <Prose>{MODEL.section1Body}</Prose>
        </Section>
      </MotionChild>

      <MotionChild index={3}>
        <Section id="how-well" heading={MODEL.section2Heading}>
          <Prose>{MODEL.section2Body}</Prose>
          <Panel>
            <AucByTarget targets={summary.targets} />
          </Panel>
          <Panel>
            <CalibrationPlot deciles={summary.survival?.survival_calibration_by_decile ?? []} />
          </Panel>
          <Panel>
            <PrecisionAtK
              metrics={longStay}
              baseRate={summary.targets.long_stay_60d?.test_positive_rate ?? 0}
            />
          </Panel>
        </Section>
      </MotionChild>

      <MotionChild index={4}>
        <Section id="who-for" heading={MODEL.section3Heading}>
          {MODEL.section3Body.map((paragraph) => (
            <Prose key={paragraph.slice(0, 24)}>{paragraph}</Prose>
          ))}
          <Panel>
            <SubgroupTable
              rows={summary.subgroups?.adopted_within_30d ?? []}
              sample={`Performance by subgroup for the 30-day adoption target, held-out test block of ${formatCount(
                summary.block_counts?.test,
              )} episodes. A positive calibration gap means the model predicted more adoptions than happened; a negative gap means it predicted fewer. Rows past 0.04 in either direction are flagged.`}
            />
          </Panel>
        </Section>
      </MotionChild>

      <MotionChild index={5}>
        <Section id="keys-on" heading={MODEL.section4Heading}>
          <Prose>{MODEL.section4Body}</Prose>
          <Panel>
            <ShapImportance
              rows={summary.interpretability?.adopt_30d?.top_10_shap ?? []}
              target="30-day adoption"
            />
          </Panel>
          <Panel>
            <ShapImportance
              rows={summary.interpretability?.long_stay_60d?.top_10_shap ?? []}
              target="60-day long stay"
            />
          </Panel>
          <Panel>
            <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
              Age partial dependence
            </h3>
            <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              The age partial-dependence curve is not carried in this results file, so nothing is
              drawn for it here. The underlying shape is discussed above and the curve is in the
              project figures.
            </p>
          </Panel>
        </Section>
      </MotionChild>

      <MotionChild index={6}>
        <Section id="when-it-stops" heading={MODEL.section5Heading}>
          <Panel>
            <MonthlyTimeline
              rows={summary.monthly_performance ?? []}
              baselineAuc={drift.baseline?.roc_auc ?? null}
              thresholds={drift.thresholds ?? {}}
              shiftDate={drift.known_shift_date}
            />
          </Panel>
          {MODEL.section5Body.map((paragraph) => (
            <Prose key={paragraph.slice(0, 24)}>{paragraph}</Prose>
          ))}
        </Section>
      </MotionChild>

      <MotionChild index={7}>
        <Section id="must-not" heading={MODEL.section6Heading}>
          <div
            className="border"
            style={{
              background: "var(--surface-card)",
              borderColor: "var(--border-hairline)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--card-padding)",
            }}
          >
            <div className="max-w-prose space-y-4">
              {USE_POLICY_FULL.map((paragraph) => (
                <p key={paragraph.slice(0, 24)} className="t-body" style={{ color: "var(--ink-primary)" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </Section>
      </MotionChild>
    </PageMotion>
  );
}
