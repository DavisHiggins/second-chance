import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Check } from "lucide-react";
import { IMPACT, USE_POLICY_FULL } from "@/lib/content";
import Card from "@/components/ui/Card";
import ImpactHero from "@/components/impact/ImpactHero";
import AnimatedDivider from "@/components/motion/AnimatedDivider";
import RevealSection, { RevealItem } from "@/components/motion/RevealSection";
import RevealText from "@/components/motion/RevealText";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: IMPACT.pageTitle,
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
 * is what it will never be used to justify. Project origin and the team live
 * on About; this page owns use and potential benefit.
 */
export default function ImpactPage() {
  return (
    <div className="space-y-12 pb-6">
      <ImpactHero />

      <AnimatedDivider number="01" label="The problem" />
      <RevealSection className="mx-auto max-w-[68ch]">
        <RevealText as="h2" className="t-display" style={{ color: "var(--ink-primary)" }} animateOnScroll>
          {IMPACT.problemHeading}
        </RevealText>
        {IMPACT.problemBody.map((paragraph, index) => (
          <RevealItem key={paragraph.slice(0, 40)} index={index + 1}>
            <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
              {paragraph}
            </p>
          </RevealItem>
        ))}
      </RevealSection>

      <AnimatedDivider number="02" label="Three concrete uses" id="three-uses" />
      <RevealSection as="div">
        <h2 className="t-display mx-auto max-w-[68ch]" style={{ color: "var(--ink-primary)" }}>
          {IMPACT.threeUsesHeading}
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {IMPACT.threeUses.map((use, index) => (
            <RevealItem key={use.title} as="li" index={index} className="h-full">
              <Card className="h-full" style={{ padding: "var(--space-5)" }}>
                <p className="t-caption tabular" style={{ color: "var(--accent-strong)" }}>
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="t-subtitle mt-1" style={{ color: "var(--ink-primary)" }}>
                  {use.title}
                </h3>
                <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
                  {use.body}
                </p>
              </Card>
            </RevealItem>
          ))}
        </ol>
      </RevealSection>

      <AnimatedDivider number="03" label="What the data shows" />
      <section
        className="section-tint -mx-4 px-4 py-10 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        <RevealSection as="div" className="mx-auto max-w-[68ch]">
          <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {IMPACT.dataHeading}
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
            {IMPACT.dataIntro}
          </p>

          <ul className="mt-6 space-y-3">
            {IMPACT.dataItems.map((item, index) => (
              <RevealItem key={item} as="li" index={index} className="flex items-start gap-3">
                <Check size={18} strokeWidth={1.75} color="var(--accent-strong)" aria-hidden="true" className="mt-1 shrink-0" />
                <span className="t-body" style={{ color: "var(--ink-primary)" }}>
                  {item}
                </span>
              </RevealItem>
            ))}
          </ul>

          <Card className="mt-8" surface="raised" style={{ padding: "var(--space-5)", borderLeft: "3px solid var(--accent-warm)" }}>
            <p className="t-overline" style={{ color: "var(--accent-warm-strong)" }}>
              What this data does not say
            </p>
            <p className="t-body mt-2" style={{ color: "var(--ink-primary)" }}>
              {IMPACT.dataAccuracyNote}
            </p>
          </Card>
        </RevealSection>
      </section>

      <AnimatedDivider number="04" label="How a shelter can use it" id="how-it-helps" />
      <RevealSection as="div">
        <div className="mx-auto max-w-[68ch]">
          <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {IMPACT.useHeading}
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {IMPACT.useItems.map((item, index) => (
            <RevealItem key={item.title} as="article" index={index} className="h-full">
              <Card className="h-full" as="div" style={{ padding: "var(--space-5)" }}>
                <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                  {item.title}
                </h3>
                <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
                  {item.body}
                </p>
              </Card>
            </RevealItem>
          ))}
        </div>

        <Card className="mx-auto mt-8 max-w-[68ch]" surface="sunken" elevation={0} style={{ padding: "var(--space-5)" }}>
          <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
            {IMPACT.potentialHeading}
          </h3>
          <p className="t-small mt-2" style={{ color: "var(--ink-secondary)" }}>
            {IMPACT.potentialBody}
          </p>
        </Card>
      </RevealSection>

      <AnimatedDivider number="05" label="Beyond Austin" />
      <RevealSection className="mx-auto max-w-[68ch]">
        <RevealText as="h2" className="t-display" style={{ color: "var(--ink-primary)" }} animateOnScroll>
          {IMPACT.nationalHeading}
        </RevealText>
        {IMPACT.nationalBody.map((paragraph, index) => (
          <RevealItem key={paragraph.slice(0, 40)} index={index + 1}>
            <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
              {paragraph}
            </p>
          </RevealItem>
        ))}
      </RevealSection>

      <section
        className="hero-surface"
        aria-labelledby="mission-heading"
        style={{ borderRadius: "var(--radius-xl)", padding: "clamp(32px, 5vw, 64px) clamp(20px, 3vw, 40px)" }}
      >
        <div className="mx-auto max-w-[62ch]">
          <p className="t-overline">Our mission</p>
          <RevealText as="h2" id="mission-heading" className="t-hero mt-3" style={{ color: "var(--brand-band-ink)" }} animateOnScroll>
            {IMPACT.missionHeading}
          </RevealText>
          <p className="t-lede mt-5" style={{ color: "var(--brand-band-ink-muted)" }}>
            {IMPACT.missionBody}
          </p>
        </div>
      </section>

      <AnimatedDivider number="06" label="The guardrail" id="guardrail" />
      <RevealSection className="mx-auto max-w-[68ch]">
        <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {IMPACT.guardrailHeading}
        </h2>

        <ul className="mt-6 space-y-3">
          {IMPACT.guardrailItems.map((item, index) => (
            <RevealItem
              key={item}
              as="li"
              index={index}
              className="flex items-start gap-3 border p-4"
              style={{
                background: "var(--surface-card)",
                borderColor: "var(--border-hairline)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <Ban size={18} strokeWidth={1.75} color="var(--status-critical)" aria-hidden="true" className="mt-1 shrink-0" />
              <span className="t-body" style={{ color: "var(--ink-primary)" }}>
                {item}
              </span>
            </RevealItem>
          ))}
        </ul>

        <div className="mt-8 space-y-3" id="use-policy">
          <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
            The full responsible-use policy
          </h3>
          {USE_POLICY_FULL.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className="t-body" style={{ color: "var(--ink-secondary)" }}>
              {paragraph}
            </p>
          ))}
        </div>
      </RevealSection>

      <AnimatedDivider number="07" label="Project context" />
      <RevealSection className="mx-auto max-w-[68ch]">
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
          <ButtonLink href="/" variant="primary" arrow>
            {IMPACT.secondaryAction}
          </ButtonLink>
          <ButtonLink href="/model" variant="secondary">
            How it works
          </ButtonLink>
          <Link href="/about" className="btn btn--ghost">
            {IMPACT.aboutLink}
          </Link>
        </div>
      </RevealSection>
    </div>
  );
}
