"use client";

import { useEffect, useState } from "react";
import { MODEL } from "@/lib/content";
import { useSmoothScroll } from "@/components/motion/SmoothScrollProvider";

export interface SectionLink {
  id: string;
  label: string;
}

/**
 * Table of contents for the long How-it-works page: a sticky list on
 * desktop, a select on small screens. The current section is the last one
 * whose top has passed a line a quarter of the way down the viewport, read
 * from the scroll position rather than from an IntersectionObserver: an
 * observer only reports the sections that crossed its band on a given
 * frame, so once the active section scrolled out and the next was already
 * inside, nothing fired and the highlight stuck. Jumps go through the
 * smooth-scroll provider so they are not abrupt where the rest of the page
 * is not.
 */
const ACTIVE_LINE = 0.25;

export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const scroll = useSmoothScroll();

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * ACTIVE_LINE;
      let current = sections[0]?.id ?? "";
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= line) current = section.id;
        else break;
      }
      // At the very bottom the last section may never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = sections[sections.length - 1]?.id ?? current;
      }
      setActive((previous) => (previous === current ? previous : current));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const jump = (id: string) => {
    const node = document.getElementById(id);
    if (!node) return;
    scroll.scrollTo(node, { offset: -88 });
    window.history.replaceState(window.history.state, "", `#${id}`);
  };

  return (
    <>
      <nav aria-label={MODEL.tocLabel} className="hidden lg:block">
        <p className="t-overline" style={{ color: "var(--ink-muted)" }}>
          {MODEL.tocLabel}
        </p>
        <ol className="mt-3 space-y-0.5 border-l" style={{ borderColor: "var(--border-hairline)" }}>
          {sections.map((section, index) => {
            const current = active === section.id;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    jump(section.id);
                  }}
                  aria-current={current ? "location" : undefined}
                  className="t-small -ml-px flex min-h-[36px] items-center gap-2 border-l-2 pl-3 transition-colors"
                  style={{
                    borderColor: current ? "var(--accent)" : "transparent",
                    color: current ? "var(--ink-primary)" : "var(--ink-secondary)",
                  }}
                >
                  <span className="t-caption tabular w-5" style={{ color: "var(--ink-muted)" }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <label className="block lg:hidden">
        <span className="field-label">{MODEL.tocLabel}</span>
        <select
          className="field w-full"
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
            jump(event.target.value);
          }}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export default SectionNav;
