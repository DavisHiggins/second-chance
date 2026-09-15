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
 * Layout: logo left, navigation centre where it fits, one status control and
 * the theme switch right. The breakpoints follow the content: the four work
 * links and a "Learn" disclosure need about 1024px beside the logo and the
 * controls, so below `lg` the navigation lives in the mobile sheet, which
 * lists all seven destinations. Nothing is rendered twice: the sheet is the
 * only navigation below `lg`, and the chip in the header is the only status
 * control above it.
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
      className="t-small relative inline-flex h-11 items-center rounded-[var(--radius-sm)] px-2.5 font-medium transition-colors"
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
        className="t-small relative inline-flex h-11 items-center gap-1 rounded-[var(--radius-sm)] px-2.5 font-medium"
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

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {work.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(item.href, pathname)}
              />
            ))}
            <LearnMenu pathname={pathname} />
          </nav>

          <div className="flex-1" />

          {/* One status control per viewport: compact below md, full above. */}
          <div className="hidden md:block">
            <FreshnessChip status={status} onOpenDetails={openDetails} />
          </div>
          <div className="md:hidden">
            <FreshnessChip status={status} onOpenDetails={openDetails} compact />
          </div>

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
            className="burger rounded-[var(--radius-md)] border lg:hidden"
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
