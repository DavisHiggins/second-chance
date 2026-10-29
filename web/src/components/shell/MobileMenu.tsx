"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Mail, Moon, Sun, X } from "lucide-react";
import { CONTACT, NAV, SHELL } from "@/lib/content";
import { useSmoothScroll } from "@/components/motion/SmoothScrollProvider";
import FreshnessChip from "@/components/shell/FreshnessChip";
import { usePreferences, type Theme } from "@/components/shell/Preferences";
import { InstagramIcon, LinkedInIcon } from "@/components/ui/SocialIcons";
import type { DataStatus } from "@/lib/austin/status";

/**
 * The menu sheet, opened from the header's menu button at every width.
 *
 * Adapted from the Animaster pack's layered wipe (Navigation Menus 18,
 * `files/script.js` and `styles.css`; see ATTRIBUTION.md): two colour layers
 * drop from the top edge one after the other, the navy sheet is uncovered
 * top to bottom behind them, and each link rises out of its own mask. Three
 * things changed:
 *
 * - The GSAP timeline became CSS transitions keyed on `data-open`, with the
 *   delays mirrored for closing, so open and close are one reversible state
 *   and a rapid double tap cannot leave it half open.
 * - It is a modal dialog: focus moves in, Tab is contained, Escape closes,
 *   the page behind is `inert`, and focus returns to the toggle on close.
 * - Links are interactive from the first frame. The rise is decoration on
 *   transform only, never a delay on pointer events.
 *
 * Contents: the eight destinations as one evenly spaced, numbered list (two
 * columns of four from `lg`), then a footer row with the data status, the
 * contact links and the theme switch, which lives here rather than in the
 * header row.
 *
 * Body and Lenis scrolling are stopped while it is open and released on
 * close, on navigation and on unmount, in that order of certainty. The sheet
 * itself does not scroll either: on short screens it gives up detail to fit.
 */
