import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  explainMissing,
  findStay,
  getInterventionChannels,
  getShelterView,
  hasLiveScoring,
  NotFoundError,
  type ScoredStay,
} from "@/lib/shelter.server";
import { DETAIL, DISCOVER, ERRORS, QUEUE } from "@/lib/content";
import { formatAge, formatDate, formatInTen, formatLabel, formatPercent, formatSourceTime } from "@/lib/format";
import { recordTitle, resolveOrigin, type RecordOrigin } from "@/lib/recordTitle";
import { describeHorizon, LONG_STAY_HORIZON_DAYS, ADOPTION_HORIZON_DAYS } from "@/lib/model/horizon";
import { BAND_LABEL, BAND_SENTENCE } from "@/lib/model/presentation";
import { QUALITY_LABELS } from "@/lib/metrics/registry";
import { resolveChannel, suggestChannel } from "@/lib/interventions";
import Card from "@/components/ui/Card";
import Disclosure from "@/components/ui/Disclosure";
import MonogramTile from "@/components/ui/MonogramTile";
import AddToPlanButton from "@/components/discover/AddToPlanButton";
import { DataUnavailable } from "@/components/shell/StateNotices";

export const revalidate = 1800;

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const view = await getShelterView();
  try {
    const stay = findStay(view, decoded);
    return {
      title: recordTitle(stay.name, stay.animalId),
      description: `${stay.species}${stay.breed ? `, ${stay.breed}` : ""}, with an open intake record at the Austin Animal Center for ${stay.daysInCare} days.`,
    };
  } catch {
    const missing = explainMissing(view, decoded);
    return {
      title: missing.kind === "closed" ? recordTitle(missing.record.name, missing.record.animalId) : "Record not found",
      robots: { index: false },
    };
  }
}

const ORIGIN_LABEL: Record<RecordOrigin, { href: string; label: string }> = {
  queue: { href: "/queue", label: DETAIL.backToQueue },
  records: { href: "/discover", label: DETAIL.backToRecords },
  dashboard: { href: "/", label: "Dashboard" },
  planner: { href: "/planner", label: DETAIL.backToPlanner },
};

function Breadcrumb({ origin }: { origin: RecordOrigin }) {
  const back = ORIGIN_LABEL[origin];
  return (
    <nav aria-label="Breadcrumb" className="t-small flex flex-wrap items-center gap-2" style={{ color: "var(--ink-muted)" }}>
      <Link href={back.href} className="link-reveal inline-flex min-h-[32px] items-center gap-1.5">
        <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
        {back.label}
      </Link>
      {origin !== "records" ? (
        <>
          <span aria-hidden="true">·</span>
          <Link href="/discover" className="link-reveal inline-flex min-h-[32px] items-center">
            {DETAIL.backToRecords}
          </Link>
        </>
      ) : null}
    </nav>
  );
}

/**
 * A single current record.
 *
 * Written first for a member of the public: the record, the wait, and what
 * the data can and cannot say. Model estimates are present for staff who
 * arrive from the queue, inside a clearly labelled section with their horizon
 * stated, because a person deciding what to do next deserves the same facts
 * the queue showed them. The section leads with the actual wait and never
 * presents an intake-time estimate as a forecast from today.
 */
