"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { QUEUE } from "@/lib/content";
import { expandContent } from "@/lib/motion";
import { formatPercent } from "@/lib/format";
import DriverBars from "@/components/charts/DriverBars";
import SurvivalCurve from "@/components/charts/SurvivalCurve";
import InterventionCard from "@/components/queue/InterventionCard";
import type { InterventionChannel, QueueAnimal } from "@/types/api";

export function ExpandedCard({
  animal,
  channel,
}: {
  animal: QueueAnimal;
  channel: InterventionChannel | undefined;
}) {
  const horizons: Array<{ label: string; value: number | null }> = [
    { label: "7 days", value: animal.p_adopt_7d },
    { label: "14 days", value: animal.p_adopt_14d },
    { label: "30 days", value: animal.p_adopt_30d },
  ];

  return (
    <motion.div
      variants={expandContent}
      initial="hidden"
      animate="show"
      className="grid gap-6 border-t px-4 py-5 lg:grid-cols-2"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-card)" }}
    >
      <div>
        <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
          {QUEUE.headingDrivers}
        </h3>
        <div className="mt-3">
          <DriverBars drivers={animal.drivers} />
        </div>
      </div>

      <div>
        <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
          {QUEUE.headingHelp}
        </h3>
        <div className="mt-3">
          {channel ? (
            <InterventionCard channel={channel} />
          ) : (
            <p className="t-small" style={{ color: "var(--ink-muted)" }}>
              No channel was suggested for this animal.
            </p>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
          {QUEUE.headingWait}
        </h3>
        <dl className="mt-3 flex flex-wrap gap-6">
          {horizons.map((horizon) => (
            <div key={horizon.label}>
              <dt className="t-caption" style={{ color: "var(--ink-muted)" }}>
                {`Adopted within ${horizon.label}`}
              </dt>
              <dd className="t-title tabular" style={{ color: "var(--ink-primary)" }}>
                {formatPercent(horizon.value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4">
          <SurvivalCurve points={animal.survival_curve} />
        </div>
        <Link
          href={`/animals/${animal.animal_id}`}
          className="t-small mt-4 inline-block underline underline-offset-2"
          style={{ color: "var(--ink-secondary)" }}
        >
          {QUEUE.detailLink}
        </Link>
      </div>
    </motion.div>
  );
}

export default ExpandedCard;
