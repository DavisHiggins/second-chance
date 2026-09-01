import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAnimal, getInterventions, getQueue, NotFoundError } from "@/lib/dataSource";
import { DETAIL, ERRORS, QUEUE } from "@/lib/content";
import { formatAge, formatCount, formatDate, formatDays, formatLabel } from "@/lib/format";
import PageMotion, { MotionChild } from "@/components/shell/PageMotion";
import MonogramTile from "@/components/ui/MonogramTile";
import DriverBars from "@/components/charts/DriverBars";
import PredictionPanel from "@/components/detail/PredictionPanel";
import Timeline from "@/components/detail/Timeline";
import SimilarAnimals from "@/components/detail/SimilarAnimals";
import InterventionCard from "@/components/queue/InterventionCard";
import { BAND_LABEL } from "@/components/queue/RiskBar";

export async function generateStaticParams() {
  const queue = await getQueue();
  return queue.animals.map((animal) => ({ id: animal.animal_id }));
}

export default async function AnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let response;
  try {
    response = await getAnimal(id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      // A 404 is the route's empty state, not an error banner.
      return (
        <div className="py-12">
          <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {ERRORS.animalNotFound}
          </h1>
          <Link
            href="/queue"
            className="t-small mt-4 inline-flex items-center gap-1.5 underline underline-offset-2"
            style={{ color: "var(--ink-secondary)" }}
          >
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            {DETAIL.backLink}
          </Link>
        </div>
      );
    }
    throw error;
  }

  const animal = response.animal;
  const interventions = await getInterventions();
  // The suggested channel comes from the server with the animal. The rest are
  // ordered measured first, so what was actually shown to work reads first.
  const ranked = interventions.channels
    .slice()
    .sort((a, b) => {
      if (a.channel === animal.suggested_channel) return -1;
      if (b.channel === animal.suggested_channel) return 1;
      if (a.evidence !== b.evidence) return a.evidence === "measured" ? -1 : 1;
      return a.staff_minutes - b.staff_minutes;
    })
    .slice(0, 4);

  const facts: Array<[string, string]> = [
    ["Species", animal.animal_type],
    ["Breed", animal.breed],
    ["Age at intake", formatAge(animal.age_at_intake_days)],
    ["Life stage", formatLabel(animal.age_band)],
    ["Sex", animal.sex_upon_intake],
    ["Colour", animal.color],
    ["Intake type", animal.intake_type],
    ["Intake condition", animal.intake_condition],
    ["Arrived", formatDate(animal.intake_datetime)],
    ["Days in care", formatDays(animal.days_in_care)],
    ["Risk band", BAND_LABEL[animal.risk_band]],
  ];

  return (
    <PageMotion className="space-y-6">
      <MotionChild index={0}>
        <Link
          href="/queue"
          className="t-small inline-flex items-center gap-1.5 underline underline-offset-2"
          style={{ color: "var(--ink-secondary)" }}
        >
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          {DETAIL.backLink}
        </Link>
      </MotionChild>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <MotionChild index={1}>
            <div className="flex flex-wrap items-start gap-5">
              <MonogramTile name={animal.name} size={160} radius="lg" />
              <div>
                <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
                  {animal.name ?? QUEUE.unnamed}
                </h1>
                <p className="t-small font-mono mt-1" style={{ color: "var(--ink-muted)" }}>
                  {animal.animal_id}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="t-caption" style={{ color: "var(--ink-muted)" }}>
                        {label}
                      </dt>
                      <dd className="t-small" style={{ color: "var(--ink-primary)" }}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </MotionChild>

          <MotionChild index={2}>
            <PredictionPanel animal={animal} />
          </MotionChild>

          <MotionChild index={3}>
            <section
              className="border"
              style={{
                background: "var(--surface-card)",
                borderColor: "var(--border-hairline)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--card-padding)",
              }}
            >
              <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
                {DETAIL.driversTitle}
              </h2>
              <div className="mt-4">
                <DriverBars drivers={animal.drivers} />
              </div>
            </section>
          </MotionChild>

          {animal.actual_outcome ? (
            <MotionChild index={4}>
              <section
                className="border"
                style={{
                  background: "var(--surface-sunken)",
                  borderColor: "var(--border-hairline)",
                  borderRadius: "var(--radius-lg)",
                  padding: "var(--card-padding)",
                }}
              >
                <h2 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                  What actually happened
                </h2>
                <p className="t-body mt-2" style={{ color: "var(--ink-primary)" }}>
                  {`${animal.actual_outcome.outcome_type} after ${formatDays(
                    animal.actual_outcome.days_to_outcome,
                    0,
                  )}.`}
                </p>
                <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
                  {animal.actual_outcome.note}
                </p>
              </section>
            </MotionChild>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <div className="space-y-6 lg:sticky lg:top-24">
            <MotionChild index={5}>
              <section>
                <h2 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                  {DETAIL.interventionsTitle}
                </h2>
                <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
                  {`Suggested first for this animal: ${animal.suggested_channel}. ${formatCount(
                    ranked.length,
                  )} options shown.`}
                </p>
                <ul className="mt-3 space-y-3">
                  {ranked.map((channel) => (
                    <li key={channel.channel}>
                      <InterventionCard channel={channel} />
                    </li>
                  ))}
                </ul>
              </section>
            </MotionChild>

            <MotionChild index={6}>
              <Timeline events={animal.timeline} />
            </MotionChild>

            <MotionChild index={7}>
              <SimilarAnimals animals={animal.similar_animals} />
            </MotionChild>
          </div>
        </div>
      </div>
    </PageMotion>
  );
}
