"use client";

import { useState } from "react";
import StatTile, { type StatTileData } from "@/components/dashboard/StatTile";
import RevealSection, { RevealItem } from "@/components/motion/RevealSection";

/**
 * The headline figures share one "What this means" state: opening it on any
 * tile opens it on all four, so the explanations can be read side by side.
 */
export function StatTileGrid({ tiles }: { tiles: StatTileData[] }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <RevealSection as="div" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Headline figures">
      {tiles.map((tile, index) => (
        <RevealItem key={tile.id} index={index} className="h-full">
          <StatTile tile={tile} detailsOpen={detailsOpen} onDetailsToggle={setDetailsOpen} />
        </RevealItem>
      ))}
    </RevealSection>
  );
}

export default StatTileGrid;
