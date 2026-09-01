import type { RiskBand } from "@/types/api";

/**
 * The band comes from the API. One place owns the thresholds, and it is not the
 * client. The band below "warning" uses a categorical slot rather than a status
 * colour because it is not a status: it is the absence of one.
 */
const BAND_COLOR: Record<RiskBand, string> = {
  critical: "var(--status-critical)",
  serious: "var(--status-serious)",
  warning: "var(--status-warning)",
  ok: "var(--series-3)",
};

export const BAND_LABEL: Record<RiskBand, string> = {
  critical: "Critical",
  serious: "Serious",
  warning: "Warning",
  ok: "Lower risk",
};

export function riskColor(band: RiskBand): string {
  return BAND_COLOR[band] ?? BAND_COLOR.ok;
}

export function RiskBar({ band, hovered = false }: { band: RiskBand; hovered?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 self-stretch rounded-[var(--radius-full)]"
      style={{
        width: hovered ? 6 : 4,
        background: riskColor(band),
        transition: "width var(--dur-instant) var(--ease-out)",
      }}
    />
  );
}

export default RiskBar;
