/**
 * What a prediction is allowed to mean for an animal that is already here.
 *
 * Both model targets are answered at intake: "will this stay run past 60
 * days" and "will this animal be adopted by day 30, counting from arrival".
 * They are not re-asked each morning. So for an animal that has already
 * waited 299 days, a 71% long-stay estimate is not a forecast of the next two
 * months; the event it describes has already happened. This module decides
 * which of three honest states a row is in, and every surface that shows a
 * probability reads it from here rather than improvising.
 *
 * Client-safe: no server imports, no model artifact.
 */

export const LONG_STAY_HORIZON_DAYS = 60;
export const ADOPTION_HORIZON_DAYS = 30;

export type WaitStatus =
  /** The stay has already exceeded the long-stay horizon. Lead with the fact. */
  | "already_past_horizon"
  /** An intake-time estimate is available and the horizon has not yet passed. */
  | "estimate"
  /** No prediction; the row is described by its wait alone. */
  | "unavailable";

export interface HorizonSummary {
  status: WaitStatus;
  /** Days waited so far, as of the snapshot. */
  daysInCare: number;
  /** Days remaining until the long-stay horizon; zero once it has passed. */
  daysToHorizon: number;
  /** The headline a row should lead with. */
  headline: string;
  /** One sentence naming what the number is and when it was computed. */
  estimateNote: string | null;
  /** True when the 30-day adoption estimate refers to a window already over. */
  adoptionWindowPassed: boolean;
}

export function describeHorizon(input: {
  daysInCare: number;
  pLongStay60d: number | null;
  scoring: boolean;
}): HorizonSummary {
  const daysToHorizon = Math.max(0, LONG_STAY_HORIZON_DAYS - input.daysInCare);
  const adoptionWindowPassed = input.daysInCare > ADOPTION_HORIZON_DAYS;
  const hasEstimate = input.scoring && input.pLongStay60d !== null;

  if (input.daysInCare > LONG_STAY_HORIZON_DAYS) {
    return {
      status: "already_past_horizon",
      daysInCare: input.daysInCare,
      daysToHorizon: 0,
      headline: `Already waiting over ${LONG_STAY_HORIZON_DAYS} days`,
      estimateNote: hasEstimate
        ? `At intake the model estimated a ${formatPercentPlain(
            input.pLongStay60d as number,
          )} chance this stay would pass ${LONG_STAY_HORIZON_DAYS} days. It has. The estimate is kept for context, not as a forecast of what happens next.`
        : null,
      adoptionWindowPassed,
    };
  }

  if (!hasEstimate) {
    return {
      status: "unavailable",
      daysInCare: input.daysInCare,
      daysToHorizon,
      headline: `Waiting ${input.daysInCare} ${input.daysInCare === 1 ? "day" : "days"}`,
      estimateNote: null,
      adoptionWindowPassed,
    };
  }

  return {
    status: "estimate",
    daysInCare: input.daysInCare,
    daysToHorizon,
    headline: `Intake-time estimate: ${formatPercentPlain(
      input.pLongStay60d as number,
    )} chance of a stay past ${LONG_STAY_HORIZON_DAYS} days`,
    estimateNote: `Estimated from what was known on arrival. ${daysToHorizon} ${
      daysToHorizon === 1 ? "day" : "days"
    } remain before this stay reaches ${LONG_STAY_HORIZON_DAYS} days.`,
    adoptionWindowPassed,
  };
}

function formatPercentPlain(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Outreach triage bands, in words that describe what to do rather than how
 * alarmed to be. Thresholds are the model registry's and are unchanged; only
 * the labels moved. "Critical" implied medical urgency, which an intake-time
 * probability cannot support.
 */
export const TRIAGE_LABEL = {
  critical: "Priority outreach",
  serious: "Elevated",
  warning: "Worth a look",
  ok: "Typical",
} as const;

export const TRIAGE_THRESHOLDS = {
  critical: 0.6,
  serious: 0.4,
  warning: 0.25,
} as const;

export const TRIAGE_DEFINITION =
  "Bands group intake-time long-stay estimates for outreach triage: Priority outreach at 60% and above, Elevated at 40%, Worth a look at 25%. They are not medical urgency and do not change what care an animal receives.";
