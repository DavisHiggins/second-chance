"use client";

import { useEffect, useRef, useState } from "react";
import { IMPACT } from "@/lib/content";
import RevealText from "@/components/motion/RevealText";
import MagneticButton from "@/components/motion/MagneticButton";
import { ButtonLink } from "@/components/ui/Button";

/**
 * The Impact hero.
 *
 * The headline is the longest sentence in the product and it is deliberately
 * not shortened: "before they have to wait longer" is the whole argument, and
 * cutting it for rhythm would cut the point. It is in the initial HTML; the
 * masked line reveal attaches to it on the client.
 */
export function ImpactHero() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="hero-surface"
      data-drift="true"
      data-inview={inView}
      aria-labelledby="impact-heading"
      style={{ borderRadius: "var(--radius-xl)", padding: "clamp(32px, 5vw, 72px) clamp(20px, 3vw, 40px)" }}
    >
      <div className="mx-auto max-w-[72ch]">
        <p className="t-overline">{IMPACT.eyebrow}</p>

        <RevealText as="h1" id="impact-heading" className="t-hero mt-4" style={{ color: "var(--brand-band-ink)" }}>
          {IMPACT.headline}
        </RevealText>

        <p className="t-lede mt-6 max-w-[62ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
          {IMPACT.body}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <MagneticButton>
            <ButtonLink href="#three-uses" variant="band" arrow>
              {IMPACT.primaryAction}
            </ButtonLink>
          </MagneticButton>
          <ButtonLink href="/" variant="band-outline">
            {IMPACT.secondaryAction}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

export default ImpactHero;
