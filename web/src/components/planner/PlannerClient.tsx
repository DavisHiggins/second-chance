"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { PLANNER, QUEUE } from "@/lib/content";
import {
  formatCount,
  formatMultiplier,
  formatPercent,
  formatStaffTime,
  NOT_MEASURED,
} from "@/lib/format";
import { resolveChannel, suggestChannel } from "@/lib/interventions";
import Card from "@/components/ui/Card";
import type { InterventionChannel, ScoredStay } from "@/lib/shelter.server";

interface PlanRow {
  stay: ScoredStay;
  channel: InterventionChannel;
  reason: string;
}

const DEFAULT_CAPACITY = 20;

/** The assumed uplift is a dial, not a finding. It starts at a deliberately
 *  modest value and is labelled as an assumption everywhere it appears. */
const DEFAULT_ASSUMED_UPLIFT = 0.1;

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The week's outreach plan.
 *
 * The plan is built from the queue in the order the queue is already in, which
 * means it inherits the same honesty: ranked by predicted long-stay risk when
 * a validated model is scoring, and by length of wait when one is not. The
 * notice at the top says which of those is happening, because a printed list
 * handed to a volunteer carries no other context.
 *
 * Two numbers appear at the bottom and they are deliberately not combined. The
 * lift figure is measured on held-out data and describes the queue. The uplift
 * dial is an assumption about what outreach does, and this project has no
 * evidence for it; it exists so a shelter can put its own number in, and it is
 * labelled an assumption every time it is rendered.
 */
