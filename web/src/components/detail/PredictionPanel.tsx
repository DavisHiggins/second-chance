import { DETAIL } from "@/lib/content";
import { USE_POLICY_SHORT } from "@/lib/content";
import { formatDays, formatInTen, formatPercent, NOT_MEASURED } from "@/lib/format";
import SurvivalCurve from "@/components/charts/SurvivalCurve";
import type { AnimalDetail } from "@/types/api";

function Horizon({
  label,
  value,
  interval,
}: {
  label: string;
  value: number | null;
  interval?: [number, number];
}) {
  return (
    <div>
      <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
        {label}
      </p>
      <p className="t-title tabular mt-1" style={{ color: "var(--ink-primary)" }}>
        {formatPercent(value)}
      </p>
      <p className="t-caption tabular" style={{ color: "var(--ink-secondary)" }}>
        {interval
          ? `${formatPercent(interval[0])} to ${formatPercent(interval[1])}`
          : "interval not measured"}
      </p>
    </div>
  );
}

export function PredictionPanel({ animal }: { animal: AnimalDetail }) {
  const inTen = formatInTen(animal.p_adopt_30d);

  return (
    <section
      className="border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--card-padding)",
      }}
    >
      <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
        {DETAIL.predictionTitle}
      </h2>
      <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
        {animal.interval ? DETAIL.intervalNote : "This export does not carry per-animal intervals."}
      </p>

      <div className="mt-4 flex flex-wrap gap-8">
        <Horizon label="Adopted within 7 days" value={animal.p_adopt_7d} />
        <Horizon
          label="Adopted within 14 days"
          value={animal.p_adopt_14d}
        />
        <Horizon
          label="Adopted within 30 days"
          value={animal.p_adopt_30d}
          interval={animal.interval?.p_adopt_30d}
        />
        <div>
          <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
            Expected days in care
          </p>
          <p className="t-title tabular mt-1" style={{ color: "var(--ink-primary)" }}>
            {formatDays(animal.expected_days_in_shelter, 1)}
          </p>
          <p className="t-caption tabular" style={{ color: "var(--ink-secondary)" }}>
            {animal.interval?.expected_days_in_shelter
              ? `${formatDays(animal.interval.expected_days_in_shelter[0], 1)} to ${formatDays(
                  animal.interval.expected_days_in_shelter[1],
                  1,
                )}`
              : "interval not measured"}
          </p>
        </div>
      </div>

      {animal.confidence === "low" ? (
        <p
          className="t-small mt-4 rounded-[var(--radius-md)] px-3 py-2"
          style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
        >
          {DETAIL.lowConfidenceCaveat}
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
          {DETAIL.curveTitle}
        </h3>
        <div className="mt-3">
          <SurvivalCurve points={animal.survival_curve} />
        </div>
        <p className="t-body mt-3" style={{ color: "var(--ink-secondary)" }}>
          {inTen
            ? `About ${inTen} animals like this one go home within 30 days.`
            : `Thirty-day adoption chance is ${NOT_MEASURED} for this animal.`}
        </p>
      </div>

      <p
        className="t-caption mt-6 border-t pt-3"
        style={{ borderColor: "var(--border-hairline)", color: "var(--ink-muted)" }}
      >
        {USE_POLICY_SHORT}
      </p>
    </section>
  );
}

export default PredictionPanel;
