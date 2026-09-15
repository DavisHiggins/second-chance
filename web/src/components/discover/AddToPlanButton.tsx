"use client";

import { Plus } from "lucide-react";
import { DETAIL } from "@/lib/content";
import { usePlanPicks } from "@/lib/planPicks";
import Button from "@/components/ui/Button";

/** "Add to outreach plan" on a record page. Saved on this device only. */
export function AddToPlanButton({ episodeId, name }: { episodeId: string; name: string }) {
  const picks = usePlanPicks();
  const inPlan = picks.has(episodeId);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={inPlan ? "secondary" : "primary"}
        success={inPlan}
        onClick={() => picks.toggle(episodeId)}
        aria-pressed={inPlan}
        aria-label={`${inPlan ? DETAIL.inPlan : DETAIL.addToPlan}: ${name}`}
      >
        {inPlan ? null : <Plus size={16} strokeWidth={2} aria-hidden="true" />}
        {inPlan ? DETAIL.inPlan : DETAIL.addToPlan}
      </Button>
      <span className="t-caption" style={{ color: "var(--ink-muted)" }}>
        Saved on this device only.
      </span>
    </span>
  );
}

export default AddToPlanButton;
