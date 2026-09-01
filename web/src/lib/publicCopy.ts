import { formatAge, formatDate, formatLabel } from "@/lib/format";
import type { QueueAnimal } from "@/types/api";

/**
 * Copy for the public-facing route. Every sentence is composed from fields that
 * exist on the record: nothing here is invented, and nothing here mentions the
 * model, a score, a probability or a risk band. A member of the public does not
 * need to be told an animal is statistically unlikely to be adopted, and that
 * framing hurts the animal.
 */

const LIFE_STAGE: Record<string, string> = {
  neonate: "a newborn",
  puppy_kitten: "a puppy or kitten",
  juvenile: "a youngster",
  young_adult: "a young adult",
  adult: "an adult",
  senior: "a senior",
};

const INTAKE_PHRASE: Record<string, string> = {
  Stray: "arrived as a stray",
  "Owner Surrender": "was surrendered by an owner",
  "Public Assist": "came in through a public assist call",
  "Wildlife": "came in through animal services",
  Abandoned: "was found abandoned",
  Euthanasia_Request: "came in through animal services",
};

export function publicSentence(animal: QueueAnimal): string {
  const stage = LIFE_STAGE[animal.age_band] ?? "an animal";
  const intake = INTAKE_PHRASE[animal.intake_type] ?? "came into the shelter";
  return `${stage} ${animal.breed.toLowerCase()} who ${intake} in ${formatDate(
    animal.intake_datetime,
  )}.`;
}

export function currentAge(animal: QueueAnimal): number {
  return animal.age_at_intake_days + animal.days_in_care;
}

export function publicFacts(animal: QueueAnimal): Array<[string, string]> {
  return [
    ["Species", animal.animal_type],
    ["Breed", animal.breed],
    ["Age", formatAge(currentAge(animal))],
    ["Life stage", formatLabel(animal.age_band)],
    ["Sex", animal.sex_upon_intake],
    ["Colour", animal.color],
    ["Arrived", formatDate(animal.intake_datetime)],
  ];
}
