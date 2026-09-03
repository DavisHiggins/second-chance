"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";
import { IMPACT } from "@/lib/content";

const SplitTextReveal = dynamic(() => import("@/components/motion/SplitTextReveal"), {
  ssr: false,
  loading: () => null,
});

const MagneticButton = dynamic(() => import("@/components/motion/MagneticButton"), {
  ssr: false,
  loading: () => null,
});

/**
 * The Impact hero.
 *
 * The headline is the longest sentence in the product and it is deliberately
 * not shortened: "before they have to wait longer" is the whole argument, and
 * cutting it for rhythm would cut the point. The reveal is per-character, so
 * the animation is loaded dynamically and the text renders immediately without
 * it — the sentence has to be readable whether or not the animation arrives.
 */
export function ImpactHero() {
  return (
    <section
      className="hero-surface"
      style={{ borderRadius: "var(--radius-xl)", padding: "var(--space-9) var(--space-6)" }}
    >
      <div className="mx-auto max-w-[72ch]">
        <p className="t-overline">{IMPACT.eyebrow}</p>

        <SplitTextReveal stagger={0.012}>
          <h1 className="t-hero mt-4" style={{ color: "var(--brand-band-ink)" }}>
            {IMPACT.headline}
          </h1>
        </SplitTextReveal>

        <p className="t-body mt-6 max-w-[62ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
          {IMPACT.body}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <MagneticButton>
            <Link
              href="#how-it-helps"
              className="t-small inline-flex items-center gap-2 rounded-[var(--radius-md)] px-5 py-3 font-medium"
              style={{ background: "var(--brand-band-accent)", color: "#04212c" }}
            >
              {IMPACT.primaryAction}
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </MagneticButton>

          <Link
            href="/"
            className="t-small inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-5 py-3 font-medium"
            style={{ borderColor: "rgba(232, 240, 239, 0.32)", color: "var(--brand-band-ink)" }}
          >
            {IMPACT.secondaryAction}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default ImpactHero;
