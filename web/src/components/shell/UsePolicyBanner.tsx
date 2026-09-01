import { Info } from "lucide-react";
import { USE_POLICY_SHORT } from "@/lib/content";

/**
 * Present on the dashboard, the queue and the planner, directly under the page
 * title. Static, always visible, not dismissible. It does not animate: see
 * ANIMATION_SPEC section 12.
 */
export function UsePolicyBanner() {
  return (
    <div
      className="t-small flex items-start gap-2 rounded-[var(--radius-md)] px-4 py-2.5"
      style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
    >
      <Info size={20} strokeWidth={1.5} aria-hidden="true" className="mt-px shrink-0" />
      <p>{USE_POLICY_SHORT}</p>
    </div>
  );
}

export default UsePolicyBanner;
