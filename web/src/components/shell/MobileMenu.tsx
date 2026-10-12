"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { NAV, SHELL } from "@/lib/content";
import { useSmoothScroll } from "@/components/motion/SmoothScrollProvider";
import FreshnessChip from "@/components/shell/FreshnessChip";
import type { DataStatus } from "@/lib/austin/status";

/**
 * The mobile navigation sheet.
 *
 * Adapted from the Animaster pack's ink-blot menu (Navigation Menus 10,
 * `files/script.js` and `style.css`; see ATTRIBUTION.md): a circular
 * clip-path grows from the toggle button until it covers the viewport, and
 * the links rise in behind it with a short stagger. Three things changed:
 *
 * - The blot is a CSS transition on a custom property rather than a GSAP
 *   proxy tween, so opening and closing are one reversible transition and a
 *   rapid double tap cannot leave it half open.
 * - It is a modal dialog: focus moves in, Tab is contained, Escape closes,
 *   the page behind is `inert`, and focus returns to the toggle on close.
 * - Links are interactive from the first frame. The stagger is decoration on
 *   opacity and transform only, never a delay on pointer events.
 *
 * Body and Lenis scrolling are stopped while it is open and released on
 * close, on navigation and on unmount, in that order of certainty. The sheet
 * itself does not scroll either: no scrollbar, and wheel and touch-drag
 * gestures are swallowed until it closes.
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

  // Origin of the reveal: the centre of the toggle, so the sheet opens from
  // the thing that was pressed. Recomputed at each open in case of a resize.
  useEffect(() => {
    const sheet = sheetRef.current;
    const toggle = toggleRef.current;
    if (!sheet || !toggle || !open) return;
    const rect = toggle.getBoundingClientRect();
    sheet.style.setProperty("--menu-x", `${rect.left + rect.width / 2}px`);
    sheet.style.setProperty("--menu-y", `${rect.top + rect.height / 2}px`);
  }, [open, toggleRef]);

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
  // the lock effect so it runs exactly once per close, after the sheet is
  // hidden, rather than on every re-render while open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // Synchronous on purpose: the sheet is already hidden in this commit, and
    // a deferred focus can be cancelled by a re-render before it fires.
    toggleRef.current?.focus();
  }, [open, toggleRef]);

  // Navigating closes the sheet.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const work = NAV.filter((item) => item.group === "work");
  const learn = NAV.filter((item) => item.group === "learn");
  const contact = NAV.filter((item) => item.group === "contact");

  return (
    <div
      ref={sheetRef}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label={SHELL.menuTitle}
      aria-hidden={!open}
      data-open={open}
      className="menu-sheet brand-band fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-none"
      style={{ pointerEvents: open ? "auto" : "none", visibility: open ? "visible" : "hidden" }}
      data-lenis-prevent=""
    >
      <div className="flex items-center justify-between px-5 py-3">
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border"
          style={{ borderColor: "var(--brand-band-hairline)", color: "var(--brand-band-ink)" }}
        >
          <X size={22} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Primary" className="menu-sheet__nav flex-1 px-5 pb-6 pt-2">
        <MenuGroup items={work} startIndex={0} pathname={pathname} onNavigate={onClose} heading="Work" />
        <MenuGroup
          items={learn}
          startIndex={work.length}
          pathname={pathname}
          onNavigate={onClose}
          heading={SHELL.learnGroup}
        />
        <MenuGroup
          items={contact}
          startIndex={work.length + learn.length}
          pathname={pathname}
          onNavigate={onClose}
          heading={contact[0]?.label ?? "Contact"}
        />
      </nav>

      <div
        className="menu-sheet__item border-t px-5 py-4"
        style={{ borderColor: "var(--brand-band-hairline)", transitionDelay: open ? "0.5s" : "0s" }}
      >
        <p className="t-overline mb-2">{SHELL.dataStatus}</p>
        <FreshnessChip status={status} onOpenDetails={onOpenDetails} onBand />
      </div>
    </div>
  );
}

function MenuGroup({
  items,
  startIndex,
  pathname,
  onNavigate,
  heading,
}: {
  items: readonly (typeof NAV)[number][];
  startIndex: number;
  pathname: string;
  onNavigate: () => void;
  heading: string;
}) {
  return (
    <div className="menu-sheet__group mt-4">
      <p className="t-overline menu-sheet__item mb-1" style={{ transitionDelay: `${0.18 + startIndex * 0.05}s` }}>
        {heading}
      </p>
      <ol className="divide-y" style={{ borderColor: "var(--brand-band-hairline)" }}>
        {items.map((item, index) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const n = startIndex + index + 1;
          return (
            <li
              key={item.href}
              className="menu-sheet__item"
              style={{ transitionDelay: `${0.22 + n * 0.05}s` }}
            >
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className="menu-sheet__link flex items-baseline gap-4 py-3.5"
                style={{ color: active ? "var(--brand-band-accent)" : "var(--brand-band-ink)" }}
              >
                <span className="t-caption tabular w-6 shrink-0" style={{ color: "var(--brand-band-ink-muted)" }}>
                  {String(n).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="t-title block">{item.label}</span>
                  <span className="menu-sheet__desc t-small block" style={{ color: "var(--brand-band-ink-muted)" }}>
                    {item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default MobileMenu;