export function PlannerClient({
  stays,
  channels,
  scoring,
  liftAtK,
  k,
}: {
  stays: ScoredStay[];
  channels: InterventionChannel[];
  scoring: boolean;
  liftAtK: number | null;
  k: number;
}) {
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const [selected, setSelected] = useState<string[]>(channels.map((channel) => channel.channel));
  const [assumedUplift, setAssumedUplift] = useState(DEFAULT_ASSUMED_UPLIFT);

  /** Every open stay with the channel its record suggests. Computed once for
   *  the whole list so toggling a channel is a filter, not a recompute. */
  const assigned = useMemo<PlanRow[]>(() => {
    const rows: PlanRow[] = [];
    for (const stay of stays) {
      const suggestion = suggestChannel(stay);
      const channel = resolveChannel(channels, suggestion.channel);
      if (channel) rows.push({ stay, channel, reason: suggestion.reason });
    }
    return rows;
  }, [stays, channels]);

  /**
   * The week's capacity, spread across the channels that are switched on.
   *
   * Taking the top of the combined queue looks right and is not: the highest
   * long-stay risks in Austin are overwhelmingly adult bully-breed dogs, so a
   * straight top-20 becomes twenty animals in one channel, and the foster
   * coordinator and the photographer are handed nothing. Each selected channel
   * takes its own next-highest-risk animal in turn instead, so the plan splits
   * across the people who have to do it. Risk order still decides who is
   * picked within a channel, and a channel that runs out simply drops out of
   * the rotation rather than holding a slot open.
   */
  const plan = useMemo(() => {
    const queues = new Map<string, PlanRow[]>();
    for (const row of assigned) {
      if (!selected.includes(row.channel.channel)) continue;
      const queue = queues.get(row.channel.channel);
      if (queue) queue.push(row);
      else queues.set(row.channel.channel, [row]);
    }

    const rotation = [...queues.keys()];
    const taken: PlanRow[] = [];
    const cursor = new Map<string, number>();

    while (taken.length < capacity && rotation.length > 0) {
      for (let i = 0; i < rotation.length && taken.length < capacity; ) {
        const name = rotation[i];
        const queue = queues.get(name) ?? [];
        const at = cursor.get(name) ?? 0;

        if (at >= queue.length) {
          rotation.splice(i, 1);
          continue;
        }

        taken.push(queue[at]);
        cursor.set(name, at + 1);
        i += 1;
      }
    }

    return taken;
  }, [assigned, selected, capacity]);

  const groups = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const row of plan) {
      const list = map.get(row.channel.channel);
      if (list) list.push(row);
      else map.set(row.channel.channel, [row]);
    }
    return [...map.entries()];
  }, [plan]);

  const totalMinutes = plan.reduce((sum, row) => sum + row.channel.staff_minutes, 0);

  function downloadCsv() {
    const header = [
      "animal_id",
      "episode_id",
      "name",
      "species",
      "breed",
      "days_in_care",
      "p_long_stay_60d",
      "channel",
      "staff_minutes",
    ];
    const lines = [
      header.join(","),
      ...plan.map((row) =>
        [
          row.stay.animalId,
          row.stay.episodeId,
          row.stay.name ?? QUEUE.unnamed,
          row.stay.species,
          row.stay.breed ?? "",
          String(row.stay.daysInCare),
          // An unscored animal exports as empty, never as a zero.
          row.stay.pLongStay60d === null ? "" : row.stay.pLongStay60d.toFixed(4),
          row.channel.channel,
          String(row.channel.staff_minutes),
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "secondchance-outreach-plan.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

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

      <Card className="no-print" style={{ padding: "var(--card-padding)" }}>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="t-small" htmlFor="capacity" style={{ color: "var(--ink-primary)" }}>
              {PLANNER.capacityLabel}
            </label>
            <input
              id="capacity"
              type="number"
              min={1}
              max={200}
              value={capacity}
              onChange={(event) =>
                setCapacity(Math.max(1, Math.min(200, Number(event.target.value) || 1)))
              }
              className="t-small tabular mt-2 block w-28 rounded-[var(--radius-md)] border px-3 py-2"
              style={{
                borderColor: "var(--border-hairline)",
                background: "var(--surface-raised)",
                color: "var(--ink-primary)",
              }}
            />
          </div>

          <fieldset className="flex-1">
            <legend className="t-small" style={{ color: "var(--ink-primary)" }}>
              {PLANNER.channelHeading}
            </legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {channels.map((channel) => (
                <label key={channel.channel} className="t-small flex items-center gap-2">
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
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ color: "var(--ink-secondary)" }}>
                    {channel.label}
                    <span className="t-caption ml-1.5" style={{ color: "var(--ink-muted)" }}>
                      {`${formatStaffTime(channel.staff_minutes)} each · ${
                        channel.evidence === "measured"
                          ? PLANNER.measuredLabel
                          : PLANNER.assumedLabel
                      }`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card style={{ padding: "var(--card-padding)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {`${formatCount(plan.length)} ${plan.length === 1 ? "animal" : "animals"} across ${formatCount(
                groups.length,
              )} ${groups.length === 1 ? "channel" : "channels"}`}
            </h2>
            <p className="t-small tabular mt-1" style={{ color: "var(--ink-secondary)" }}>
              {`About ${formatStaffTime(totalMinutes)} of staff time, out of ${formatCount(
                stays.length,
              )} open stays`}
            </p>
          </div>
          <div className="no-print flex gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              className="t-small inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
            >
              <Download size={16} strokeWidth={1.5} aria-hidden="true" />
              {PLANNER.exportCsv}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="t-small inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2"
              style={{ borderColor: "var(--border-hairline)", color: "var(--ink-primary)" }}
            >
              <Printer size={16} strokeWidth={1.5} aria-hidden="true" />
              {PLANNER.print}
            </button>
          </div>
        </div>

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
              const minutes = rows.reduce((sum, row) => sum + row.channel.staff_minutes, 0);
              return (
                <div key={channelName}>
                  <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                    {channel.label}
                    <span className="t-caption tabular ml-2" style={{ color: "var(--ink-muted)" }}>
                      {`${formatCount(rows.length)} animals · about ${formatStaffTime(minutes)}`}
                    </span>
                  </h3>
                  <p
                    className="t-caption mt-1 max-w-prose"
                    style={{ color: "var(--ink-secondary)" }}
                  >
                    {`${
                      channel.evidence === "measured"
                        ? PLANNER.measuredLabel
                        : PLANNER.assumedLabel
                    }. ${channel.evidence_detail}`}
                  </p>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse">
                      <caption className="sr-only">{`Animals assigned to ${channel.label}`}</caption>
                      <thead>
                        <tr>
                          {[
                            "Animal",
                            "Species",
                            "Breed",
                            "Days waiting",
                            scoring ? "Long-stay risk" : "Why this channel",
                          ].map((column, index) => (
                            <th
                              key={column}
                              scope="col"
                              className="t-caption border-b px-2 py-2"
                              style={{
                                borderColor: "var(--border-hairline)",
                                color: "var(--ink-muted)",
                                textAlign:
                                  index === 3 || (index === 4 && scoring) ? "right" : "left",
                              }}
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.stay.episodeId}>
                            <td
                              className="t-small border-b px-2"
                              style={{
                                borderColor: "var(--border-hairline)",
                                height: "var(--table-row-height)",
                                color: "var(--ink-primary)",
                              }}
                            >
                              {`${row.stay.name ?? QUEUE.unnamed} (${row.stay.animalId})`}
                            </td>
                            <td className="t-small border-b px-2" style={BODY_CELL}>
                              {row.stay.species}
                            </td>
                            <td className="t-small border-b px-2" style={BODY_CELL}>
                              {row.stay.breed ?? "not recorded"}
                            </td>
                            <td
                              className="t-small tabular border-b px-2 text-right"
                              style={BODY_CELL}
                            >
                              {formatCount(row.stay.daysInCare)}
                            </td>
                            <td
                              className={`t-small border-b px-2 ${
                                scoring ? "tabular text-right" : ""
                              }`}
                              style={BODY_CELL}
                            >
                              {scoring
                                ? row.stay.pLongStay60d === null
                                  ? QUEUE.predictionUnavailable
                                  : formatPercent(row.stay.pLongStay60d)
                                : row.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card style={{ padding: "var(--card-padding)" }}>
        <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
          {PLANNER.expectedHeading}
        </h2>

        <p className="t-body mt-3 max-w-prose" style={{ color: "var(--ink-primary)" }}>
          {liftAtK === null
            ? `Queue lift is ${NOT_MEASURED} in the published model artifact, so nothing is claimed for it here.`
            : `Working the top ${formatCount(k)} of the queue reaches animals who are ${formatMultiplier(
                liftAtK,
                2,
              )} more likely to become long-stay residents than a randomly chosen ${formatCount(
                k,
              )}. That figure is measured on the held-out test block, not assumed.`}
        </p>

        <div
          className="mt-4 rounded-[var(--radius-md)] px-4 py-3"
          style={{ background: "var(--surface-sunken)" }}
        >
          <p className="t-small max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {PLANNER.assumptionLine}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label
              className="t-small"
              htmlFor="assumed-uplift"
              style={{ color: "var(--ink-primary)" }}
            >
              Assumed change in adoption chance per animal worked
            </label>
            <input
              id="assumed-uplift"
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={assumedUplift}
              onChange={(event) => setAssumedUplift(Number(event.target.value))}
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="t-small tabular" style={{ color: "var(--ink-primary)" }}>
              {formatPercent(assumedUplift)}
            </span>
          </div>
          <p className="t-small tabular mt-3 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {`At that assumed rate, this plan would move about ${(plan.length * assumedUplift).toFixed(
              1,
            )} additional animals into an adoption within 30 days. This number is an assumption, not a measurement.`}
          </p>
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
