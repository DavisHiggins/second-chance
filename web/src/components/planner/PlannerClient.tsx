"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RotateCcw, Trash2 } from "lucide-react";
import { PLANNER, QUEUE } from "@/lib/content";
import { formatCount, formatInstant, formatMultiplier, formatPercent, formatStaffTime } from "@/lib/format";
import { buildCsv, buildPlan, scenarioAdoptions, totalStaffMinutes, type PlanRow } from "@/lib/planner";
import { usePlanPicks } from "@/lib/planPicks";
import { describeHorizon } from "@/lib/model/horizon";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Disclosure from "@/components/ui/Disclosure";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";
import type { DataStatus } from "@/lib/austin/status";

const DEFAULT_CAPACITY = 20;

/** The assumed uplift is a dial, not a finding. It starts at a deliberately
 *  modest value and is labelled as an assumption everywhere it appears. */
const DEFAULT_UPLIFT_POINTS = 0.1;

const PROGRESS_KEY = "sc-plan-progress";
type Progress = Record<string, string>;

function readProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Progress) : {};
  } catch {
    return {};
  }
}

function writeProgress(next: Progress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked; progress lasts for this page only.
  }
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The week's outreach plan, in three steps: capacity, available actions,
 * review. The plan inherits the queue's honesty: ordered by intake-time
 * estimate when a validated model is scoring and by wait when not, with the
 * notice at the top saying which. Manual picks from the queue are placed
 * first; every row can be removed or reassigned; and the planning estimate
 * states its formula and its unit (percentage points) beside the number.
 */
