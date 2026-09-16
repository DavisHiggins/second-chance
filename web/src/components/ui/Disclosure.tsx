import { ChevronDown } from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";

/**
 * A native `<details>` disclosure with the product's summary styling.
 *
 * Native on purpose: it works before hydration, with the keyboard, and with
 * every screen reader, and it costs no JavaScript. Used for "What this
 * means" under a figure, for advanced detail on the model page, and for the
 * metric guide in the drawer.
 *
 * Pass `open` and `onToggle` to control it from outside, for example when a
 * row of figures should open and close together.
 */
export function Disclosure({
  summary,
  children,
  compact = false,
  defaultOpen = false,
  className = "",
  id,
  open,
  onToggle,
}: {
  summary: string;
  children: ReactNode;
  compact?: boolean;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const controlled = open !== undefined;
  const handleToggle = onToggle
    ? (event: SyntheticEvent<HTMLDetailsElement>) => onToggle(event.currentTarget.open)
    : undefined;
  return (
    <details
      className={`disclosure ${className}`}
      open={controlled ? open : defaultOpen || undefined}
      onToggle={handleToggle}
      id={id}
    >
      <summary>
        <span>{summary}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="disclosure__chevron" />
      </summary>
      <div className={compact ? "pb-2 pt-1" : "pt-2"}>{children}</div>
    </details>
  );
}

export default Disclosure;
