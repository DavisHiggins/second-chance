import type { Metadata } from "next";
import { getShelterView } from "@/lib/shelter.server";
import { loadScoringModel } from "@/lib/model/registry.server";
import { MODEL, USE_POLICY_FULL } from "@/lib/content";
import {
  formatCount,
  formatDate,
  formatInstant,
  formatMetric,
  formatMultiplier,
  formatPercent,
  NOT_MEASURED,
} from "@/lib/format";
import { allMetrics, QUALITY_LABELS } from "@/lib/metrics/registry";
import { ALL_DATASETS } from "@/lib/austin/datasets";
import Card from "@/components/ui/Card";
import Disclosure from "@/components/ui/Disclosure";
import DriverBars from "@/components/charts/DriverBars";
import SubgroupTable from "@/components/model/SubgroupTable";
import TargetMetrics from "@/components/model/TargetMetrics";
import SectionNav from "@/components/model/SectionNav";
import AnimatedDivider from "@/components/motion/AnimatedDivider";
import RevealSection from "@/components/motion/RevealSection";
import { ScoringNotice } from "@/components/shell/StateNotices";
import DataDetailsTrigger from "@/components/shell/DataDetailsTrigger";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: MODEL.title,
  description:
    "What SecondChance reads, what it calculates, what the model estimates, how it was tested, who it works for, and what it must never be used to decide.",
};

const SECTIONS = [
  { id: "data", label: MODEL.sections.data },
  { id: "metrics", label: MODEL.sections.metrics },
  { id: "predictions", label: MODEL.sections.predictions },
  { id: "testing", label: MODEL.sections.testing },
  { id: "subgroups", label: MODEL.sections.subgroups },
  { id: "limitations", label: MODEL.sections.limitations },
  { id: "lineage", label: MODEL.sections.lineage },
];