export function PlannerClient({
  stays,
  channels,
  scoring,
  liftAtK,
  k,
  status,
}: {
  stays: ScoredStay[];
  channels: InterventionChannel[];
  scoring: boolean;
  liftAtK: number | null;
  k: number;
  status: DataStatus;
}) {
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const [selected, setSelected] = useState<string[]>(channels.map((channel) => channel.channel));
  const [uplift, setUplift] = useState(DEFAULT_UPLIFT_POINTS);
  const [removed, setRemoved] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Progress>({});
  const picks = usePlanPicks();

  useEffect(() => {
    setProgress(readProgress());
  }, []);

  const plan = useMemo<PlanRow[]>(
    () => buildPlan({ stays, channels, capacity, selected, picks: picks.picks, removed, overrides }),
    [stays, channels, capacity, selected, picks.picks, removed, overrides],
  );

  const groups = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const row of plan) {
      const list = map.get(row.channel.channel);
      if (list) list.push(row);
      else map.set(row.channel.channel, [row]);
    }
    return [...map.entries()];
  }, [plan]);

  const scenario = scenarioAdoptions(plan, uplift);
  const minutes = totalStaffMinutes(plan);
  const manualCount = plan.filter((row) => row.source === "manual").length;
  const planDate = new Date().toISOString().slice(0, 10);

  const setRowProgress = (episodeId: string, value: string) => {
    const next = { ...progress };
    if (value) next[episodeId] = value;
    else delete next[episodeId];
    setProgress(next);
    writeProgress(next);
  };

  const reassign = (row: PlanRow, channel: string) => {
    if (row.source === "manual") picks.setChannel(row.stay.episodeId, channel);
    else setOverrides((current) => ({ ...current, [row.stay.episodeId]: channel }));
  };

  const remove = (row: PlanRow) => {
    if (row.source === "manual") picks.remove(row.stay.episodeId);
    else setRemoved((current) => [...current, row.stay.episodeId]);
  };

  const exportCsv = () => {
    const csv = buildCsv(
      plan,
      {
        planDate,
        snapshotAt: status.snapshotAt,
        publisherUpdatedAt: status.publisherUpdatedAt,
        modelVersion: status.modelVersion,
        scoring,
        upliftPoints: uplift,
        capacity,
        scenario,
      },
      progress,
    );
    download(`secondchance-outreach-plan-${planDate}.csv`, csv, "text/csv;charset=utf-8");
  };

  const exportProgress = () => {
    const rows = plan.map((row) => ({
      animalId: row.stay.animalId,
      episodeId: row.stay.episodeId,
      name: row.stay.name,
      channel: row.channel.channel,
      progress: progress[row.stay.episodeId] ?? "",
    }));
    download(
      `secondchance-plan-progress-${planDate}.json`,
      JSON.stringify({ planDate, savedOnDevice: true, rows }, null, 2),
      "application/json",
    );
  };

  return (
    <div className="space-y-6">
      {!scoring ? (
        <p
          className="t-small border p-3"
          style={{
            background: "var(--surface-sunken)",
            borderColor: "var(--status-warning)",
            borderRadius: "var(--radius-md)",
            color: "var(--ink-primary)",
          }}
        >
          {PLANNER.descriptiveNotice}
        </p>
      ) : null}

      {/* Print header: the context a printed list otherwise loses. */}
      <div className="print-only">
        <p className="t-small">
          {`SecondChance outreach plan · ${planDate} · snapshot ${formatInstant(status.snapshotAt)} · ${
            scoring ? `model ${status.modelVersion}` : "ordered by wait, no model"
          } · assumed uplift ${Math.round(uplift * 100)} percentage points`}
        </p>
      </div>

      <div className="no-print grid gap-4 lg:grid-cols-2">
        <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="step-1">
          <p className="t-caption tabular" style={{ color: "var(--accent-strong)" }}>
            Step 1
          </p>
          <h2 id="step-1" className="t-title mt-1" style={{ color: "var(--ink-primary)" }}>
            {PLANNER.step1}
          </h2>
          <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
            {PLANNER.step1Body}
          </p>
          <label className="mt-4 block">
            <span className="field-label">{PLANNER.capacityLabel}</span>
            <input
              type="number"
              min={1}
              max={200}
              inputMode="numeric"
              value={capacity}
              onChange={(event) => setCapacity(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
              className="field tabular w-32"
            />
          </label>
          <p className="t-caption mt-3" style={{ color: "var(--ink-muted)" }}>
            {`${formatCount(stays.length)} open stays available to plan from.`}
          </p>
        </Card>

        <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="step-2">
          <p className="t-caption tabular" style={{ color: "var(--accent-strong)" }}>
            Step 2
          </p>
          <h2 id="step-2" className="t-title mt-1" style={{ color: "var(--ink-primary)" }}>
            {PLANNER.step2}
          </h2>
          <p className="t-small mt-1" style={{ color: "var(--ink-secondary)" }}>
            {PLANNER.step2Body}
          </p>
          <fieldset className="mt-4">
            <legend className="sr-only">{PLANNER.channelHeading}</legend>
            <ul className="space-y-2">
              {channels.map((channel) => (
                <li key={channel.channel}>
                  <label className="t-small flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={selected.includes(channel.channel)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, channel.channel]
                            : current.filter((value) => value !== channel.channel),
                        )
                      }
                      className="mt-1"
                      style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
                    />
                    <span>
                      <span style={{ color: "var(--ink-primary)" }}>{channel.label}</span>
                      <span className="t-caption block" style={{ color: "var(--ink-muted)" }}>
                        {`${PLANNER.timeLabel} ${formatStaffTime(channel.staff_minutes)} each · ${
                          channel.evidence === "historical" ? PLANNER.historicalLabel : PLANNER.assumedLabel
                        }`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <p className="t-caption mt-3 max-w-prose" style={{ color: "var(--ink-muted)" }}>
            {PLANNER.suggestionNote}
          </p>
        </Card>
      </div>

      <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="step-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="t-caption tabular no-print" style={{ color: "var(--accent-strong)" }}>
              Step 3
            </p>
            <h2 id="step-3" className="t-title mt-1" style={{ color: "var(--ink-primary)" }}>
              {`${formatCount(plan.length)} ${plan.length === 1 ? "animal" : "animals"} across ${formatCount(
                groups.length,
              )} ${groups.length === 1 ? "channel" : "channels"}`}
            </h2>
            <p className="t-small tabular mt-1" style={{ color: "var(--ink-secondary)" }}>
              {`About ${formatStaffTime(minutes)} of assumed coordination time · ${formatCount(manualCount)} chosen by you, ${formatCount(
                plan.length - manualCount,
              )} automatic`}
            </p>
            <p className="t-caption mt-1 no-print" style={{ color: "var(--ink-muted)" }}>
              {PLANNER.step3Body}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {removed.length > 0 || Object.keys(overrides).length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRemoved([]);
                  setOverrides({});
                }}
              >
                <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
                {PLANNER.restoreAuto}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={plan.length === 0}>
              <Download size={15} strokeWidth={1.75} aria-hidden="true" />
              {PLANNER.exportCsv}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={plan.length === 0}>
              <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
              {PLANNER.print}
            </Button>
          </div>
        </div>

        {picks.ready && picks.picks.length === 0 ? (
          <p className="t-caption no-print mt-3" style={{ color: "var(--ink-muted)" }}>
            {PLANNER.pickedEmpty}{" "}
            <Link href="/queue" className="link-reveal">
              Open the queue
            </Link>
          </p>
        ) : null}

        {groups.length === 0 ? (
          <p className="t-body mt-4 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {stays.length === 0
              ? "There are no open stays to plan for right now."
              : "No animals match the channels you have selected. Turn a channel back on to build a plan."}
          </p>
        ) : (
          <div className="mt-5 space-y-8">
            {groups.map(([channelName, rows]) => {
              const channel = rows[0].channel;
              const channelMinutes = rows.reduce((sum, row) => sum + row.channel.staff_minutes, 0);
              return (
                <section key={channelName} aria-labelledby={`group-${channelName.replace(/\s+/g, "-")}`}>
                  <h3 id={`group-${channelName.replace(/\s+/g, "-")}`} className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                    {channel.label}
                    <span className="t-caption tabular ml-2" style={{ color: "var(--ink-muted)" }}>
                      {`${formatCount(rows.length)} animals · about ${formatStaffTime(channelMinutes)}`}
                    </span>
                  </h3>
                  <p className="t-caption mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
                    <span className="font-semibold">
                      {channel.evidence === "historical" ? PLANNER.historicalLabel : PLANNER.assumedLabel}.
                    </span>{" "}
                    {channel.evidence_detail}
                  </p>

                  <div className="mt-3 overflow-x-auto" data-lenis-prevent="">
                    <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                      <caption className="sr-only">{`Animals assigned to ${channel.label}`}</caption>
                      <thead>
                        <tr>
                          {["Animal", "Species · breed", "Days waiting", scoring ? "Intake-time estimate" : "Why this channel", "Source", "Channel", "Progress", ""].map(
                            (column, index) => (
                              <th
                                key={`${column}-${index}`}
                                scope="col"
                                className="t-caption border-b px-2 py-2"
                                style={{
                                  borderColor: "var(--border-hairline)",
                                  color: "var(--ink-muted)",
                                  textAlign: index === 2 ? "right" : "left",
                                }}
                              >
                                {column}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const horizon = describeHorizon({
                            daysInCare: row.stay.daysInCare,
                            pLongStay60d: row.stay.pLongStay60d,
                            scoring,
                          });
                          return (
                            <tr key={row.stay.episodeId} className="row-hover">
                              <td className="t-small border-b px-2 py-2" style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}>
                                <Link href={`/discover/${encodeURIComponent(row.stay.episodeId)}?from=planner`} className="hover:underline">
                                  {row.stay.name ?? QUEUE.unnamed}
                                </Link>
                                <span className="t-caption block font-mono" style={{ color: "var(--ink-muted)" }}>
                                  {row.stay.animalId}
                                </span>
                              </td>
                              <td className="t-small border-b px-2 py-2" style={BODY_CELL}>
                                {[row.stay.species, row.stay.breed ?? "breed not recorded"].join(" · ")}
                              </td>
                              <td className="t-small tabular border-b px-2 py-2 text-right" style={BODY_CELL}>
                                {formatCount(row.stay.daysInCare)}
                              </td>
                              <td className="t-small border-b px-2 py-2" style={BODY_CELL}>
                                {scoring
                                  ? horizon.status === "already_past_horizon"
                                    ? `${horizon.headline}${row.stay.pLongStay60d === null ? "" : ` · intake estimate ${formatPercent(row.stay.pLongStay60d)}`}`
                                    : row.stay.pLongStay60d === null
                                      ? QUEUE.predictionUnavailable
                                      : `${formatPercent(row.stay.pLongStay60d)} at intake`
                                  : row.reason}
                              </td>
                              <td className="t-caption border-b px-2 py-2" style={BODY_CELL}>
                                {row.source === "manual" ? PLANNER.manualLabel : PLANNER.autoLabel}
                                {row.channel.channel !== row.suggestedChannel ? (
                                  <span className="block" style={{ color: "var(--ink-muted)" }}>
                                    {`rule suggested ${row.suggestedChannel}`}
                                  </span>
                                ) : null}
                              </td>
                              <td className="border-b px-2 py-2 no-print" style={BODY_CELL}>
                                <label className="sr-only" htmlFor={`channel-${row.stay.episodeId}`}>
                                  {`${PLANNER.reassign} for ${row.stay.name ?? QUEUE.unnamed}`}
                                </label>
                                <select
                                  id={`channel-${row.stay.episodeId}`}
                                  value={row.channel.channel}
                                  onChange={(event) => reassign(row, event.target.value)}
                                  className="field t-caption"
                                  style={{ minHeight: 36 }}
                                >
                                  {channels.map((option) => (
                                    <option key={option.channel} value={option.channel}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border-b px-2 py-2" style={BODY_CELL}>
                                <label className="sr-only" htmlFor={`progress-${row.stay.episodeId}`}>
                                  {`Progress for ${row.stay.name ?? QUEUE.unnamed}`}
                                </label>
                                <select
                                  id={`progress-${row.stay.episodeId}`}
                                  value={progress[row.stay.episodeId] ?? ""}
                                  onChange={(event) => setRowProgress(row.stay.episodeId, event.target.value)}
                                  className="field t-caption no-print"
                                  style={{ minHeight: 36 }}
                                >
                                  <option value="">—</option>
                                  {PLANNER.statuses.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <span className="print-only t-caption">{progress[row.stay.episodeId] ?? "☐"}</span>
                              </td>
                              <td className="border-b px-2 py-2 text-right no-print" style={BODY_CELL}>
                                <button
                                  type="button"
                                  onClick={() => remove(row)}
                                  aria-label={`${PLANNER.remove} ${row.stay.name ?? QUEUE.unnamed} from the plan`}
                                  title={PLANNER.remove}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border"
                                  style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                                >
                                  <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="no-print mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4" style={{ borderColor: "var(--border-hairline)" }}>
          <p className="t-caption" style={{ color: "var(--ink-muted)" }}>
            <span className="font-semibold">{PLANNER.checklistHeading}.</span> {PLANNER.checklistNote}
          </p>
          <Button variant="ghost" size="sm" onClick={exportProgress} disabled={plan.length === 0}>
            {PLANNER.checklistExport}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setProgress({});
              writeProgress({});
            }}
            disabled={Object.keys(progress).length === 0}
          >
            {PLANNER.checklistReset}
          </Button>
        </div>
      </Card>

      <Card style={{ padding: "var(--card-padding)" }} aria-labelledby="estimate-heading">
        <h2 id="estimate-heading" className="t-title" style={{ color: "var(--ink-primary)" }}>
          {PLANNER.estimateHeading}
        </h2>

        <p className="t-body mt-3 max-w-prose" style={{ color: "var(--ink-primary)" }}>
          {liftAtK === null
            ? PLANNER.liftUnavailable
            : PLANNER.liftNote.replace("{lift}", `${formatMultiplier(liftAtK, 2)}`).replace("50", formatCount(k))}
        </p>

        <div className="mt-4 rounded-[var(--radius-md)] px-4 py-3" style={{ background: "var(--surface-sunken)" }}>
          <p className="t-small max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {PLANNER.assumptionLine}
          </p>
          <div className="no-print mt-3 flex flex-wrap items-center gap-3">
            <label className="t-small" htmlFor="assumed-uplift" style={{ color: "var(--ink-primary)" }}>
              {PLANNER.upliftLabel}
            </label>
            <input
              id="assumed-uplift"
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={uplift}
              onChange={(event) => setUplift(Number(event.target.value))}
              style={{ accentColor: "var(--accent)" }}
              aria-valuetext={`${Math.round(uplift * 100)} ${PLANNER.upliftUnit}`}
            />
            <span className="t-small tabular" style={{ color: "var(--ink-primary)" }}>
              {`${Math.round(uplift * 100)} ${PLANNER.upliftUnit}`}
            </span>
          </div>
          <p className="t-small tabular mt-3 max-w-prose" style={{ color: "var(--ink-primary)" }}>
            {PLANNER.scenarioLine.replace("{n}", scenario.additional.toFixed(1))}
          </p>
          {scenario.hypotheticalRows > 0 ? (
            <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              {PLANNER.scenarioHypothetical
                .replace("{k}", formatCount(scenario.hypotheticalRows))
                .replace("{total}", formatCount(plan.length))}
            </p>
          ) : null}
          <Disclosure summary="Show the formula" className="mt-2">
            <p className="t-caption max-w-prose" style={{ color: "var(--ink-secondary)" }}>
              {PLANNER.scenarioFormula}
            </p>
            <p className="t-caption mt-2 max-w-prose" style={{ color: "var(--ink-muted)" }}>
              {`In this plan: ${formatCount(scenario.modelBaselineRows)} rows use an intake-time baseline, ${formatCount(
                scenario.hypotheticalRows,
              )} are past day 30 and hypothetical, ${formatCount(scenario.noBaselineRows)} have no estimate and use a zero baseline.`}
            </p>
          </Disclosure>
        </div>
      </Card>
    </div>
  );
}

const BODY_CELL = {
  borderColor: "var(--border-hairline)",
  color: "var(--ink-secondary)",
} as const;

export default PlannerClient;
