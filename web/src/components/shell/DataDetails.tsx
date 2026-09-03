"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { SHELL } from "@/lib/content";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DUR, EASE_OUT } from "@/lib/motion";
import type { DataStatus } from "@/lib/austin/status";
import type { MetricDefinition } from "@/lib/austin/metrics";

/**
 * The data-details drawer: where every number on the site is defined.
 *
 * The handoff asks for a data dictionary the user can actually reach, and the
 * reason is the one this whole rebuild is about. A figure without its
 * definition invites the reader to assume the most flattering reading, and
 * "animals in care" is exactly the kind of phrase that quietly becomes
 * "animals you can adopt today" in someone's head. Every definition here also
 * says what it excludes, because that is usually the load-bearing half.
 */

export interface DataQualityRow {
  label: string;
  value: number;
  note: string;
}

export function DataDetails({
  status,
  definitions,
  quality,
  unscored,
  onClose,
}: {
  status: DataStatus;
  definitions: MetricDefinition[];
  quality: DataQualityRow[];
  unscored: { reason: string; count: number }[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the drawer on open and Escape closes it, so a keyboard
  // user is never stranded behind an overlay they cannot dismiss.
  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const current = status.sources.filter((source) => source.role === "current");
  const archive = status.sources.filter((source) => source.role === "archive");

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={SHELL.dataDetailsClose}
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(4, 29, 56, 0.45)" }}
        tabIndex={-1}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={SHELL.dataDetails}
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: DUR.base, ease: EASE_OUT }}
        className="relative flex h-full w-full max-w-[34rem] flex-col overflow-y-auto"
        style={{ background: "var(--surface-card)", borderLeft: "1px solid var(--border-hairline)" }}
      >
        <div
          className="sticky top-0 flex items-center justify-between border-b px-5 py-4"
          style={{ background: "var(--surface-card)", borderColor: "var(--border-hairline)" }}
        >
          <h2 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
            {SHELL.dataDetails}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={SHELL.dataDetailsClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border"
            style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
          >
            <X size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-7 px-5 py-5">
          {status.problem ? (
            <p
              className="t-small rounded-[var(--radius-md)] border p-3"
              style={{
                borderColor: "var(--status-warning)",
                background: "var(--surface-sunken)",
                color: "var(--ink-primary)",
              }}
            >
              {status.problem}
            </p>
          ) : null}

          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              Freshness
            </h3>
            <dl className="mt-3 space-y-2">
              <Row label="Intakes last published" value={fmt(status.intakesUpdatedAt)} />
              <Row label="Outcomes last published" value={fmt(status.outcomesUpdatedAt)} />
              <Row label="Retrieved by this site" value={fmt(status.retrievedAt)} />
            </dl>
          </section>

          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              Current feeds
            </h3>
            <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
              Refreshed hourly by the City of Austin. These are the only feeds behind any
              current figure on this site.
            </p>
            <ul className="mt-3 space-y-3">
              {current.map((source) => (
                <SourceRow key={source.id} {...source} />
              ))}
            </ul>
          </section>

          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              Archives
            </h3>
            <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
              Frozen at the 5 May 2025 ShelterBuddy cutover. Different schema, and a different
              animal ID format, so these cannot be joined to the current feeds.
            </p>
            <ul className="mt-3 space-y-3">
              {archive.map((source) => (
                <SourceRow key={source.id} {...source} />
              ))}
            </ul>
          </section>

          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              What each number counts
            </h3>
            <div className="mt-3 space-y-4">
              {definitions.map((definition) => (
                <div key={definition.id}>
                  <p className="t-small font-semibold" style={{ color: "var(--ink-primary)" }}>
                    {definition.label}
                  </p>
                  <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
                    {definition.definition}
                  </p>
                  <p className="t-caption mt-1" style={{ color: "var(--ink-muted)" }}>
                    {definition.exclusions}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              Data quality
            </h3>
            <table className="mt-3 w-full">
              <caption className="sr-only">Data quality counts for the current feeds</caption>
              <thead>
                <tr>
                  <th scope="col" className="t-caption pb-1 text-left" style={{ color: "var(--ink-muted)" }}>
                    Measure
                  </th>
                  <th scope="col" className="t-caption pb-1 text-right" style={{ color: "var(--ink-muted)" }}>
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {quality.map((row) => (
                  <tr key={row.label} className="border-t" style={{ borderColor: "var(--border-hairline)" }}>
                    <td className="py-2">
                      <span className="t-small" style={{ color: "var(--ink-primary)" }}>
                        {row.label}
                      </span>
                      <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
                        {row.note}
                      </span>
                    </td>
                    <td className="tabular py-2 text-right align-top">
                      <span className="t-small" style={{ color: "var(--ink-primary)" }}>
                        {formatNumber(row.value)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {unscored.length > 0 ? (
            <section>
              <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
                Records the model did not score
              </h3>
              <ul className="mt-3 space-y-2">
                {unscored.map((row) => (
                  <li key={row.reason} className="t-small" style={{ color: "var(--ink-secondary)" }}>
                    <span className="tabular font-semibold" style={{ color: "var(--ink-primary)" }}>
                      {formatNumber(row.count)}
                    </span>{" "}
                    {row.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="t-overline" style={{ color: "var(--ink-muted)" }}>
              Model
            </h3>
            <dl className="mt-3 space-y-2">
              <Row label="Version" value={status.modelVersion ?? "not published"} mono />
              <Row label="Trained at" value={fmt(status.modelTrainedAt)} />
              <Row label="Scoring" value={status.scoringStatus} />
            </dl>
            {status.scoringNote ? (
              <p className="t-caption mt-2" style={{ color: "var(--ink-muted)" }}>
                {status.scoringNote}
              </p>
            ) : null}
          </section>
        </div>
      </motion.div>
    </div>
  );
}

function fmt(iso: string | null): string {
  return iso ? formatDateTime(iso) : "not reported";
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="t-small" style={{ color: "var(--ink-secondary)" }}>
        {label}
      </dt>
      <dd
        className={`t-small text-right ${mono ? "font-mono" : "tabular"}`}
        style={{ color: "var(--ink-primary)" }}
      >
        {value}
      </dd>
    </div>
  );
}

function SourceRow({
  id,
  label,
  href,
  rowsRetrieved,
  latestSourceTimestamp,
}: {
  id: string;
  label: string;
  href: string;
  rowsRetrieved: number | null;
  latestSourceTimestamp: string | null;
}) {
  return (
    <li>
      <a
        className="t-small underline underline-offset-2"
        style={{ color: "var(--accent-strong)" }}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
      >
        {label}
      </a>
      <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
        <span className="font-mono">{id}</span>
        {rowsRetrieved !== null ? ` · ${formatNumber(rowsRetrieved)} rows retrieved` : ""}
        {latestSourceTimestamp ? ` · newest row ${formatDateTime(latestSourceTimestamp)}` : ""}
      </p>
    </li>
  );
}

export default DataDetails;