function Prose({ children }: { children: string }) {
  return (
    <p className="t-body max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
      {children}
    </p>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <Card style={{ padding: "var(--card-padding)" }}>{children}</Card>;
}

/** A definition row in the lineage panel. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
      style={{ borderColor: "var(--border-hairline)" }}
    >
      <dt className="t-small" style={{ color: "var(--ink-muted)" }}>
        {label}
      </dt>
      <dd className="t-small tabular text-right" style={{ color: "var(--ink-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

function Section({
  id,
  number,
  heading,
  children,
}: {
  id: string;
  number: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <RevealSection id={id} className="scroll-mt-28 space-y-5" aria-labelledby={`${id}-heading`}>
      <AnimatedDivider number={number} label={heading} />
      <h2 id={`${id}-heading`} className="sr-only">
        {heading}
      </h2>
      {children}
    </RevealSection>
  );
}

/**
 * How it works.
 *
 * Plain language first: what the site reads, what it calculates, what the
 * model estimates, what staff should do with it. Then the deeper sections in
 * order, each anchored, with a table of contents. Everything numeric comes
 * from the published artifact; there is exactly one source for those values,
 * and if it is missing the page says so instead of filling the space.
 */
export default async function ModelPage() {
  const [model, view] = await Promise.all([loadScoringModel(), getShelterView()]);
  const artifact = model.artifact;

  const longStay = artifact?.targets.long_stay_60d;
  const adopt = artifact?.targets.adopted_within_30d;
  const window = artifact?.trainingWindow;
  const provenance = artifact?.provenance;

  const strip: Array<{ label: string; value: string; gloss: string }> = [
    {
      label: "Discrimination",
      value: longStay?.test.rocAuc ? formatMetric(longStay.test.rocAuc) : NOT_MEASURED,
      gloss:
        "Take two stays, one that ran past 60 days and one that did not. This is how often the model ranks them the right way round on data it never saw. 0.5 is chance.",
    },
    {
      label: "Calibration error",
      value: longStay?.test.ece ? formatMetric(longStay.test.ece) : NOT_MEASURED,
      gloss:
        "Average distance, in probability points, between a stated chance and what happened at that chance. Smaller means the percentage on screen means what it says.",
    },
    {
      label: "Lift in the top 50",
      value: longStay?.test.liftAt50 ? formatMultiplier(longStay.test.liftAt50, 2) : NOT_MEASURED,
      gloss:
        "In the test block, the 50 highest-ranked stays contained long stays at this multiple of the base rate. Retrospective concentration, not an effect of using the tool.",
    },
    {
      label: "Evaluation period",
      value: window ? `${formatDate(window.testStart)} to ${formatDate(window.testEnd)}` : NOT_MEASURED,
      gloss: window
        ? `Held-out arrivals, ${formatCount(window.testRows)} stays, all later than anything used for training.`
        : "No evaluation block is published in the current artifact.",
    },
  ];

  const deadRow = longStay?.subgroups.find(
    (row) => row.attribute.toLowerCase().includes("condition") && row.level.toLowerCase() === "dead",
  );

  return (
    <div className="space-y-10">
      <header className="max-w-[72ch]">
        <p className="t-overline" style={{ color: "var(--accent-strong)" }}>
          How it works
        </p>
        <h1 className="t-display mt-2" style={{ color: "var(--ink-primary)" }}>
          {MODEL.title}
        </h1>
        <div className="mt-5 space-y-4">
          {MODEL.intro.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="t-lede" style={{ color: "var(--ink-secondary)" }}>
              {paragraph}
            </p>
          ))}
        </div>
      </header>

      {!artifact ? (
        <ScoringNotice note={model.note} />
      ) : (
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
      )}

      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SectionNav sections={SECTIONS} />
        </aside>

        <div className="min-w-0 space-y-14">
          <Section id="data" number="01" heading={MODEL.sections.data}>
            {MODEL.refreshBody.map((paragraph) => (
              <Prose key={paragraph.slice(0, 24)}>{paragraph}</Prose>
            ))}
            <ol className="grid gap-3 sm:grid-cols-3">
              {MODEL.refreshSteps.map((step, index) => (
                <li key={step.label}>
                  <Card className="h-full" as="div" style={{ padding: "var(--space-4)" }}>
                    <p className="t-caption tabular" style={{ color: "var(--accent-strong)" }}>
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="t-subtitle mt-1" style={{ color: "var(--ink-primary)" }}>
                      {step.label}
                    </p>
                    <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
                      {step.body}
                    </p>
                  </Card>
                </li>
              ))}
            </ol>
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                The path, end to end
              </h3>
              <ol className="t-small mt-3 list-decimal space-y-1.5 pl-5" style={{ color: "var(--ink-secondary)" }}>
                <li>Austin&apos;s Socrata API is read in full, page by page, with a stable ordering so no row is skipped or repeated.</li>
                <li>Every row is validated against a schema; rejected rows are counted, never dropped silently.</li>
                <li>Each intake is paired with the outcome that names its intake time. Near misses are marked ambiguous and excluded from counts.</li>
                <li>Open stays, waits, medians, rates and outcome shares are computed from the paired stays as of one snapshot moment.</li>
                <li>Eligible open stays are scored by the published model, from intake-time inputs only.</li>
                <li>
                  The finished view is cached for {Math.round(view.status.cacheIntervalSeconds / 60)} minutes and served to every
                  page. There is no push subscription; the site asks on this schedule.
                </li>
              </ol>
              <p className="t-caption mt-3" style={{ color: "var(--ink-muted)" }}>
                {`Current snapshot ${formatInstant(view.status.snapshotAt)}. Publisher last wrote ${formatInstant(
                  view.status.publisherUpdatedAt,
                )}. Times on Austin's clock. `}
                <DataDetailsTrigger className="link-reveal">Open the data details</DataDetailsTrigger>
              </p>
            </Panel>
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                Source datasets
              </h3>
              <ul className="mt-3 space-y-2">
                {ALL_DATASETS.map((dataset) => (
                  <li key={dataset.id} className="t-small" style={{ color: "var(--ink-secondary)" }}>
                    <a href={dataset.href} target="_blank" rel="noreferrer noopener" className="link-reveal">
                      {dataset.label}
                    </a>
                    <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
                      <span className="font-mono">{dataset.id}</span>
                      {dataset.refresh === "hourly"
                        ? " · current ShelterBuddy feed, refreshed hourly, beginning 5 May 2025"
                        : " · archive, frozen at the May 2025 cutover, used by the earlier study only"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
                The archive and current feeds do not share an animal-ID namespace and are never joined by resemblance.
                Outcomes whose intake predates the cutover are counted as unmatched and shown in the data details.
              </p>
            </Panel>
          </Section>

          <Section id="metrics" number="02" heading={MODEL.sections.metrics}>
            <Prose>
              {
                "Every figure on the site has one definition, kept in a shared registry so the dashboard, the queue, a record page and this page cannot disagree. One sentence each; open an entry for the unit, formula, window, sample and limits."
              }
            </Prose>
            <Panel>
              <div className="space-y-1">
                {allMetrics().map((entry) => (
                  <Disclosure key={entry.id} summary={entry.title} compact id={`metric-${entry.id}`}>
                    <p className="t-small max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
                      {entry.meaning}
                    </p>
                    <dl className="t-caption mt-2 max-w-[68ch] space-y-1" style={{ color: "var(--ink-muted)" }}>
                      {(
                        [
                          ["Unit", entry.unit],
                          ["Formula or cohort", entry.formula],
                          ["Window", entry.window],
                          ["Sample and exclusions", entry.sample],
                          ["Practical use", entry.use],
                          ["Limitation", entry.limitation],
                          ["Source", entry.source],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <dt className="inline font-semibold">{label}: </dt>
                          <dd className="inline">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </Disclosure>
                ))}
              </div>
            </Panel>
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                Data-quality labels
              </h3>
              <dl className="mt-3 space-y-2">
                {Object.values(QUALITY_LABELS).map((label) => (
                  <div key={label.title}>
                    <dt className="t-small font-medium" style={{ color: "var(--ink-primary)" }}>
                      {label.title}
                    </dt>
                    <dd className="t-small max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
                      {label.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </Section>

          <Section id="predictions" number="03" heading={MODEL.sections.predictions}>
            <h3 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {MODEL.simpleWhatHeading}
            </h3>
            <Prose>{MODEL.simpleWhatBody}</Prose>
            <h3 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {MODEL.simpleDataHeading}
            </h3>
            <Prose>{MODEL.simpleDataBody}</Prose>
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                What the estimate is, and is not
              </h3>
              <ul className="t-small mt-3 max-w-[68ch] list-disc space-y-1.5 pl-5" style={{ color: "var(--ink-secondary)" }}>
                <li>It is answered at intake and not re-asked as the stay continues. For an animal already past 60 days, the site leads with that fact and keeps the intake estimate as context.</li>
                <li>The 30-day figure is adoption by day 30 counting from arrival, not within the next 30 days from today.</li>
                <li>The two figures are separate models, not one minus the other.</li>
                <li>A 70% long-stay estimate means roughly 70 in 100 comparable scored arrivals would pass 60 days if the calibration holds. It is not certainty, temperament, or an animal&apos;s worth.</li>
              </ul>
            </Panel>
            {longStay ? (
              <Panel>
                <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                  What it keys on: stay past 60 days
                </h3>
                <div className="mt-4">
                  <DriverBars drivers={longStay.featureImportance} limit={8} />
                </div>
              </Panel>
            ) : null}
            {adopt ? (
              <Disclosure summary="Show the 30-day adoption model's inputs">
                <Panel>
                  <DriverBars drivers={adopt.featureImportance} limit={8} />
                </Panel>
              </Disclosure>
            ) : null}
          </Section>

          <Section id="testing" number="04" heading={MODEL.sections.testing}>
            <Prose>{MODEL.simpleTestBody}</Prose>
            <Prose>{MODEL.performanceNote}</Prose>
            <Panel>
              {longStay && adopt && window ? (
                <TargetMetrics
                  columns={[
                    { id: "long_stay_60d", label: "Stay past 60 days", metrics: longStay.test },
                    { id: "adopted_within_30d", label: "Adopted by day 30", metrics: adopt.test },
                  ]}
                  caption={`Held-out test block: arrivals between ${formatDate(window.testStart)} and ${formatDate(
                    window.testEnd,
                  )} whose outcome was observable (${formatCount(longStay.test.n)} stays for the long-stay target, ${formatCount(
                    adopt.test.n,
                  )} for adoption), scored after calibration.`}
                />
              ) : (
                <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
                  No evaluation metrics are published in the current artifact.
                </p>
              )}
            </Panel>

            {longStay && adopt ? (
              <Disclosure summary={MODEL.calibrationHeading}>
                <Panel>
                  <p className="t-small max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
                    {MODEL.calibrationBody}
                  </p>
                  <dl className="mt-4 grid gap-x-10 gap-y-2.5 lg:grid-cols-2">
                    <Fact
                      label="Long stay, validation AUC (fitted set)"
                      value={longStay.validation.rocAuc === null ? NOT_MEASURED : formatMetric(longStay.validation.rocAuc)}
                    />
                    <Fact
                      label="Long stay, validation ECE (fitted set)"
                      value={longStay.validation.ece === null ? NOT_MEASURED : formatMetric(longStay.validation.ece)}
                    />
                    <Fact
                      label="30-day adoption, validation AUC (fitted set)"
                      value={adopt.validation.rocAuc === null ? NOT_MEASURED : formatMetric(adopt.validation.rocAuc)}
                    />
                    <Fact
                      label="30-day adoption, validation ECE (fitted set)"
                      value={adopt.validation.ece === null ? NOT_MEASURED : formatMetric(adopt.validation.ece)}
                    />
                  </dl>
                  <p className="t-caption mt-4 max-w-[68ch]" style={{ color: "var(--ink-muted)" }}>
                    {MODEL.calibrationNoCurve}
                  </p>
                </Panel>
              </Disclosure>
            ) : null}
          </Section>

          <Section id="subgroups" number="05" heading={MODEL.sections.subgroups}>
            <Prose>{MODEL.subgroupBody}</Prose>
            <Panel>
              {longStay && window ? (
                <SubgroupTable
                  rows={longStay.subgroups}
                  sample={`Long-stay performance by subgroup on the held-out test block. The gap is mean predicted rate minus observed rate in percentage points; positive means the model predicted more long stays than happened. Rows past 4 points are flagged; groups under 100 stays are reported without a judgement.`}
                />
              ) : (
                <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
                  No subgroup breakdown is published in the current artifact.
                </p>
              )}
            </Panel>
            {deadRow ? (
              <Card surface="sunken" elevation={0} style={{ padding: "var(--card-padding)", borderLeft: "3px solid var(--status-warning)" }}>
                <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                  A known population issue
                </h3>
                <p className="t-small mt-2 max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
                  {`${MODEL.subgroupPopulationNote} In this artifact ${formatCount(deadRow.n)} test stays carry that condition, with an observed long-stay rate of ${formatPercent(
                    deadRow.positiveRate,
                    1,
                  )}, which points to records left open rather than animals waiting.`}
                </p>
              </Card>
            ) : null}
          </Section>

          <Section id="limitations" number="06" heading={MODEL.sections.limitations}>
            <h3 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {MODEL.simpleTrustHeading}
            </h3>
            <Prose>{MODEL.simpleTrustBody}</Prose>
            <h3 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {MODEL.limitsHeading}
            </h3>
            {MODEL.limitsBody.map((paragraph) => (
              <Prose key={paragraph.slice(0, 24)}>{paragraph}</Prose>
            ))}
            {longStay ? (
              <Panel>
                <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                  What that looks like in this model today
                </h3>
                <p className="t-small mt-2 max-w-[68ch]" style={{ color: "var(--ink-secondary)" }}>
                  {`Long-stay discrimination on the held-out block is ${
                    longStay.test.rocAuc === null ? NOT_MEASURED : formatMetric(longStay.test.rocAuc)
                  } and its calibration error is ${
                    longStay.test.ece === null ? NOT_MEASURED : formatMetric(longStay.test.ece)
                  }. A long stay happened to ${formatPercent(
                    longStay.test.positiveRate,
                    1,
                  )} of the block, so the ranking is doing real work on a rare outcome. If the calibration error climbs while discrimination holds, the ranking is still usable and the printed percentages are not.`}
                </p>
              </Panel>
            ) : null}
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                {MODEL.mustNotHeading}
              </h3>
              <div className="mt-3 max-w-[68ch] space-y-3">
                {USE_POLICY_FULL.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="t-body" style={{ color: "var(--ink-primary)" }}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </Panel>
          </Section>

          <Section id="lineage" number="07" heading={MODEL.sections.lineage}>
            <Prose>{MODEL.lineageNote}</Prose>
            <Panel>
              {artifact && window && provenance ? (
                <dl className="grid gap-x-10 gap-y-2.5 lg:grid-cols-2">
                  <Fact label="Model version" value={artifact.version} />
                  <Fact label="Trained at" value={formatInstant(artifact.trainedAt)} />
                  <Fact label="Source system" value="ShelterBuddy, via the City of Austin" />
                  <Fact label="Source datasets" value={provenance.sourceDatasetIds.join(", ")} />
                  <Fact label="Source rows read" value={`${formatCount(provenance.intakeRows)} intakes, ${formatCount(provenance.outcomeRows)} outcomes`} />
                  <Fact label="Source retrieved" value={formatInstant(provenance.retrievedAt)} />
                  <Fact label="Feature transform" value={provenance.transformVersion} />
                  <Fact label="Random seed" value={String(provenance.librarySeed)} />
                  <Fact label="Training block" value={`${formatDate(window.trainStart)} to ${formatDate(window.trainEnd)} · ${formatCount(window.trainRows)} stays`} />
                  <Fact label="Validation block" value={`${formatDate(window.validStart)} to ${formatDate(window.validEnd)} · ${formatCount(window.validRows)} stays`} />
                  <Fact label="Test block" value={`${formatDate(window.testStart)} to ${formatDate(window.testEnd)} · ${formatCount(window.testRows)} stays`} />
                  <Fact label="Inputs used" value={`${formatCount(artifact.features.length)} features, all known at intake`} />
                  <Fact label="Learner" value="LightGBM gradient-boosted trees, isotonic calibration on the validation block" />
                  <Fact label="Runtime" value="Committed JSON tree dump, evaluated in TypeScript; golden vectors keep it in step with the Python trainer" />
                </dl>
              ) : (
                <p className="t-small max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                  {model.note ??
                    "No model artifact is published, so there is no lineage to report. Nothing on this page is filled in from memory when that happens."}
                </p>
              )}
            </Panel>
            <h3 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {MODEL.archiveHeading}
            </h3>
            <Prose>{MODEL.archiveBody}</Prose>
            <Prose>
              {
                "Archive-era findings that still appear on this site (foster pathways, intake condition, the senior band) are labelled as historical associations from 2013–2022 wherever they are used. They describe that period, not current rates, and they do not measure what an action changes."
              }
            </Prose>
          </Section>
        </div>
      </div>
    </div>
  );
}
