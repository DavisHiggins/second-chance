import type { DataQualityRow } from "@/components/shell/DataDetails";
import type { ShelterView } from "@/lib/shelter.server";

/**
 * Turns the status object into the rows the data-details drawer shows.
 *
 * These are deliberately the unflattering numbers: outcomes that could not be
 * matched to an intake, joins that needed a tolerance, records that have been
 * open long enough to be suspect. A dashboard that only publishes the counts
 * that look tidy is how the previous version ended up presenting 250 fixture
 * rows as the current shelter without anybody noticing.
 */
export function buildQualityRows(view: ShelterView): DataQualityRow[] {
  const { status } = view;

  const rows: DataQualityRow[] = [
    {
      label: "Open shelter stays",
      value: status.currentEpisodeCount,
      note: "Cats and dogs with an intake and no recorded outcome. Inferred, not an official roster.",
    },
    {
      label: "Ambiguous joins",
      value: status.ambiguousEpisodeCount,
      note: "An outcome named an intake time that did not match exactly. Excluded from every count on this site.",
    },
    {
      label: "Outcomes with no matching intake",
      value: status.orphanedOutcomeCount,
      note: "Almost all are animals admitted before the May 2025 cutover and released after it. Their intake lives in the frozen archive under a different ID format and cannot be joined.",
    },
  ];

  const stale = view.stays.filter((stay) => stay.possiblyStale).length;
  if (stale > 0) {
    rows.push({
      label: "Possibly stale open records",
      value: stale,
      note: "Open for more than a year. Some are genuine long stays; some are records Austin has not closed. Counted, and flagged wherever they appear.",
    });
  }

  const unscored = view.unscored.reduce((total, row) => total + row.count, 0);
  if (unscored > 0) {
    rows.push({
      label: "Stays with no prediction",
      value: unscored,
      note: "The model declined to score these rather than return an invented number. Reasons are listed below.",
    });
  }

  return rows;
}
