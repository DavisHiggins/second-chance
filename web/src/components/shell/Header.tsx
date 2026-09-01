"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Menu, Moon, Rows3, Rows4, Sun, X } from "lucide-react";
import { NAV, SHELL } from "@/lib/content";
import { DUR, EASE_OUT } from "@/lib/motion";
import FreshnessChip from "@/components/shell/FreshnessChip";
import { usePreferences } from "@/components/shell/Preferences";

/** The lockup is the logo itself, not a redrawing of it: the mark from
 *  `logo.png`, and the wordmark set two-tone the way the file sets it —
 *  "Second" in the ink, "Chance" in the brand teal. The two <Image> tags are a
 *  light and a dark cut of the same mark; CSS in globals.css shows exactly one,
 *  driven by the same `data-theme` the bootstrap script sets before paint, so
 *  neither the wrong cut nor a flash of both ever reaches the screen. */
function Wordmark() {
  const label = SHELL.wordmark;
  const split = label.indexOf("Chance");
  const first = split > 0 ? label.slice(0, split) : label;
  const second = split > 0 ? label.slice(split) : "";
  return (
    <Link
      href="/"
      aria-label={label}
      className="t-subtitle inline-flex shrink-0 items-center gap-2 font-semibold"
    >
      <Image
        src="/logo-mark.png"
        alt=""
        width={218}
        height={214}
        priority
        className="brand-mark-light h-6 w-6 object-contain sm:h-7 sm:w-7"
      />
      <Image
        src="/logo-mark-dark.png"
        alt=""
        width={218}
        height={214}
        priority
        className="brand-mark-dark h-6 w-6 object-contain sm:h-7 sm:w-7"
      />
      <span aria-hidden="true">
        <span style={{ color: "var(--ink-primary)" }}>{first}</span>
        <span style={{ color: "var(--accent-strong)" }}>{second}</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="t-small relative rounded-[var(--radius-sm)] px-2 py-3"
            style={{ color: active ? "var(--ink-primary)" : "var(--ink-secondary)" }}
          >
            {item.label}
            {active ? (
              <motion.span
                layoutId="nav-underline"
                className="absolute inset-x-1 -bottom-px block h-0.5"
                style={{ background: "var(--accent)" }}
                transition={{ duration: DUR.base, ease: EASE_OUT }}
              />
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border sm:h-9 sm:w-9"
      style={{
        borderColor: "var(--border-hairline)",
        background: "var(--surface-card)",
        color: "var(--ink-secondary)",
      }}
    >
      {children}
    </button>
  );
}

export function Header({
  modelVersion,
  dataAsOf,
  usingFallback,
}: {
  modelVersion: string;
  dataAsOf: string;
  usingFallback: boolean;
}) {
  const { theme, density, setTheme, setDensity } = usePreferences();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-hairline)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
        <div className="sm:hidden">
          <IconButton
            label={drawerOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {drawerOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </IconButton>
        </div>
        <Wordmark />

        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          <NavLinks />
        </nav>

        <div className="flex-1" />

        <div className="hidden items-center gap-2 lg:flex">
          <FreshnessChip dataAsOf={dataAsOf} usingFallback={usingFallback} />
          <Link
            href="/model"
            className="t-caption rounded-[var(--radius-sm)] px-2 py-1 font-mono"
            style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
          >
            {`${SHELL.modelChipPrefix} ${modelVersion}`}
          </Link>
        </div>

        <IconButton
          label={`Density: ${density === "compact" ? SHELL.densityCompact : SHELL.densityComfortable}`}
          onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
        >
          {density === "compact" ? (
            <Rows4 size={20} strokeWidth={1.5} />
          ) : (
            <Rows3 size={20} strokeWidth={1.5} />
          )}
        </IconButton>
        <IconButton
          label={`Theme: ${theme === "dark" ? SHELL.themeDark : SHELL.themeLight}`}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Moon size={20} strokeWidth={1.5} />
          ) : (
            <Sun size={20} strokeWidth={1.5} />
          )}
        </IconButton>
      </div>

      {/* The stamps stay visible at every width; on small screens they move to
          their own row rather than hiding behind the drawer. */}
      <div
        className="flex flex-wrap items-center gap-2 border-t px-6 py-2 lg:hidden"
        style={{ borderColor: "var(--border-hairline)" }}
      >
        <FreshnessChip dataAsOf={dataAsOf} usingFallback={usingFallback} />
        <Link
          href="/model"
          className="t-caption rounded-[var(--radius-sm)] px-2 py-1 font-mono"
          style={{ background: "var(--surface-sunken)", color: "var(--ink-secondary)" }}
        >
          {`${SHELL.modelChipPrefix} ${modelVersion}`}
        </Link>
      </div>

      {drawerOpen ? (
        <motion.nav
          aria-label="Primary"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
          className="flex flex-col border-t px-6 py-2"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)" }}
        >
          <NavLinks onNavigate={() => setDrawerOpen(false)} />
        </motion.nav>
      ) : null}
    </header>
  );
}

export default Header;
