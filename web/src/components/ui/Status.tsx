import { AlertOctagon, AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StatusTone = "good" | "warning" | "serious" | "critical";

/**
 * Nothing important is carried by colour alone. Every status ships its icon and
 * a text label, so the whole interface survives greyscale.
 */
const TONES: Record<StatusTone, { icon: LucideIcon; color: string; label: string }> = {
  good: { icon: CheckCircle2, color: "var(--status-good)", label: "On track" },
  warning: { icon: AlertTriangle, color: "var(--status-warning)", label: "Warning" },
  serious: { icon: CircleAlert, color: "var(--status-serious)", label: "Serious" },
  critical: { icon: AlertOctagon, color: "var(--status-critical)", label: "Critical" },
};

export function statusColor(tone: StatusTone): string {
  return TONES[tone].color;
}

export function statusLabel(tone: StatusTone): string {
  return TONES[tone].label;
}

export function StatusIcon({
  tone,
  size = 16,
  label,
}: {
  tone: StatusTone;
  size?: number;
  label?: string;
}) {
  const Icon = TONES[tone].icon;
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      color={TONES[tone].color}
      aria-label={label ?? TONES[tone].label}
      role="img"
    />
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className="t-caption inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-1"
      style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
    >
      <StatusIcon tone={tone} size={14} />
      {children}
    </span>
  );
}

export default StatusIcon;
