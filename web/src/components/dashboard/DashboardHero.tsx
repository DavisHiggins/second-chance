"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";
import { DASHBOARD } from "@/lib/content";
import { formatCount, formatDateTime } from "@/lib/format";
import CountUp from "@/components/dashboard/CountUp";
import type { DataMode } from "@/lib/austin/status";
import { useEffect, useState } from "react";

/**
 * The dashboard hero.
 *
 * Two things are load-bearing here. The mission statement is the first thing a
 * visitor reads, and the data status sits directly beneath it rather than
 * being tucked into the header, because a headline about live shelter data
 * needs its provenance in the same glance.
 *
 * The GSAP text reveal is loaded dynamically. It costs about 40KB and it is
 * decoration; the heading renders immediately as plain text and the animation
 * attaches when it arrives, so nothing about reading this page waits on it.
 */
const SplitTextReveal = dynamic(() => import("@/components/motion/SplitTextReveal"), {
  ssr: false,
  loading: () => null,
});

const MagneticButton = dynamic(() => import("@/components/motion/MagneticButton"), {
  ssr: false,
  loading: () => null,
});

const STATUS_LINE: Record<DataMode, string> = {
  live: "Live Austin feed",
  delayed: "Austin feed delayed",
  unavailable: "Live data unavailable",
  historical_demo: "Historical demonstration",
};

export function DashboardHero({
  openStays,
  mode,
  updatedAt,
}: {
  openStays: number;
  mode: DataMode;
  updatedAt: string | null;
}) {
  // Formatting the timestamp on the client keeps the server render from
  // baking in a reading that is stale before it arrives.
  const [stamp, setStamp] = useState<string | null>(null);
  useEffect(() => {
    setStamp(updatedAt ? formatDateTime(updatedAt) : null);
  }, [updatedAt]);

  return (
    <section
      className="hero-surface"
      style={{ borderRadius: "var(--radius-xl)", padding: "var(--space-8) var(--space-6)" }}
    >
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <p className="t-overline">{DASHBOARD.eyebrow}</p>

          <SplitTextReveal>
            <h1 className="t-hero mt-3 max-w-[18ch]" style={{ color: "var(--brand-band-ink)" }}>
              {DASHBOARD.heroHeadline}
            </h1>
          </SplitTextReveal>

          <p
            className="t-body mt-4 max-w-[54ch]"
            style={{ color: "var(--brand-band-ink-muted)" }}
          >
            {DASHBOARD.heroBody}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <MagneticButton>
              <Link
                href="/queue"
                className="t-small inline-flex items-center gap-2 rounded-[var(--radius-md)] px-5 py-3 font-medium"
                style={{ background: "var(--brand-band-accent)", color: "#04212c" }}
              >
                {DASHBOARD.heroPrimary}
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </MagneticButton>

            <Link
              href="/impact"
              className="t-small inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-5 py-3 font-medium"
              style={{
                borderColor: "rgba(232, 240, 239, 0.32)",
                color: "var(--brand-band-ink)",
              }}
            >
              {DASHBOARD.heroSecondary}
            </Link>
          </div>
        </div>

        <div className="hero-panel" style={{ padding: "var(--space-5)" }}>
          <p className="t-overline">{STATUS_LINE[mode]}</p>

          <p className="t-hero tabular mt-3" style={{ color: "var(--brand-band-ink)" }}>
            <CountUp value={openStays} id="hero-open-stays" />
          </p>
          <p className="t-subtitle" style={{ color: "var(--brand-band-ink)" }}>
            {DASHBOARD.openStaysLabel}
          </p>

          <p className="t-caption mt-4" style={{ color: "var(--brand-band-ink-muted)" }}>
            {stamp ? `Source updated ${stamp}. ` : ""}
            {`${formatCount(openStays)} cat and dog stays with an open intake record.`}
          </p>
        </div>
      </div>
    </section>
  );
}

export default DashboardHero;