export function MobileMenu({
  open,
  onClose,
  toggleRef,
  status,
  onOpenDetails,
}: {
  open: boolean;
  onClose: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  status: DataStatus;
  onOpenDetails: () => void;
}) {
  const pathname = usePathname();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scroll = useSmoothScroll();
  const { theme, setTheme } = usePreferences();

  // Scroll lock, inert background, focus containment while open.
  useEffect(() => {
    if (!open) return;
    const main = document.getElementById("main");
    const footer = document.getElementById("site-footer");
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    document.body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    const blockScroll = (event: Event) => event.preventDefault();
    document.addEventListener("wheel", blockScroll, { passive: false });
    document.addEventListener("touchmove", blockScroll, { passive: false });
    scroll.stop();
    main?.setAttribute("inert", "");
    footer?.setAttribute("inert", "");
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("wheel", blockScroll);
      document.removeEventListener("touchmove", blockScroll);
      document.body.style.overflow = previousOverflow;
      root.style.overflow = previousRootOverflow;
      scroll.start();
      main?.removeAttribute("inert");
      footer?.removeAttribute("inert");
    };
  }, [open, onClose, scroll]);

  // Focus returns to the toggle once the sheet has closed. Kept separate from
  // the lock effect so it runs exactly once per close, rather than on every
  // re-render while open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // Synchronous on purpose: a deferred focus can be cancelled by a
    // re-render before it fires.
    toggleRef.current?.focus();
  }, [open, toggleRef]);

  // Navigating closes the sheet.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const contactLinks = [
    { label: CONTACT.emailLabel, href: `mailto:${CONTACT.email}`, external: false, icon: <Mail size={20} strokeWidth={1.75} aria-hidden="true" /> },
    { label: CONTACT.linkedin.label, href: CONTACT.linkedin.href, external: true, icon: <LinkedInIcon size={20} /> },
    { label: CONTACT.instagram.label, href: CONTACT.instagram.href, external: true, icon: <InstagramIcon size={20} /> },
    { label: "GitHub", href: "https://github.com/DavisHiggins/SecondChance", external: true, icon: <GitHubIcon /> },
  ];
  const themes: { value: Theme; label: string; icon: ReactNode }[] = [
    { value: "light", label: SHELL.themeLight, icon: <Sun size={16} strokeWidth={1.75} aria-hidden="true" /> },
    { value: "dark", label: SHELL.themeDark, icon: <Moon size={16} strokeWidth={1.75} aria-hidden="true" /> },
  ];
  const riseDelay = (index: number): CSSProperties => ({ "--rise-delay": `${0.36 + index * 0.04}s` }) as CSSProperties;

  return (
    <div
      ref={sheetRef}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label={SHELL.menuTitle}
      aria-hidden={!open}
      data-open={open}
      className="menu-sheet fixed inset-0 z-50 overflow-hidden overscroll-none"
      data-lenis-prevent=""
    >
      <span className="menu-sheet__layer menu-sheet__layer--1" aria-hidden="true" />
      <span className="menu-sheet__layer menu-sheet__layer--2" aria-hidden="true" />

      <div className="menu-sheet__panel brand-band flex h-full flex-col">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] shrink-0 items-center justify-between px-4 sm:px-6 lg:px-10">
          <span className="inline-flex items-center gap-2">
            <Image src="/logo-mark-dark.png" alt="" width={218} height={214} className="h-8 w-8 object-contain" />
            <span className="t-subtitle font-semibold" aria-hidden="true">
              <span style={{ color: "var(--brand-band-ink)" }}>Second</span>
              <span style={{ color: "var(--brand-band-accent)" }}>Chance</span>
            </span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={SHELL.closeMenu}
            title={SHELL.closeMenu}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
            style={{ borderColor: "var(--brand-band-hairline)", color: "var(--brand-band-ink)" }}
          >
            <X size={22} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <nav
          aria-label="Primary"
          className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col justify-center px-5 sm:px-8"
        >
          <ol className="menu-sheet__list">
            {NAV.map((item, index) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href} className="menu-sheet__row">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className="menu-sheet__link flex items-center"
                  >
                    <span className="menu-sheet__mask">
                      <span className="menu-sheet__rise flex items-baseline gap-4" style={riseDelay(index)}>
                        <span className="menu-sheet__num t-caption tabular w-6 shrink-0">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className="t-title block">{item.label}</span>
                          <span
                            className="menu-sheet__desc t-small block"
                            style={{ color: "var(--brand-band-ink-muted)" }}
                          >
                            {item.description}
                          </span>
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="border-t" style={{ borderColor: "var(--brand-band-hairline)" }}>
          <div className="menu-sheet__footer mx-auto grid w-full max-w-[1100px] items-start gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:px-8 sm:py-5">
            <div className="menu-sheet__fade min-w-0" style={riseDelay(NAV.length)}>
              <p className="t-overline mb-2">{SHELL.dataStatus}</p>
              <div className="flex min-h-11 items-center">
                <FreshnessChip status={status} onOpenDetails={onOpenDetails} onBand shortAge />
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 sm:contents">
              <div className="menu-sheet__fade" style={riseDelay(NAV.length + 1)}>
                <p className="t-overline mb-2">{SHELL.contactLinks}</p>
                <ul className="flex items-center gap-2" aria-label={SHELL.contactLinks}>
                  {contactLinks.map(({ label, href, external, icon }) => (
                    <li key={href}>
                      <a
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noreferrer noopener" : undefined}
                        aria-label={label}
                        title={label}
                        className="social-link inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
                        style={{ borderColor: "var(--brand-band-hairline)", color: "var(--brand-band-ink)" }}
                      >
                        {icon}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="menu-sheet__fade" style={riseDelay(NAV.length + 2)}>
                <p className="t-overline mb-2" id="menu-theme-label">
                  {SHELL.theme}
                </p>
                <div
                  role="group"
                  aria-labelledby="menu-theme-label"
                  className="inline-flex h-11 items-center gap-1 rounded-[var(--radius-full)] border p-1"
                  style={{ borderColor: "var(--brand-band-hairline)" }}
                >
                  {themes.map(({ value, label, icon }) => {
                    const selected = theme === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setTheme(value)}
                        title={label}
                        className="t-caption inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[var(--radius-full)] px-2.5 sm:px-3"
                        style={{
                          background: selected ? "var(--brand-band-accent)" : "transparent",
                          color: selected ? "var(--brand-navy-deep)" : "var(--brand-band-ink)",
                        }}
                      >
                        {icon}
                        {/* Icon-only on phones so contact and theme share one row. */}
                        <span className="sr-only sm:not-sr-only">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default MobileMenu;
