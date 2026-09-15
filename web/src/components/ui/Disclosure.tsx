import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A native `<details>` disclosure with the product's summary styling.
 *
 * Native on purpose: it works before hydration, with the keyboard, and with
 * every screen reader, and it costs no JavaScript. Used for "What this
 * means" under a figure, for advanced detail on the model page, and for the
 * metric guide in the drawer.
 */
export function Disclosure({
  summary,
  children,
  compact = false,
  defaultOpen = false,
  className = "",
  id,
}: {
  summary: string;
  children: ReactNode;
  compact?: boolean;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <details className={`disclosure ${className}`} open={defaultOpen || undefined} id={id}>
      <summary>
        <span>{summary}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="disclosure__chevron" />
      </summary>
      <div className={compact ? "pb-2 pt-1" : "pt-2"}>{children}</div>
    </details>
  );
}

export default Disclosure;
