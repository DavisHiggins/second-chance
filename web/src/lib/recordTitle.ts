/**
 * The document title for one animal's record.
 *
 * Derived from the resolved name and animal id, never from the last segment
 * of the episode id: that segment is an intake timestamp, and "Record
 * 00.000" is what a title made from it looks like. The composite episode id
 * stays in the URL so deep links keep working; it just never becomes a title.
 */
export function recordTitle(name: string | null | undefined, animalId: string): string {
  const cleaned = (name ?? "").trim();
  return cleaned ? `${cleaned} · Animal ${animalId}` : `Animal ${animalId}`;
}

/** Where a visitor came from, for the breadcrumb. Anything else is "records". */
export type RecordOrigin = "queue" | "records" | "dashboard" | "planner";

export function resolveOrigin(value: string | string[] | undefined): RecordOrigin {
  const first = Array.isArray(value) ? value[0] : value;
  switch (first) {
    case "queue":
    case "dashboard":
    case "planner":
      return first;
    default:
      return "records";
  }
}
