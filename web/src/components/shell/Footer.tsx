import Image from "next/image";
import Link from "next/link";
import { CONTACT, FOOTER, NAV, SHELL } from "@/lib/content";
import { SOCRATA_DOMAIN } from "@/lib/austin/datasets";
import DataDetailsTrigger from "@/components/shell/DataDetailsTrigger";
import { InstagramIcon, LinkedInIcon } from "@/components/ui/SocialIcons";

/**
 * The footer is the brand anchor: the navy band from the logo, carrying the
 * mark and the wordmark set the way the logo sets it. It holds its colour in
 * both themes on purpose: the header adapts to the reader, the signature does
 * not.
 *
 * It is now concise. The full source list, dataset IDs and the responsible-
 * use policy moved to the data drawer, About, Impact and How it works, each
 * one click away from here, so the same three paragraphs no longer sit under
 * every table.
 */
export function Footer() {
  const split = SHELL.wordmark.indexOf("Chance");
  const first = split > 0 ? SHELL.wordmark.slice(0, split) : SHELL.wordmark;
  const second = split > 0 ? SHELL.wordmark.slice(split) : "";

  return (
    <footer id="site-footer" className="site-footer brand-band mt-12">
      <div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-3" aria-label={SHELL.wordmark}>
              <Image
                src="/logo-mark-dark.png"
                alt=""
                width={218}
                height={214}
                className="h-10 w-10 shrink-0 object-contain"
              />
              <span className="t-title" aria-hidden="true">
                <span style={{ color: "var(--brand-band-ink)" }}>{first}</span>
                <span style={{ color: "var(--brand-band-accent)" }}>{second}</span>
              </span>
            </p>
            <p className="t-small mt-4 max-w-[52ch]" style={{ color: "var(--brand-band-ink)" }}>
              {FOOTER.purpose}
            </p>
            <p className="t-small mt-4 max-w-[52ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
              {FOOTER.researchNote}{" "}
              <Link href="/impact#guardrail" className="underline underline-offset-2" style={{ color: "var(--brand-band-ink)" }}>
                {FOOTER.policyLink}
              </Link>
            </p>
          </div>

          <nav aria-label="Footer">
            <h2 className="t-overline">{FOOTER.navHeading}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="t-small inline-flex min-h-[32px] items-center underline-offset-2 hover:underline"
                    style={{ color: "var(--brand-band-ink)" }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="t-overline">{FOOTER.sourceHeading}</h2>
            <p className="t-small mt-3" style={{ color: "var(--brand-band-ink)" }}>
              <a
                className="underline underline-offset-2"
                href={`https://${SOCRATA_DOMAIN}/`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {FOOTER.sourceLink}
              </a>
            </p>
            <p className="t-caption mt-2 max-w-[40ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
              {FOOTER.sourceLine}
            </p>
            <DataDetailsTrigger
              className="t-small mt-3 inline-flex min-h-[36px] items-center rounded-[var(--radius-md)] border px-3 underline-offset-2 hover:underline"
              style={{ borderColor: "var(--brand-band-hairline)", color: "var(--brand-band-ink)" }}
            >
              {FOOTER.detailsAction}
            </DataDetailsTrigger>

            <h2 className="t-overline mt-8">{FOOTER.contactHeading}</h2>
            <ul className="mt-3 flex items-center gap-2" aria-label={FOOTER.contactHeading}>
              {[
                { ...CONTACT.linkedin, Icon: LinkedInIcon },
                { ...CONTACT.instagram, Icon: InstagramIcon },
              ].map(({ label, href, Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    title={label}
                    className="social-link inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
                    style={{ borderColor: "var(--brand-band-hairline)", color: "var(--brand-band-ink)" }}
                  >
                    <Icon size={20} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-6"
          style={{ borderColor: "var(--brand-band-hairline)" }}
        >
          <p className="t-small" style={{ color: "var(--brand-band-ink)" }}>
            {FOOTER.credit}
          </p>
          <p className="t-caption" style={{ color: "var(--brand-band-ink-muted)" }}>
            UNC Charlotte · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
