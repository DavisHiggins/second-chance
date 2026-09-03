import type { InterventionChannel } from "@/lib/shelter.server";
import type { CurrentStay } from "@/lib/austin/current-inventory";

/**
 * Which outreach channel to suggest for one animal.
 *
 * These rules are not model output and are not presented as such. They are a
 * short, readable triage policy over facts already on the record, written down
 * in one place so the planner and the queue suggest the same thing and so a
 * shelter can disagree with a specific rule rather than with a black box.
 *
 * The ordering matters: a sick senior needs the vet before it needs a weekend
 * event, so condition is tested before life stage.
 */

export const CHANNEL_MEDICAL = "medical and behaviour support";
export const CHANNEL_FOSTER = "foster recruitment";
export const CHANNEL_SENIOR = "senior adoption event";
export const CHANNEL_EVENT = "adoption event";
export const CHANNEL_PHOTOGRAPHY = "photography";
export const CHANNEL_SOCIAL = "social media";

/** Intake conditions that describe an animal needing care before exposure. */
const NEEDS_CARE = ["injured", "sick", "med attn", "medical", "med urgent", "behavior"];

/** Conditions describing an animal too young to be adopted from the shelter. */
const NEEDS_FOSTER = ["neonate", "neonatal", "nursing", "pregnant"];

function matches(value: string | null, needles: string[]): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

export interface ChannelSuggestion {
  channel: string;
  /** Why this animal landed on this channel, shown next to the suggestion. */
  reason: string;
}

export function suggestChannel(stay: CurrentStay): ChannelSuggestion {
  if (matches(stay.condition, NEEDS_CARE)) {
    return {
      channel: CHANNEL_MEDICAL,
      reason: "Arrived needing medical or behaviour attention, which is the strongest measured brake on a fast exit.",
    };
  }

  if (matches(stay.condition, NEEDS_FOSTER) || stay.lifeStage === "juvenile") {
    return {
      channel: CHANNEL_FOSTER,
      reason: "Young enough that a foster placement is the usual route to adoption in this data.",
    };
  }

  if (stay.lifeStage === "senior") {
    return {
      channel: CHANNEL_SENIOR,
      reason: "Seniors are the slowest life stage in this dataset and need outreach aimed at them.",
    };
  }

  if (stay.daysInCare >= 60) {
    return {
      channel: CHANNEL_EVENT,
      reason: "Past 60 days in care, so the priority is putting this animal in front of new traffic.",
    };
  }

  if (stay.daysInCare >= 21) {
    return {
      channel: CHANNEL_PHOTOGRAPHY,
      reason: "Waiting long enough that the listing itself is the cheapest thing left to improve.",
    };
  }

  return {
    channel: CHANNEL_SOCIAL,
    reason: "Recent arrival: low-cost reach first, before spending scarce staff hours.",
  };
}

/** Resolves a suggestion against the channel catalogue, tolerating a channel
 *  that has been renamed or removed from the fixture. */
export function resolveChannel(
  channels: readonly InterventionChannel[],
  name: string,
): InterventionChannel | undefined {
  return channels.find((channel) => channel.channel === name);
}
