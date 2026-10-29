"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { NAV, SHELL } from "@/lib/content";
import { DUR, EASE_OUT } from "@/lib/motion";
import FreshnessChip from "@/components/shell/FreshnessChip";
import DataDetails, { type DataQualityRow } from "@/components/shell/DataDetails";
import MobileMenu from "@/components/shell/MobileMenu";
import { useDataDetails } from "@/components/shell/Providers";
import type { DataStatus } from "@/lib/austin/status";
import type { MetricDefinition } from "@/lib/austin/metrics";

/**
 * The header.
 *
 * Layout: the logo on the left; the status chip, the GitHub link and the
 * menu button on the right; the navigation between them, with an equal
 * flexible spacer on each side. The links therefore sit exactly halfway
 * between the logo and the status chip at every width, whatever the chip's
 * age text happens to say. The links are about 625px on one line, so they
 * appear from `xl`; below it the menu sheet is the navigation.
 *
 * The menu button is shown at every width. It opens the sheet that holds all
 * eight destinations, the data status, the contact links and the theme
 * switch, which is why the theme switch no longer sits in the row.
 *
 * The chip carries its age in short form ("Live Austin feed · 12 min ago"),
 * counted on the client, so the feed reads as live rather than as a static
 * label. Below `md` it drops the label and keeps the icon and the age. Every
 * label in the row is `whitespace-nowrap`: a header that wraps is a header
 * that is out of room, and that should be fixed with a breakpoint, not
 * absorbed by a second line.
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
      className="t-subtitle inline-flex h-11 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] font-semibold"
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
        <div className="mx-auto flex h-16 max-w-[1440px] items-center px-4 sm:px-6 lg:px-10">
          <Wordmark />

          {/* Equal spacers either side of the links centre them between the
              logo and the status chip. */}
          <span className="min-w-3 flex-1" aria-hidden="true" />
          <nav aria-label="Primary" className="hidden shrink-0 items-center gap-0.5 xl:flex">
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
          <span className="min-w-3 flex-1" aria-hidden="true" />

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* One status control per viewport: icon and age below md, the
                label and its age from md. */}
            <div className="whitespace-nowrap md:hidden">
              <FreshnessChip status={status} onOpenDetails={openDetails} compact shortAge />
            </div>
            <div className="hidden whitespace-nowrap md:block">
              <FreshnessChip status={status} onOpenDetails={openDetails} shortAge />
            </div>

            <a
              href="https://github.com/DavisHiggins/SecondChance"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SecondChance on GitHub"
              title="SecondChance on GitHub"
              className="hidden h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border sm:inline-flex"
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
              ref={toggleRef}
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? SHELL.closeMenu : SHELL.openMenu}
              title={SHELL.openMenu}
              className="burger rounded-[var(--radius-md)] border"
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
