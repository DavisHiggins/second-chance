"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { NAV, SHELL } from "@/lib/content";
import { DUR, EASE_OUT } from "@/lib/motion";
import FreshnessChip from "@/components/shell/FreshnessChip";
import DataDetails, { type DataQualityRow } from "@/components/shell/DataDetails";
import MobileMenu from "@/components/shell/MobileMenu";
import { usePreferences } from "@/components/shell/Preferences";
import { useDataDetails } from "@/components/shell/Providers";
import type { DataStatus } from "@/lib/austin/status";
import type { MetricDefinition } from "@/lib/austin/metrics";

/**
 * The header.
 *
 * Layout: logo left, navigation centre where it fits, one status control,
 * the GitHub link and the theme switch right. The breakpoints follow the
 * content, measured rather than guessed: the four work links, "Learn" and
 * Contact are about 625px wide on one line, the logo 165px and the two icon
 * buttons 88px, so with the gaps the row needs about 1150px once the status
 * chip is added. Below `xl` the navigation lives in the mobile sheet, which
 * lists all eight destinations. Nothing is rendered twice: the sheet is the
 * only navigation below `xl`, and the chip in the header is the only status
 * control above it.
 *
 * The chip's age ("last published about 8 hours ago") is another 200px. It
 * is shown only where it fits on one line (`lg` to `xl`, where the burger
 * replaces the links); beside the full navigation the chip shows its label
 * alone and the age stays in its tooltip, screen-reader text and the data
 * drawer it opens. Every label in the row is `whitespace-nowrap`: a header
 * that wraps is a header that is out of room, and that should be fixed with a
 * breakpoint, not absorbed by a second line.
 *
 * The model version no longer occupies the main row. It is in the data
 * drawer and on How it works, where a version string has context.
 */

/** The lockup is the logo itself: the mark from `logo.png`, and the wordmark
 *  set two-tone the way the file sets it. Two cuts of the mark, one shown. */
function Wordmark() {
  const label = SHELL.wordmark;
  const split = label.indexOf("Chance");
  const first = split > 0 ? label.slice(0, split) : label;
  const second = split > 0 ? label.slice(split) : "";
  return (
    <Link
      href="/"
      aria-label={`${label} home`}
      className="t-subtitle inline-flex h-11 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] pr-1 font-semibold"
    >
      <Image
        src="/logo-mark.png"
        alt=""
        width={218}
        height={214}
        priority
        className="brand-mark-light h-8 w-8 object-contain"
      />
      <Image
        src="/logo-mark-dark.png"
        alt=""
        width={218}
        height={214}
        priority
        className="brand-mark-dark h-8 w-8 object-contain"
      />
      <span aria-hidden="true">
        <span style={{ color: "var(--ink-primary)" }}>{first}</span>
        <span style={{ color: "var(--accent-strong)" }}>{second}</span>
      </span>
    </Link>
  );
}

function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="t-small relative inline-flex h-11 items-center whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors"
      style={{ color: active ? "var(--ink-primary)" : "var(--ink-secondary)" }}
    >
      {label}
      {active ? (
        <motion.span
          layoutId="nav-underline"
          className="absolute inset-x-2.5 bottom-1 block h-0.5 rounded-full"
          style={{ background: "var(--accent)" }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
        />
      ) : null}
    </Link>
  );
}

/** "Learn" holds Impact, How it works and About. A real disclosure: button
 *  with aria-expanded and aria-controls, Escape closes, focus stays sane. */
function LearnMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const items = NAV.filter((item) => item.group === "learn");
  const groupActive = items.some((item) => isActive(item.href, pathname));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        (rootRef.current?.querySelector("button") as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="learn-menu"
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="t-small relative inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 font-medium"
        style={{ color: groupActive ? "var(--ink-primary)" : "var(--ink-secondary)" }}
      >
        {SHELL.learnGroup}
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
        />
        {groupActive ? (
          <motion.span
            layoutId="nav-underline"
            className="absolute inset-x-2.5 bottom-1 block h-0.5 rounded-full"
            style={{ background: "var(--accent)" }}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
          />
        ) : null}
      </button>
      <motion.ul
        id="learn-menu"
        role="list"
        initial={false}
        animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
        transition={{ duration: DUR.fast, ease: EASE_OUT }}
        className="absolute left-0 top-full z-50 mt-1 w-72 border p-1.5"
        style={{
          background: "var(--surface-raised)",
          borderColor: "var(--border-hairline)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--elev-3)",
          pointerEvents: open ? "auto" : "none",
          visibility: open ? "visible" : "hidden",
        }}
      >
        {items.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="block rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-[var(--surface-sunken)]"
              >
                <span className="t-small block font-medium" style={{ color: "var(--ink-primary)" }}>
                  {item.label}
                </span>
                <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
                  {item.description}
                </span>
              </Link>
            </li>
          );
        })}
      </motion.ul>
    </div>
  );
}

export function Header({
  status,
  definitions,
  quality,
  unscored,
}: {
  status: DataStatus;
  definitions: MetricDefinition[];
  quality: DataQualityRow[];
  unscored: { reason: string; count: number }[];
}) {
  const { theme, setTheme } = usePreferences();
  const { open: detailsOpen, openDetails, closeDetails } = useDataDetails();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const work = NAV.filter((item) => item.group === "work");
  const contact = NAV.filter((item) => item.group === "contact");

  return (
    <>
      <header
        className="site-header sticky top-0 z-40 border-b"
        data-scrolled={scrolled}
        style={{
          background: scrolled ? "color-mix(in srgb, var(--surface-card) 92%, transparent)" : "var(--surface-card)",
          backdropFilter: scrolled ? "blur(8px)" : undefined,
          borderColor: scrolled ? "var(--border-hairline)" : "transparent",
        }}
      >
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-10">
          <Wordmark />

          <nav aria-label="Primary" className="ml-4 hidden shrink-0 items-center gap-0.5 xl:flex">
            {work.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(item.href, pathname)}
              />
            ))}
            <LearnMenu pathname={pathname} />
            {contact.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(item.href, pathname)}
              />
            ))}
          </nav>

          <div className="flex-1" />

          {/* One status control per viewport: compact below md; the label
              alone where the navigation needs the room (md to lg, and from
              xl); the label and its age from lg to xl, where it fits. */}
          <div className="whitespace-nowrap md:hidden">
            <FreshnessChip status={status} onOpenDetails={openDetails} compact />
          </div>
          <div className="hidden whitespace-nowrap md:block lg:hidden xl:block">
            <FreshnessChip status={status} onOpenDetails={openDetails} showAge={false} />
          </div>
          <div className="hidden whitespace-nowrap lg:block xl:hidden">
            <FreshnessChip status={status} onOpenDetails={openDetails} />
          </div>

          <a
            href="https://github.com/DavisHiggins/SecondChance"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="SecondChance on GitHub"
            title="SecondChance on GitHub"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
            style={{
              borderColor: "var(--border-hairline)",
              background: "var(--surface-card)",
              color: "var(--ink-secondary)",
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </a>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? SHELL.themeLight : SHELL.themeDark} theme`}
            title={`Theme: ${theme === "dark" ? SHELL.themeDark : SHELL.themeLight}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
            style={{
              borderColor: "var(--border-hairline)",
              background: "var(--surface-card)",
              color: "var(--ink-secondary)",
            }}
          >
            {theme === "dark" ? (
              <Moon size={20} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Sun size={20} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? SHELL.closeMenu : SHELL.openMenu}
            className="burger rounded-[var(--radius-md)] border xl:hidden"
            style={{
              borderColor: "var(--border-hairline)",
              background: "var(--surface-card)",
              color: "var(--ink-primary)",
            }}
          >
            <span className="burger__line" aria-hidden="true" />
            <span className="burger__line" aria-hidden="true" />
          </button>
        </div>
      </header>

      <MobileMenu
        open={menuOpen}
        onClose={closeMenu}
        toggleRef={toggleRef}
        status={status}
        onOpenDetails={() => {
          closeMenu();
          openDetails();
        }}
      />

      {detailsOpen ? (
        <DataDetails
          status={status}
          definitions={definitions}
          quality={quality}
          unscored={unscored}
          onClose={closeDetails}
        />
      ) : null}
    </>
  );
}

export default Header;
