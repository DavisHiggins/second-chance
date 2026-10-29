"use client";

import { useEffect, useRef } from "react";
import StatTile, { type StatTileData } from "@/components/dashboard/StatTile";
import RevealSection, { RevealItem } from "@/components/motion/RevealSection";

/**
 * The headline figures. Each "What this means" opens on its own tile only,
 * and opening one never moves or resizes the others.
 *
 * The grid aligns tiles to the top rather than stretching them, so a tile
 * that opens grows downward alone. To keep the closed tiles of a row the
 * same height without stretching, the upper part of each tile (label,
 * figure, sparkline) is given the natural height of the tallest one in its
 * row. That height does not depend on the disclosures, so opening or closing
 * one leaves every other tile exactly as it was.
 */
export function StatTileGrid({ tiles }: { tiles: StatTileData[] }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = rootRef.current?.firstElementChild;
    if (!(grid instanceof HTMLElement)) return;
    const items = Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
    const heads = items.map((item) => item.querySelector<HTMLElement>("[data-tile-head]"));

    // The head's own content, without the min-height this effect applies.
    const naturalHeight = (head: HTMLElement): number =>
      Array.from(head.children).reduce((sum, child) => {
        const el = child as HTMLElement;
        return sum + el.offsetHeight + parseFloat(getComputedStyle(el).marginTop || "0");
      }, 0);

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Tiles share a row when their grid cells start at the same offset.
        const rows = new Map<number, HTMLElement[]>();
        items.forEach((item, index) => {
          const head = heads[index];
          if (!head) return;
          const row = rows.get(item.offsetTop) ?? [];
          row.push(head);
          rows.set(item.offsetTop, row);
        });
        rows.forEach((row) => {
          const tallest = Math.max(...row.map(naturalHeight));
          row.forEach((head) => {
            head.style.minHeight = `${Math.ceil(tallest)}px`;
          });
        });
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(grid);
    heads.forEach((head) => {
      if (!head) return;
      Array.from(head.children).forEach((child) => observer.observe(child));
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tiles]);

  return (
    <div ref={rootRef}>
      <RevealSection
        as="div"
        className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Headline figures"
      >
        {tiles.map((tile, index) => (
          <RevealItem key={tile.id} index={index}>
            <StatTile tile={tile} />
          </RevealItem>
        ))}
      </RevealSection>
    </div>
  );
}

export default StatTileGrid;
