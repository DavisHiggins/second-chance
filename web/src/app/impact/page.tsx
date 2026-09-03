import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Check } from "lucide-react";
import { IMPACT, USE_POLICY_FULL } from "@/lib/content";
import Card from "@/components/ui/Card";
import ImpactHero from "@/components/impact/ImpactHero";
import RevealList from "@/components/impact/RevealList";

export const metadata: Metadata = {
  title: "Impact",
  description:
    "Why SecondChance exists: helping shelter teams notice which animals may need extra attention early, and turn that into practical action.",
};

/**
 * The plain-English page.
 *
 * Everything else in this product is an instrument. This is the argument, and
 * it is written for somebody who has never seen a calibration curve: a shelter
 * volunteer, a prospective adopter, a reviewer. The copy is deliberately not
 * hedged into vagueness, and the guardrail section is not softened, because
 * the one thing a prediction tool in animal welfare must be unambiguous about
 * is what it will never be used to justify.
 */
export default function ImpactPage() {
  return (
    <div className="space-y-14 pb-6">
      <ImpactHero />

      {/* The problem */}
      <section className="mx-auto max-w-[68ch]">
        <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {IMPACT.problemHeading}
        </h2>
        {IMPACT.problemBody.map((paragraph) => (
          <p
            key={paragraph.slice(0, 40)}
            className="t-body mt-4"
            style={{ color: "var(--ink-secondary)" }}
          >
            {paragraph}
          </p>
        ))}
      </section>

      {/* What the data shows */}
      <section
        className="section-tint -mx-5 px-5 py-10 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        <div className="mx-auto max-w-[68ch]">
          <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {IMPACT.dataHeading}
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
            {IMPACT.dataIntro}
          </p>

          <RevealList className="mt-6 space-y-3">
            {IMPACT.dataItems.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check
                  size={18}
                  strokeWidth={1.75}
                  color="var(--accent-strong)"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
                <span className="t-body" style={{ color: "var(--ink-primary)" }}>
                  {item}
                </span>
              </li>
            ))}
          </RevealList>

          <Card
            className="mt-8"
            surface="raised"
            style={{ padding: "var(--space-5)", borderLeft: "3px solid var(--accent-warm)" }}
          >
            <p className="t-overline" style={{ color: "var(--accent-warm-strong)" }}>
              What this data does not say
            </p>
            <p className="t-body mt-2" style={{ color: "var(--ink-primary)" }}>
              {IMPACT.dataAccuracyNote}
            </p>
          </Card>
        </div>
      </section>

      {/* How a shelter can use it */}
      <section id="how-it-helps" className="scroll-mt-24">
        <div className="mx-auto max-w-[68ch]">
          <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {IMPACT.useHeading}
          </h2>
        </div>

        <RevealList className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" as="div">
          {IMPACT.useItems.map((item) => (
            <Card
              key={item.title}
              as="article"
              className="h-full"
              style={{ padding: "var(--space-5)" }}
            >
              <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                {item.title}
              </h3>
              <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
                {item.body}
              </p>
            </Card>
          ))}
        </RevealList>
      </section>

      {/* National applicability */}
      <section className="mx-auto max-w-[68ch]">
        <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {IMPACT.nationalHeading}
        </h2>
        {IMPACT.nationalBody.map((paragraph) => (
          <p
            key={paragraph.slice(0, 40)}
            className="t-body mt-4"
            style={{ color: "var(--ink-secondary)" }}
          >
            {paragraph}
          </p>
        ))}
      </section>

      {/* Mission */}
      <section
        className="hero-surface"
        style={{ borderRadius: "var(--radius-xl)", padding: "var(--space-8) var(--space-6)" }}
      >
        <div className="mx-auto max-w-[62ch]">
          <p className="t-overline">Our mission</p>
          <h2 className="t-hero mt-3" style={{ color: "var(--brand-band-ink)" }}>
            {IMPACT.missionHeading}
          </h2>
          <p className="t-body mt-5" style={{ color: "var(--brand-band-ink-muted)" }}>
            {IMPACT.missionBody}
          </p>
        </div>
      </section>

      {/* The guardrail */}
      <section className="mx-auto max-w-[68ch]">
        <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {IMPACT.guardrailHeading}
        </h2>

        <ul className="mt-6 space-y-3">
          {IMPACT.guardrailItems.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 border p-4"
              style={{
                background: "var(--surface-card)",
                borderColor: "var(--border-hairline)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <Ban
                size={18}
                strokeWidth={1.75}
                color="var(--status-critical)"
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              <span className="t-body" style={{ color: "var(--ink-primary)" }}>
                {item}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 space-y-3">
          {USE_POLICY_FULL.map((paragraph) => (
            <p
              key={paragraph.slice(0, 32)}
              className="t-small"
              style={{ color: "var(--ink-secondary)" }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Project context */}
      <section className="mx-auto max-w-[68ch] section-rule pt-10">
        <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
          {IMPACT.contextHeading}
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
          {IMPACT.contextBody}
        </p>
        <p className="t-small mt-4" style={{ color: "var(--ink-muted)" }}>
          {IMPACT.contextDataNote}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="t-small inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            {IMPACT.secondaryAction}
            <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link
            href="/model"
            className="t-small inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 font-medium"
            style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
          >
            How the model works
          </Link>
        </div>
      </section>
    </div>
  );
}
