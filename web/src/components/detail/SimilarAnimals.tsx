import { DETAIL } from "@/lib/content";
import { formatDays } from "@/lib/format";
import MonogramTile from "@/components/ui/MonogramTile";
import type { SimilarAnimal } from "@/types/api";

/**
 * Three real cases with known outcomes. For a sceptical staff member this
 * replaces a probability with something they can check, which is why it earns
 * the space.
 */
export function SimilarAnimals({ animals }: { animals: SimilarAnimal[] }) {
  return (
    <section>
      <h2 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
        {DETAIL.similarTitle}
      </h2>
      {animals.length === 0 ? (
        <p className="t-small mt-2" style={{ color: "var(--ink-muted)" }}>
          No matched cases were exported for this animal.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {animals.slice(0, 3).map((animal) => (
            <li
              key={animal.animal_id}
              className="flex items-center gap-3 border p-3"
              style={{
                borderColor: "var(--border-hairline)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-card)",
              }}
            >
              <MonogramTile name={animal.name} size={40} />
              <div className="min-w-0">
                <p className="t-small truncate" style={{ color: "var(--ink-primary)" }}>
                  {animal.name ?? "Unnamed"}
                  <span className="t-caption ml-2 font-mono" style={{ color: "var(--ink-muted)" }}>
                    {animal.animal_id}
                  </span>
                </p>
                <p className="t-caption truncate" style={{ color: "var(--ink-secondary)" }}>
                  {animal.breed}
                </p>
                <p className="t-small tabular" style={{ color: "var(--ink-secondary)" }}>
                  {`${animal.outcome} after ${formatDays(animal.days_to_outcome, 0)}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default SimilarAnimals;
