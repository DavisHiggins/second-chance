import Image from "next/image";
import { FOOTER, SHELL, USE_POLICY_FULL } from "@/lib/content";
import { ALL_DATASETS } from "@/lib/austin/datasets";

/**
 * The footer is the brand anchor: the navy band from the logo, carrying the
 * mark, the wordmark set the way the logo sets it, and the use policy
 * verbatim. It holds its colour in both themes on purpose: the header adapts
 * to the reader, the signature does not.
 */
export function Footer() {
  const split = SHELL.wordmark.indexOf("Chance");
  const first = split > 0 ? SHELL.wordmark.slice(0, split) : SHELL.wordmark;
  const second = split > 0 ? SHELL.wordmark.slice(split) : "";

  return (
    <footer className="brand-band mt-12">
      <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10">
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-8"
          style={{ borderColor: "var(--brand-band-hairline)" }}
        >
          {/* h-9 is 64px here, not 36px: @theme inline maps the numeric spacing
              utilities onto the design system's space scale. */}
          <Image
            src="/logo-mark-dark.png"
            alt=""
            width={218}
            height={214}
            className="h-9 w-9 shrink-0 object-contain"
          />
          <p className="t-title" aria-label={SHELL.wordmark}>
            <span aria-hidden="true">
              <span style={{ color: "var(--brand-band-ink)" }}>{first}</span>
              <span style={{ color: "var(--brand-band-accent)" }}>{second}</span>
            </span>
          </p>
          <p className="t-small max-w-[46ch]" style={{ color: "var(--brand-band-ink-muted)" }}>
            {FOOTER.bandLine}
          </p>
        </div>

        <div className="grid gap-8 pt-8 lg:grid-cols-3">
          <div>
            <h2 className="t-overline">{FOOTER.aboutHeading}</h2>
            <p className="t-small mt-3" style={{ color: "var(--brand-band-ink)" }}>
              {FOOTER.aboutBody}
            </p>
          </div>

          <div>
            <h2 className="t-overline">{FOOTER.sourcesHeading}</h2>
            {/* All four datasets, each labelled by role. The previous footer
                listed only the two archives, which stop in May 2025, plus a
                weather feed and an adoptable-listings service the product does
                not use. */}
            <ul className="mt-3 space-y-2">
              {ALL_DATASETS.map((dataset) => (
                <li key={dataset.id}>
                  <a
                    className="t-small underline underline-offset-2"
                    style={{ color: "var(--brand-band-ink)" }}
                    href={dataset.href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {dataset.label}
                  </a>
                  <span className="t-caption block" style={{ color: "var(--brand-band-ink-muted)" }}>
                    <span className="font-mono">{dataset.id}</span>
                    {dataset.refresh === "hourly"
                      ? " · current, refreshed hourly"
                      : " · archive, frozen at the May 2025 cutover"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-caption mt-3" style={{ color: "var(--brand-band-ink-muted)" }}>
              {FOOTER.sourcesNote}
            </p>
          </div>

          <div>
            <h2 className="t-overline">{FOOTER.policyHeading}</h2>
            <div className="mt-3 space-y-3">
              {USE_POLICY_FULL.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="t-small"
                  style={{ color: "var(--brand-band-ink)" }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
