import type { Metadata } from "next";
import { ABOUT } from "@/lib/content";
import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import AnimatedDivider from "@/components/motion/AnimatedDivider";
import RevealSection, { RevealItem } from "@/components/motion/RevealSection";
import RevealText from "@/components/motion/RevealText";
import AboutHero from "@/components/about/AboutHero";

export const metadata: Metadata = {
  title: ABOUT.pageTitle,
  description:
    "A predictive analytics project built at UNC Charlotte to help animal shelter teams make better use of their data.",
};

/**
 * About: project origin, the team, national applicability and limits.
 *
 * The copy is the approved draft, unchanged. Four names, equal weight, one
 * shared descriptor, no invented roles or biographies. The "how another
 * shelter could use this approach" sequence is explicitly a future
 * adaptation; there is no sign-up and nothing to connect.
 */
export default function AboutPage() {
  return (
    <div className="space-y-12 pb-6">
      <AboutHero />

      <AnimatedDivider number="01" label="Why we chose this project" />
      <RevealSection className="mx-auto max-w-[68ch]">
        <RevealText as="h2" className="t-display" style={{ color: "var(--ink-primary)" }} animateOnScroll>
          {ABOUT.whyHeading}
        </RevealText>
        <RevealItem index={1}>
          <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
            {ABOUT.whyBody}
          </p>
        </RevealItem>
      </RevealSection>

      <AnimatedDivider number="02" label="Built by our team" id="team" />
      <RevealSection as="div" className="mx-auto max-w-[68ch]">
        <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {ABOUT.teamHeading}
        </h2>
        <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
          {ABOUT.teamBody}
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Team">
          {ABOUT.team.map((name, index) => (
            <RevealItem key={name} as="li" index={index} className="h-full">
              <Card as="div" className="flex h-full items-center gap-4" style={{ padding: "var(--space-4)" }}>
                <span
                  aria-hidden="true"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-semibold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  {name
                    .split(" ")
                    .map((part) => part.charAt(0))
                    .join("")}
                </span>
                <span>
                  <span className="t-subtitle block" style={{ color: "var(--ink-primary)" }}>
                    {name}
                  </span>
                  <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
                    {ABOUT.teamDescriptor}
                  </span>
                </span>
              </Card>
            </RevealItem>
          ))}
        </ul>
      </RevealSection>

      <AnimatedDivider number="03" label="Beyond Austin" />
      <RevealSection className="mx-auto max-w-[68ch]">
        <RevealText as="h2" className="t-display" style={{ color: "var(--ink-primary)" }} animateOnScroll>
          {ABOUT.austinHeading}
        </RevealText>
        {ABOUT.austinBody.map((paragraph, index) => (
          <RevealItem key={paragraph.slice(0, 32)} index={index + 1}>
            <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
              {paragraph}
            </p>
          </RevealItem>
        ))}
      </RevealSection>

      <AnimatedDivider number="04" label="How another shelter could use this approach" />
      <RevealSection as="div">
        <div className="mx-auto max-w-[68ch]">
          <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
            {ABOUT.approachHeading}
          </h2>
          <p className="t-small mt-3" style={{ color: "var(--ink-muted)" }}>
            {ABOUT.approachNote}
          </p>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ABOUT.approachSteps.map((step, index) => (
            <RevealItem key={step.title} as="li" index={index} className="h-full">
              <Card as="div" className="h-full" style={{ padding: "var(--space-4)" }}>
                <p className="t-caption tabular" style={{ color: "var(--accent-strong)" }}>
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="t-subtitle mt-1" style={{ color: "var(--ink-primary)" }}>
                  {step.title}
                </p>
                <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
                  {step.body}
                </p>
              </Card>
            </RevealItem>
          ))}
        </ol>
      </RevealSection>

      <AnimatedDivider number="05" label="What the project can and cannot do" />
      <RevealSection className="mx-auto max-w-[68ch]">
        <h2 className="t-display" style={{ color: "var(--ink-primary)" }}>
          {ABOUT.canHeading}
        </h2>
        <Card className="mt-5" surface="sunken" elevation={0} style={{ padding: "var(--space-5)", borderLeft: "3px solid var(--accent)" }}>
          <p className="t-body" style={{ color: "var(--ink-primary)" }}>
            {ABOUT.canBody}
          </p>
        </Card>
        <p className="t-small mt-5" style={{ color: "var(--ink-muted)" }}>
          {ABOUT.licenseNote}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary" arrow>
            {ABOUT.ctaDashboard}
          </ButtonLink>
          <ButtonLink href="/model" variant="secondary">
            {ABOUT.ctaModel}
          </ButtonLink>
        </div>
      </RevealSection>
    </div>
  );
}
