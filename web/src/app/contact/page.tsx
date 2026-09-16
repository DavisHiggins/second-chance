import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { CONTACT } from "@/lib/content";
import Card from "@/components/ui/Card";
import { InstagramIcon, LinkedInIcon } from "@/components/ui/SocialIcons";
import AnimatedDivider from "@/components/motion/AnimatedDivider";
import RevealSection, { RevealItem } from "@/components/motion/RevealSection";
import RevealText from "@/components/motion/RevealText";
import ContactHero from "@/components/contact/ContactHero";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: CONTACT.pageTitle,
  description: "Questions about SecondChance? Reach out by email, LinkedIn or Instagram, or send a message.",
};

const SOCIALS = [
  { ...CONTACT.linkedin, Icon: LinkedInIcon },
  { ...CONTACT.instagram, Icon: InstagramIcon },
] as const;

/**
 * Contact: one address, two profiles, and a draft box that opens the reader's
 * mail app. There is no server side to this page; nothing is collected.
 */
export default function ContactPage() {
  return (
    <div className="space-y-12 pb-6">
      <ContactHero />

      <AnimatedDivider number="01" label={CONTACT.reachHeading} id="reach" />
      <RevealSection as="div" className="mx-auto max-w-[68ch]">
        <RevealText as="h2" className="t-display" style={{ color: "var(--ink-primary)" }} animateOnScroll>
          {CONTACT.reachHeading}
        </RevealText>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <RevealItem index={1} className="h-full">
            <Card as="div" className="flex h-full flex-col justify-between" style={{ padding: "var(--space-5)" }}>
              <div>
                <p className="t-overline" style={{ color: "var(--ink-muted)" }}>
                  {CONTACT.emailLabel}
                </p>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="t-subtitle mt-2 inline-flex items-center gap-2 underline-offset-4 hover:underline"
                  style={{ color: "var(--ink-primary)" }}
                >
                  <Mail size={18} strokeWidth={1.5} aria-hidden="true" color="var(--accent-strong)" />
                  {CONTACT.email}
                </a>
              </div>
              <p className="t-caption mt-4" style={{ color: "var(--ink-muted)" }}>
                {CONTACT.emailNote}
              </p>
            </Card>
          </RevealItem>
          <RevealItem index={2} className="h-full">
            <Card as="div" className="flex h-full flex-col justify-between" style={{ padding: "var(--space-5)" }}>
              <div>
                <p className="t-overline" style={{ color: "var(--ink-muted)" }}>
                  {CONTACT.socialLabel}
                </p>
                <ul className="mt-2 flex items-center gap-2" aria-label={CONTACT.socialLabel}>
                  {SOCIALS.map(({ label, href, Icon }) => (
                    <li key={href}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={label}
                        title={label}
                        className="social-link inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border"
                        style={{ borderColor: "var(--border-hairline)", color: "var(--accent-strong)" }}
                      >
                        <Icon size={22} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="t-caption mt-4" style={{ color: "var(--ink-muted)" }}>
                {CONTACT.socialNote}
              </p>
            </Card>
          </RevealItem>
        </div>
      </RevealSection>

      <AnimatedDivider number="02" label={CONTACT.formHeading} id="message" />
      <RevealSection as="div" className="mx-auto max-w-[68ch]">
        <RevealText as="h2" className="t-display" style={{ color: "var(--ink-primary)" }} animateOnScroll>
          {CONTACT.formHeading}
        </RevealText>
        <RevealItem index={1} className="mt-6">
          <ContactForm />
        </RevealItem>
      </RevealSection>
    </div>
  );
}
