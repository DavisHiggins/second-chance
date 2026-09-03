import type { Metadata } from "next";
import { loadScoringModel } from "@/lib/model/registry.server";
import { MODEL, USE_POLICY_FULL } from "@/lib/content";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatMetric,
  formatMultiplier,
  formatPercent,
  NOT_MEASURED,
} from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import Card from "@/components/ui/Card";
import DriverBars from "@/components/charts/DriverBars";
import SubgroupTable from "@/components/model/SubgroupTable";
import TargetMetrics from "@/components/model/TargetMetrics";
import { ScoringNotice } from "@/components/shell/StateNotices";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How the model works",
  description:
    "What SecondChance predicts, what it learned from, how well it does it, who it works badly for, and what it must never be used to decide.",
};

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

/**
 * The model page.
 *
 * Everything numeric here comes from the published artifact, which is the
 * whole point of the rewrite: the previous version of this page carried a
 * hardcoded training date that was two weeks in the future and metrics typed
 * into the interface by hand. There is now exactly one source for those
 * values, and if it is missing or not credible the page says so instead of
 * filling the space.
 */
export default async function ModelPage() {
  const model = await loadScoringModel();
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
        "Take two stays, one that ran past 60 days and one that did not. This is how often the model ranks them the right way round on data it never saw.",
    },
    {
      label: "Calibration error",
      value: longStay?.test.ece ? formatMetric(longStay.test.ece) : NOT_MEASURED,
      gloss:
        "Average distance between a stated chance and what actually happened at that chance. Smaller means the percentage on screen means what it says.",
    },
    {
      label: "Lift in the top 50",
      value: longStay?.test.liftAt50 ? formatMultiplier(longStay.test.liftAt50, 2) : NOT_MEASURED,
      gloss:
        "How much more likely the top 50 of the queue are to become long-stay residents than 50 animals chosen at random. This is what the queue buys you.",
    },
    {
      label: "Evaluation period",
      value: window ? `${formatDate(window.testStart)} to ${formatDate(window.testEnd)}` : NOT_MEASURED,
      gloss: window
        ? `Held-out arrivals, ${formatCount(window.testRows)} stays, all later than anything used for training.`
        : "No evaluation block is published in the current artifact.",
    },
  ];

  return (
    <PageMotion className="space-y-10">
      <MotionChild index={0}>
        <h1 className="t-display max-w-3xl" style={{ color: "var(--ink-primary)" }}>
          {MODEL.title}
        </h1>
        <p className="t-small mt-2 font-mono" style={{ color: "var(--ink-muted)" }}>
          {artifact
            ? `${artifact.version} · trained ${formatDateTime(artifact.trainedAt)}`
            : "No validated model is currently scoring"}
        </p>
      </MotionChild>

      {!artifact ? (
        <MotionChild index={1}>
          <ScoringNotice note={model.note} />
        </MotionChild>
      ) : (
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
      )}

      <MotionChild index={2}>
        <Section id="what-it-does" heading={MODEL.simpleWhatHeading}>
          <Prose>{MODEL.simpleWhatBody}</Prose>
        </Section>
      </MotionChild>

      <MotionChild index={3}>
        <Section id="what-it-learned-from" heading={MODEL.simpleDataHeading}>
          <Prose>{MODEL.simpleDataBody}</Prose>
        </Section>
      </MotionChild>

      <MotionChild index={4}>
        <Section id="how-tested" heading={MODEL.simpleTestHeading}>
          <Prose>{MODEL.simpleTestBody}</Prose>
        </Section>
      </MotionChild>

      <MotionChild index={5}>
        <Section id="lineage" heading={MODEL.lineageHeading}>
          <Prose>{MODEL.lineageNote}</Prose>
          <Panel>
            {artifact && window && provenance ? (
              <dl className="grid gap-x-10 gap-y-2.5 lg:grid-cols-2">
                <Fact label="Model version" value={artifact.version} />
                <Fact label="Trained at" value={formatDateTime(artifact.trainedAt)} />
                <Fact label="Source system" value="ShelterBuddy, via the City of Austin" />
                <Fact label="Source datasets" value={provenance.sourceDatasetIds.join(", ")} />
                <Fact label="Source rows read" value={`${formatCount(provenance.intakeRows)} intakes, ${formatCount(provenance.outcomeRows)} outcomes`} />
                <Fact label="Source retrieved" value={formatDateTime(provenance.retrievedAt)} />
                <Fact label="Feature transform" value={provenance.transformVersion} />
                <Fact label="Random seed" value={String(provenance.librarySeed)} />
                <Fact
                  label="Training block"
                  value={`${formatDate(window.trainStart)} to ${formatDate(window.trainEnd)} · ${formatCount(window.trainRows)} stays`}
                />
                <Fact
                  label="Validation block"
                  value={`${formatDate(window.validStart)} to ${formatDate(window.validEnd)} · ${formatCount(window.validRows)} stays`}
                />
                <Fact
                  label="Test block"
                  value={`${formatDate(window.testStart)} to ${formatDate(window.testEnd)} · ${formatCount(window.testRows)} stays`}
                />
                <Fact label="Inputs used" value={`${formatCount(artifact.features.length)} features, all known at intake`} />
              </dl>
            ) : (
              <p className="t-small max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                {model.note ??
                  "No model artifact is published, so there is no lineage to report. Nothing on this page is filled in from memory when that happens."}
              </p>
            )}
          </Panel>
        </Section>
      </MotionChild>

      <MotionChild index={6}>
        <Section id="how-well" heading={MODEL.performanceHeading}>
          <Prose>{MODEL.performanceNote}</Prose>
          <Panel>
            {longStay && adopt && window ? (
              <TargetMetrics
                columns={[
                  { id: "long_stay_60d", label: "Still here after 60 days", metrics: longStay.test },
                  { id: "adopted_within_30d", label: "Adopted within 30 days", metrics: adopt.test },
                ]}
                caption={`Held-out test block, ${formatCount(window.testRows)} completed stays arriving between ${formatDate(
                  window.testStart,
                )} and ${formatDate(window.testEnd)}, scored after calibration.`}
              />
            ) : (
              <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
                No evaluation metrics are published in the current artifact.
              </p>
            )}
          </Panel>

          {longStay && adopt ? (
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                Before and after calibration
              </h3>
              <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                The raw model ranks well but its probabilities are not trustworthy on their own. An
                isotonic mapping is fitted on the validation block and applied to everything shown
                on this site. These are the validation-block figures the mapping was fitted from,
                for comparison with the calibrated test figures above.
              </p>
              <dl className="mt-4 grid gap-x-10 gap-y-2.5 lg:grid-cols-2">
                <Fact
                  label="Long stay, validation AUC"
                  value={
                    longStay.validation.rocAuc === null
                      ? NOT_MEASURED
                      : formatMetric(longStay.validation.rocAuc)
                  }
                />
                <Fact
                  label="Long stay, validation calibration error"
                  value={
                    longStay.validation.ece === null
                      ? NOT_MEASURED
                      : formatMetric(longStay.validation.ece)
                  }
                />
                <Fact
                  label="30-day adoption, validation AUC"
                  value={
                    adopt.validation.rocAuc === null
                      ? NOT_MEASURED
                      : formatMetric(adopt.validation.rocAuc)
                  }
                />
                <Fact
                  label="30-day adoption, validation calibration error"
                  value={
                    adopt.validation.ece === null
                      ? NOT_MEASURED
                      : formatMetric(adopt.validation.ece)
                  }
                />
              </dl>
              <p className="t-caption mt-4 max-w-prose" style={{ color: "var(--ink-muted)" }}>
                A reliability curve is not drawn here because the artifact does not carry per-bin
                counts, and a curve interpolated from summary statistics would be a drawing rather
                than a measurement. The calibration slope, intercept and error in the table above
                are the published values.
              </p>
            </Panel>
          ) : null}
        </Section>
      </MotionChild>

      <MotionChild index={7}>
        <Section id="who-for" heading={MODEL.subgroupHeading}>
          <Prose>{MODEL.subgroupBody}</Prose>
          <Panel>
            {longStay && window ? (
              <SubgroupTable
                rows={longStay.subgroups}
                sample={`Long-stay performance by subgroup on the held-out test block of ${formatCount(
                  window.testRows,
                )} stays. A positive calibration gap means the model predicted more long stays than happened; a negative gap means it predicted fewer. Rows past 0.04 in either direction are flagged.`}
              />
            ) : (
              <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
                No subgroup breakdown is published in the current artifact.
              </p>
            )}
          </Panel>
        </Section>
      </MotionChild>

      <MotionChild index={8}>
        <Section id="what-it-keys-on" heading="What it keys on">
          <Prose>
            {
              "The model is a gradient-boosted tree ensemble over inputs that are all knowable the moment an animal arrives. Nothing it reads describes how the stay ended, because a model that peeks at the outcome scores beautifully and is useless."
            }
          </Prose>
          {longStay ? (
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                Still here after 60 days
              </h3>
              <div className="mt-4">
                <DriverBars drivers={longStay.featureImportance} limit={8} />
              </div>
            </Panel>
          ) : null}
          {adopt ? (
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                Adopted within 30 days
              </h3>
              <div className="mt-4">
                <DriverBars drivers={adopt.featureImportance} limit={8} />
              </div>
            </Panel>
          ) : null}
        </Section>
      </MotionChild>

      <MotionChild index={9}>
        <Section id="where-not-trusted" heading={MODEL.simpleTrustHeading}>
          <Prose>{MODEL.simpleTrustBody}</Prose>
        </Section>
      </MotionChild>

      <MotionChild index={10}>
        <Section id="when-it-stops" heading={MODEL.limitsHeading}>
          {MODEL.limitsBody.map((paragraph) => (
            <Prose key={paragraph.slice(0, 24)}>{paragraph}</Prose>
          ))}
          {longStay ? (
            <Panel>
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                What that looks like in this model today
              </h3>
              <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
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
        </Section>
      </MotionChild>

      <MotionChild index={11}>
        <Section id="archive" heading={MODEL.archiveHeading}>
          <Prose>{MODEL.archiveBody}</Prose>
        </Section>
      </MotionChild>

      <MotionChild index={12}>
        <Section id="must-not" heading={MODEL.mustNotHeading}>
          <Panel>
            <div className="max-w-prose space-y-4">
              {USE_POLICY_FULL.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className="t-body"
                  style={{ color: "var(--ink-primary)" }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </Panel>
        </Section>
      </MotionChild>
    </PageMotion>
  );
}