export default async function DiscoverDetailPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const view = await getShelterView();
  const origin = resolveOrigin(search.from);

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  const decoded = decodeURIComponent(id);
  let stay: ScoredStay;
  try {
    stay = findStay(view, decoded);
  } catch (cause) {
    if (!(cause instanceof NotFoundError)) throw cause;
    const missing = explainMissing(view, decoded);
    return (
      <div className="max-w-[64ch] space-y-5">
        <Breadcrumb origin={origin} />
        {missing.kind === "closed" ? (
          <>
            <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
              {ERRORS.animalClosedTitle}
            </h1>
            <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
              {ERRORS.animalClosedBody}
            </p>
            <Card style={{ padding: "var(--card-padding)" }}>
              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <Fact label="Animal" value={`${missing.record.name ?? QUEUE.unnamed} (${missing.record.animalId})`} />
                <Fact label="Recorded outcome" value={missing.record.outcome} />
                <Fact label="Outcome date" value={formatSourceTime(missing.record.outcomeAt)} />
              </dl>
            </Card>
          </>
        ) : missing.kind === "invalid" ? (
          <>
            <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
              {ERRORS.animalInvalidTitle}
            </h1>
            <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
              {ERRORS.animalInvalidBody}
            </p>
          </>
        ) : (
          <>
            <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
              {ERRORS.animalNotFound}
            </h1>
            <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
              {ERRORS.animalNotFoundBody}
            </p>
          </>
        )}
        <p className="t-small" style={{ color: "var(--ink-muted)" }}>
          <a href={DETAIL.contactHref} target="_blank" rel="noreferrer noopener" className="link-reveal">
            {DETAIL.contactLink}
          </a>
        </p>
      </div>
    );
  }

  const scoring = hasLiveScoring(view);
  const horizon = describeHorizon({ daysInCare: stay.daysInCare, pLongStay60d: stay.pLongStay60d, scoring });
  const displayName = stay.name ?? DISCOVER.noName;
  const suggestion = suggestChannel(stay);
  const channel = resolveChannel(getInterventionChannels(), suggestion.channel);

  const facts: [string, string, string?][] = [
    ["Species", stay.species],
    ["Recorded as", stay.rawType ?? DETAIL.notRecorded],
    ["Breed", stay.breed ?? DETAIL.notRecorded],
    ["Colour", stay.color ?? DETAIL.notRecorded],
    ["Sex", stay.sex ? formatLabel(stay.sex) : DETAIL.notRecorded],
    [
      DETAIL.alteredAtIntake,
      stay.alteredAtIntake === null ? DETAIL.notRecorded : stay.alteredAtIntake ? "Yes" : "No",
      DETAIL.alteredNote,
    ],
    [DETAIL.ageNow, stay.currentAgeDays === null ? DETAIL.notRecorded : formatAge(stay.currentAgeDays), "Age at intake plus the wait so far."],
    [DETAIL.ageAtIntake, stay.ageAtIntakeDays === null ? DETAIL.notRecorded : formatAge(stay.ageAtIntakeDays)],
    ["Reason recorded", stay.intakeReason ? formatLabel(stay.intakeReason) : DETAIL.notRecorded],
    ["Condition at intake", stay.condition ? formatLabel(stay.condition) : DETAIL.notRecorded],
  ];

  const qualityNotes: { title: string; body: string }[] = [];
  if (stay.possiblyStale) qualityNotes.push(QUALITY_LABELS.possiblyStale);
  if (stay.ageAtIntakeDays === null) qualityNotes.push(QUALITY_LABELS.missingAge);
  if (scoring && stay.pLongStay60d === null) qualityNotes.push(QUALITY_LABELS.unavailable);
  if (stay.dataQualityFlags.includes("implausible_age"))
    qualityNotes.push({ title: "Implausible age", body: "The recorded date of birth implies an age over forty years, which is a data-entry artefact." });

  const inTen = formatInTen(stay.pAdopt30d);
  const timelineMax = Math.max(stay.daysInCare, LONG_STAY_HORIZON_DAYS + 15);
  const pct = (d: number) => `${Math.min(100, (d / timelineMax) * 100)}%`;

  return (
    <div className="max-w-[80ch] space-y-8">
      <Breadcrumb origin={origin} />

      <header className="flex flex-wrap items-start gap-5">
        <MonogramTile name={stay.name} species={stay.species} size={88} radius="xl" />
        <div className="min-w-0 flex-1">
          <p className="t-overline" style={{ color: "var(--accent-strong)" }}>
            {stay.possiblyStale ? DISCOVER.recordStatusStale : DISCOVER.recordStatusOpen}
          </p>
          <h1 className="t-display mt-1" style={{ color: "var(--ink-primary)", overflowWrap: "anywhere" }}>
            {displayName}
          </h1>
          <p className="t-small mt-1 font-mono" style={{ color: "var(--ink-muted)" }}>
            {`Animal ${stay.animalId}`}
          </p>
          <p className="t-subtitle mt-3" style={{ color: "var(--ink-secondary)" }}>
            {`${DISCOVER.waitingFor} `}
            <span className="tabular font-semibold" style={{ color: "var(--accent-warm-strong)" }}>
              {`${stay.daysInCare} days`}
            </span>
            {` since ${formatDate(stay.intakeAt)}`}
          </p>
          <div className="mt-4">
            <AddToPlanButton episodeId={stay.episodeId} name={displayName} />
          </div>
        </div>
      </header>

      <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
          {DETAIL.timelineTitle}
        </h2>
        {/* The two horizon markers sit on opposite sides of the bar. On a
            long stay the whole bar is scaled to the wait, so day 30 and day
            60 fall close together and their labels would otherwise collide. */}
        <div className="relative mt-9 h-2 rounded-full" style={{ background: "var(--surface-sunken)" }} role="presentation">
          <span
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: pct(stay.daysInCare), background: "var(--accent)" }}
          />
          <Marker at={pct(ADOPTION_HORIZON_DAYS)} label={`Day ${ADOPTION_HORIZON_DAYS}`} side="above" />
          <Marker at={pct(LONG_STAY_HORIZON_DAYS)} label={`Day ${LONG_STAY_HORIZON_DAYS}`} side="below" />
        </div>
        <ol className="t-small mt-9 grid gap-2 sm:grid-cols-3" style={{ color: "var(--ink-secondary)" }}>
          <li>
            <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
              Arrived
            </span>
            {formatSourceTime(stay.intakeAt)}
          </li>
          <li>
            <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
              Snapshot
            </span>
            {`Day ${stay.daysInCare}`}
          </li>
          <li>
            <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
              Status
            </span>
            {horizon.status === "already_past_horizon" ? horizon.headline : `${horizon.daysToHorizon} days to day ${LONG_STAY_HORIZON_DAYS}`}
          </li>
        </ol>
      </Card>

      <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
          {DETAIL.factsTitle}
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value, note]) => (
            <Fact key={label} label={label} value={value} note={note} />
          ))}
        </dl>
        <p className="t-caption mt-4" style={{ color: "var(--ink-muted)" }}>
          “{DETAIL.notRecorded}” means the feed carried no value. It is not the same as “No”.
        </p>
      </Card>

      {scoring ? (
        <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="estimates-heading">
          <h2 id="estimates-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
            {DETAIL.predictionTitle}
          </h2>
          <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {DETAIL.predictionIntro}
          </p>
          {stay.pLongStay60d === null ? (
            <p className="t-small mt-4" style={{ color: "var(--ink-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--ink-primary)" }}>
                {DETAIL.noPredictionTitle}.
              </span>{" "}
              {stay.predictionUnavailableReason}
            </p>
          ) : (
            <>
              <p className="t-subtitle mt-4" style={{ color: horizon.status === "already_past_horizon" ? "var(--accent-warm-strong)" : "var(--ink-primary)" }}>
                {horizon.headline}
              </p>
              <p className="t-small mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                {horizon.estimateNote}
              </p>
              <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Fact
                  label="Stay past 60 days, estimated at intake"
                  value={`${formatPercent(stay.pLongStay60d)} · ${BAND_LABEL[stay.riskBand ?? "ok"]}`}
                  note={BAND_SENTENCE[stay.riskBand ?? "ok"]}
                />
                <Fact
                  label={horizon.adoptionWindowPassed ? "Adopted by day 30 from intake (window has passed)" : "Adopted by day 30 from intake"}
                  value={stay.pAdopt30d === null ? QUEUE.predictionUnavailable : `${formatPercent(stay.pAdopt30d)}${inTen ? ` · about ${inTen}` : ""}`}
                />
              </dl>
              <p className="t-caption mt-4 max-w-prose" style={{ color: "var(--ink-muted)" }}>
                {`${DETAIL.intervalNote} Model ${view.status.modelVersion ?? ""}.`}
              </p>
            </>
          )}
        </Card>
      ) : null}

      {channel ? (
        <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="support-heading">
          <h2 id="support-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
            {DETAIL.interventionsTitle}
          </h2>
          <p className="t-subtitle mt-3" style={{ color: "var(--ink-primary)" }}>
            {channel.label}
          </p>
          <p className="t-small mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {suggestion.reason}
          </p>
          <p
            className="t-caption mt-2 inline-block rounded-[var(--radius-full)] px-2 py-0.5"
            style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
          >
            {channel.evidence === "historical" ? DETAIL.evidenceHistorical : DETAIL.evidenceAssumed}
          </p>
          <Disclosure summary="Evidence and assumptions" className="mt-2">
            <p className="t-small max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              {channel.evidence_detail}
            </p>
            <p className="t-caption mt-2" style={{ color: "var(--ink-muted)" }}>
              {`Assumed coordination time: ${channel.staff_minutes} minutes. ${channel.time_note}`}
            </p>
          </Disclosure>
          <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
            {QUEUE.verifyReminder}
          </p>
        </Card>
      ) : null}

      {qualityNotes.length > 0 ? (
        <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="quality-heading">
          <h2 id="quality-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
            {DETAIL.qualityTitle}
          </h2>
          <ul className="mt-3 space-y-2">
            {qualityNotes.map((note) => (
              <li key={note.title} className="t-small" style={{ color: "var(--ink-secondary)" }}>
                <span className="font-medium" style={{ color: "var(--ink-primary)" }}>
                  {note.title}.
                </span>{" "}
                {note.body}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card surface="sunken" elevation={0} style={{ padding: "var(--card-padding)" }} aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
          {DETAIL.contactHeading}
        </h2>
        <p className="t-small mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
          {DETAIL.contactBody}
        </p>
        <a
          href={DETAIL.contactHref}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn--secondary mt-4"
        >
          {DETAIL.contactLink}
          <ExternalLink size={15} strokeWidth={1.75} aria-hidden="true" />
        </a>
        <p className="t-caption mt-3" style={{ color: "var(--ink-muted)" }}>
          {DISCOVER.accuracyNote}
        </p>
      </Card>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="t-small" style={{ color: "var(--ink-muted)" }}>
          {label}
        </dt>
        <dd className="t-small text-right" style={{ color: "var(--ink-primary)" }}>
          {value}
        </dd>
      </div>
      {note ? (
        <p className="t-caption mt-0.5" style={{ color: "var(--ink-muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Marker({ at, label, side }: { at: string; label: string; side: "above" | "below" }) {
  return (
    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at }}>
      <span className="block h-4 w-px" style={{ background: "var(--ink-muted)" }} aria-hidden="true" />
      <span
        className={`t-caption absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${
          side === "above" ? "bottom-full mb-0.5" : "top-full mt-0.5"
        }`}
        style={{ color: "var(--ink-muted)" }}
      >
        {label}
      </span>
    </span>
  );
}
