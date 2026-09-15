"use client";

import { useEffect, useRef, useState } from "react";
import { DASHBOARD } from "@/lib/content";
import { formatCount } from "@/lib/format";
import CountUp from "@/components/dashboard/CountUp";
import RevealText from "@/components/motion/RevealText";
import MagneticButton from "@/components/motion/MagneticButton";
import { ButtonLink } from "@/components/ui/Button";
import type { DataMode } from "@/lib/austin/status";

/**
 * The dashboard hero.
 *
 * The H1, the purpose sentence and both actions are in the initial HTML; the
 * masked line reveal attaches to that existing text on the client rather
 * than creating it. The open-stay count sits in a panel beside the headline
 * because a headline about live shelter data needs its provenance in the
 * same glance; the fuller source strip follows directly beneath.
 *
 * The contour drift behind the hero runs only while the section is in view
 * and only above tablet width; the CSS handles reduced motion.
 */
const STATUS_LINE: Record<DataMode, string> = {
  live: "Live Austin feed",
  delayed: "Austin feed delayed",
  unavailable: "Live data unavailable",
  historical_demo: "Historical demonstration",
};

export function DashboardHero({ openStays, mode }: { openStays: number; mode: DataMode }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(node);
    const onVisibility = () => setInView(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section
      ref={ref}
      className="hero-surface"
      data-drift="true"
      data-inview={inView}
      aria-labelledby="dashboard-heading"
      style={{ borderRadius: "var(--radius-xl)", padding: "clamp(28px, 4vw, 56px) clamp(20px, 3vw, 40px)" }}
    >
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <p className="t-overline">{DASHBOARD.eyebrow}</p>

          <RevealText
            as="h1"
            id="dashboard-heading"
            className="t-hero mt-3 max-w-[18ch]"
            style={{ color: "var(--brand-band-ink)" }}
          >
            {DASHBOARD.heroHeadline}
          </RevealText>

          <p className="t-lede mt-5 max-w-[54ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
            {DASHBOARD.heroBody}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <MagneticButton>
              <ButtonLink href="/queue" variant="band" arrow>
                {DASHBOARD.heroPrimary}
              </ButtonLink>
            </MagneticButton>
            <ButtonLink href="/model" variant="band-outline">
              {DASHBOARD.heroSecondary}
            </ButtonLink>
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
            {`${formatCount(openStays)} cat and dog stays with an open intake record and no matched outcome. Not a roster of adoptable animals.`}
          </p>
        </div>
      </div>
    </section>
  );
}

export default DashboardHero;
