import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAnimal, getQueue, NotFoundError } from "@/lib/dataSource";
import { DISCOVER, ERRORS } from "@/lib/content";
import { formatCount } from "@/lib/format";
import { publicFacts, publicSentence } from "@/lib/publicCopy";
import MonogramTile from "@/components/ui/MonogramTile";

export async function generateStaticParams() {
  const queue = await getQueue();
  return queue.animals.map((animal) => ({ id: animal.animal_id }));
}

/**
 * The public version of the detail page. It shows the story and the days
 * waiting, and it shows no probability, no score and no model vocabulary of any
 * kind.
 */
export default async function PublicAnimalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let animal;
  try {
    animal = (await getAnimal(id)).animal;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <div className="py-12">
          <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {ERRORS.animalNotFound}
          </h1>
          <Link
            href="/discover"
            className="t-small mt-4 inline-flex items-center gap-1.5 underline underline-offset-2"
            style={{ color: "var(--ink-secondary)" }}
          >
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            Back to the animals
          </Link>
        </div>
      );
    }
    throw error;
  }

  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <Link
        href="/discover"
        className="t-small inline-flex items-center gap-1.5 underline underline-offset-2"
        style={{ color: "var(--ink-secondary)" }}
      >
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        Back to the animals
      </Link>

      <header className="flex flex-wrap items-center gap-6">
        <MonogramTile name={animal.name} size={160} radius="xl" />
        <div>
          <h1 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {animal.name ?? "Waiting for a name"}
          </h1>
          <p className="t-body mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {publicSentence(animal)}
          </p>
          <p
            className="t-small tabular mt-3 inline-block rounded-[var(--radius-full)] px-3 py-1.5"
            style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
          >
            {`Waiting ${formatCount(animal.days_in_care)} days`}
          </p>
        </div>
      </header>

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
          About {animal.name ?? "this animal"}
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {publicFacts(animal).map(([label, value]) => (
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
      </section>

      <p className="t-body" style={{ color: "var(--ink-secondary)" }}>
        {DISCOVER.subtitle}
      </p>
    </article>
  );
}
