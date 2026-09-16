"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CONTACT } from "@/lib/content";
import RevealText from "@/components/motion/RevealText";

/**
 * The Contact hero: the dog mark, the page title and one intro paragraph on
 * the navy ground the other story pages use.
 */
export function ContactHero() {
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
      aria-labelledby="contact-heading"
      style={{ borderRadius: "var(--radius-xl)", padding: "clamp(32px, 5vw, 72px) clamp(20px, 3vw, 40px)" }}
    >
      <div className="mx-auto grid max-w-[80ch] gap-8 md:grid-cols-[auto_1fr] md:items-start">
        <Image
          src="/logo-mark-dark.png"
          alt=""
          width={218}
          height={214}
          priority
          className="h-20 w-20 object-contain md:h-28 md:w-28"
        />
        <div>
          <p className="t-overline">{CONTACT.eyebrow}</p>
          <RevealText as="h1" id="contact-heading" className="t-hero mt-3" style={{ color: "var(--brand-band-ink)" }}>
            {CONTACT.headline}
          </RevealText>
          <p className="t-lede mt-5 max-w-[62ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
            {CONTACT.intro}
          </p>
        </div>
      </div>
    </section>
  );
}

export default ContactHero;
