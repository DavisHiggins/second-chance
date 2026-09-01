"use client";

import { useState } from "react";
import { formatCount, formatPercent } from "@/lib/format";
import type { PopulationBand } from "@/lib/dataSource";

/**
 * A donut of the queue population by expected wait, drawn with the sequential
 * ramp so the ordering carries the magnitude. The legend direct-labels every
 * value, so the ramp never has to be read by eye.
 */
const RAMP = ["var(--ramp-250)", "var(--ramp-400)", "var(--ramp-550)", "var(--ramp-700)"];

const SIZE = 180;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 2px of surface colour between adjacent fills. */
const GAP = 2;

export function PopulationDonut({
  bands,
  total,
  title,
}: {
  bands: PopulationBand[];
  total: number;
  title: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const sum = bands.reduce((acc, band) => acc + band.count, 0) || 1;

  let offset = 0;
  const arcs = bands.map((band, index) => {
    const fraction = band.count / sum;
    const length = Math.max(0, fraction * CIRCUMFERENCE - GAP);
    const arc = {
      band,
      index,
      length,
      offset,
      color: RAMP[index] ?? RAMP[RAMP.length - 1],
      fraction,
    };
    offset += fraction * CIRCUMFERENCE;
    return arc;
  });

  const summary = `${title}. ${bands
    .map((band) => `${band.label}: ${formatCount(band.count)} animals`)
    .join(". ")}.`;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div role="img" aria-label={`Chart. ${summary}`} className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.band.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={hovered === arc.index ? STROKE + 4 : STROKE}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
                onMouseEnter={() => setHovered(arc.index)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: "stroke-width var(--dur-instant) var(--ease-out)" }}
              />
            ))}
          </g>
          <text
            x={SIZE / 2}
            y={SIZE / 2 - 2}
            textAnchor="middle"
            className="t-title tabular"
            fill="var(--ink-primary)"
          >
            {formatCount(total)}
          </text>
          <text
            x={SIZE / 2}
            y={SIZE / 2 + 16}
            textAnchor="middle"
            className="t-caption"
            fill="var(--ink-muted)"
          >
            in the queue
          </text>
        </svg>
      </div>

      <ul className="min-w-[180px] flex-1 space-y-2">
        {arcs.map((arc) => (
          <li
            key={arc.band.label}
            className="flex items-center justify-between gap-3"
            onMouseEnter={() => setHovered(arc.index)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ background: arc.color }}
              />
              <span className="t-small" style={{ color: "var(--ink-secondary)" }}>
                {arc.band.label}
              </span>
            </span>
            <span className="t-small tabular" style={{ color: "var(--ink-primary)" }}>
              {formatCount(arc.band.count)}
              <span className="t-caption ml-1.5" style={{ color: "var(--ink-muted)" }}>
                {formatPercent(arc.fraction)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PopulationDonut;
