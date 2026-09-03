import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { findStay, getShelterView, NotFoundError } from "@/lib/shelter.server";
import { DETAIL, DISCOVER, ERRORS } from "@/lib/content";
import { formatAge, formatDate, formatLabel } from "@/lib/format";
import Card from "@/components/ui/Card";
import MonogramTile from "@/components/ui/MonogramTile";
import { DataUnavailable } from "@/components/shell/StateNotices";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Record ${decodeURIComponent(id).split(":").pop() ?? id}` };
}

/**
 * A single current record, written for a member of the public.
 *
 * Deliberately free of model vocabulary. No probability, no risk band, no
 * driver list: those belong on the staff-facing queue, where somebody is
 * making a triage decision, not on a page somebody reached because they were
 * curious about a particular animal. What is here is what the record says and
 * how long it has been open.
 */
export default async function DiscoverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await getShelterView();

  if (!view.status.retrievedAt) {
    return <DataUnavailable problem={view.status.problem} />;
  }

  let stay;
  try {
    stay = findStay(view, decodeURIComponent(id));
  } catch (cause) {
    if (cause instanceof NotFoundError) {
      return (
        <div className="max-w-[60ch] space-y-4">
          <Link
            href="/discover"
            className="t-small inline-flex items-center gap-1.5"
            style={{ color: "var(--accent-strong)" }}
          >
            <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
            {DISCOVER.title}
          </Link>
          <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {ERRORS.animalNotFound}
          </h1>
          <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
            {ERRORS.animalNotFoundBody}
          </p>
        </div>
      );
    }
    notFound();
  }

  const facts: [string, string | null][] = [
    ["Species", stay.species],
    ["Breed", stay.breed],
    ["Colour", stay.color],
    ["Sex", stay.sex ? formatLabel(stay.sex) : null],
    [
      "Altered at intake",
      stay.alteredAtIntake === null ? null : stay.alteredAtIntake ? "Yes" : "No",
    ],
    ["Age now", stay.currentAgeDays === null ? null : formatAge(stay.currentAgeDays)],
    ["Age at intake", stay.ageAtIntakeDays === null ? null : formatAge(stay.ageAtIntakeDays)],
    ["Arrived", formatDate(stay.intakeAt)],
    ["Reason recorded", stay.intakeReason ? formatLabel(stay.intakeReason) : null],
    ["Condition at intake", stay.condition ? formatLabel(stay.condition) : null],
  ];

  return (
    <div className="max-w-[76ch] space-y-8">
      <Link
        href="/discover"
        className="t-small inline-flex items-center gap-1.5"
        style={{ color: "var(--accent-strong)" }}
      >
        <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
        {DISCOVER.title}
      </Link>

      <header className="flex flex-wrap items-start gap-5">
        <MonogramTile name={stay.name} species={stay.species} size={88} radius="xl" />
        <div className="min-w-0">
          <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {stay.name ?? DISCOVER.noName}
          </h1>
          <p className="t-small font-mono mt-1" style={{ color: "var(--ink-muted)" }}>
            {`Animal ${stay.animalId}`}
          </p>
          <p className="t-subtitle mt-3" style={{ color: "var(--ink-secondary)" }}>
            {`${DISCOVER.waitingFor} `}
            <span className="tabular font-semibold" style={{ color: "var(--accent-warm-strong)" }}>
              {`${stay.daysInCare} days`}
            </span>
          </p>
        </div>
      </header>

      {stay.possiblyStale ? (
        <p
          className="t-small border p-3"
          style={{
            background: "var(--surface-sunken)",
            borderColor: "var(--status-warning)",
            borderRadius: "var(--radius-md)",
            color: "var(--ink-primary)",
          }}
        >
          This record has been open for more than a year. It may be a genuine long stay, or a
          record the shelter has not closed.
        </p>
      ) : null}

      <Card style={{ padding: "var(--card-padding)" }}>
        <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
          {DETAIL.factsTitle}
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts
            .filter(([, value]) => Boolean(value))
            .map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="t-small" style={{ color: "var(--ink-muted)" }}>
                  {label}
                </dt>
                <dd className="t-small text-right" style={{ color: "var(--ink-primary)" }}>
                  {value}
                </dd>
              </div>
            ))}
        </dl>
      </Card>

      <p className="t-small" style={{ color: "var(--ink-muted)" }}>
        {DISCOVER.accuracyNote}
      </p>
    </div>
  );
}
