"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { PLANNER, QUEUE } from "@/lib/content";
import { formatCount, formatMultiplier, formatPercent, formatStaffTime, NOT_MEASURED } from "@/lib/format";
import type { InterventionChannel, QueueAnimal } from "@/types/api";

interface PlanRow {
  animal: QueueAnimal;
  channel: InterventionChannel;
}

const DEFAULT_CAPACITY = 20;
/** The assumed uplift is a dial, not a finding. It starts at a deliberately
 *  modest value and is labelled as an assumption everywhere it appears. */
const DEFAULT_ASSUMED_UPLIFT = 0.1;

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function PlannerClient({
  animals,
  channels,
  liftAtK,
  k,
}: {
  animals: QueueAnimal[];
  channels: InterventionChannel[];
  liftAtK: number | null;
  k: number;
}) {
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const [selected, setSelected] = useState<string[]>(channels.map((channel) => channel.channel));
  const [assumedUplift, setAssumedUplift] = useState(DEFAULT_ASSUMED_UPLIFT);
  const [built, setBuilt] = useState(true);

  const channelByName = useMemo(() => {
    const map = new Map<string, InterventionChannel>();
    for (const channel of channels) map.set(channel.channel, channel);
    return map;
  }, [channels]);

  const plan = useMemo<PlanRow[]>(() => {
    if (!built) return [];
    return animals
      .slice()
      .sort((a, b) => (b.p_long_stay_60d ?? 0) - (a.p_long_stay_60d ?? 0))
      .filter((animal) => selected.includes(animal.suggested_channel))
      .slice(0, capacity)
      .map((animal) => ({ animal, channel: channelByName.get(animal.suggested_channel)! }))
      .filter((row) => Boolean(row.channel));
  }, [animals, selected, capacity, channelByName, built]);

  const groups = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const row of plan) {
      const list = map.get(row.channel.channel) ?? [];
      list.push(row);
      map.set(row.channel.channel, list);
    }
    return [...map.entries()];
  }, [plan]);

  const totalMinutes = plan.reduce((sum, row) => sum + row.channel.staff_minutes, 0);

  function downloadCsv() {
    const header = ["animal_id", "name", "species", "breed", "days_in_care", "channel", "staff_minutes"];
    const lines = [
      header.join(","),
      ...plan.map((row) =>
        [
          row.animal.animal_id,
          row.animal.name ?? QUEUE.unnamed,
          row.animal.animal_type,
          row.animal.breed,
          String(row.animal.days_in_care),
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
      <section
        className="no-print border"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border-hairline)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--card-padding)",
        }}
      >
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
              onChange={(event) => setCapacity(Math.max(1, Math.min(200, Number(event.target.value))))}
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
                      {`${formatStaffTime(channel.staff_minutes)} each`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => setBuilt(true)}
            className="t-small rounded-[var(--radius-md)] px-4 py-2.5 font-medium"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            {PLANNER.generateButton}
          </button>
        </div>
      </section>

      <section
        className="border"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border-hairline)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--card-padding)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
              {`${formatCount(plan.length)} animals across ${formatCount(groups.length)} channels`}
            </h2>
            <p className="t-small mt-1 tabular" style={{ color: "var(--ink-secondary)" }}>
              {`About ${formatStaffTime(totalMinutes)} of staff time`}
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
          <p className="t-body mt-4" style={{ color: "var(--ink-secondary)" }}>
            No animals match the channels you have selected. Turn a channel back on to build a
            plan.
          </p>
        ) : (
          <div className="mt-5 space-y-6">
            {groups.map(([channelName, rows]) => {
              const channel = channelByName.get(channelName);
              const minutes = rows.reduce((sum, row) => sum + row.channel.staff_minutes, 0);
              return (
                <div key={channelName}>
                  <h3 className="t-subtitle" style={{ color: "var(--ink-primary)" }}>
                    {channel?.label ?? channelName}
                    <span className="t-caption tabular ml-2" style={{ color: "var(--ink-muted)" }}>
                      {`${formatCount(rows.length)} animals · about ${formatStaffTime(minutes)}`}
                    </span>
                  </h3>
                  <table className="mt-2 w-full border-collapse">
                    <caption className="sr-only">
                      {`Animals assigned to ${channel?.label ?? channelName}`}
                    </caption>
                    <thead>
                      <tr>
                        {["Animal", "Species", "Breed", "Days waiting"].map((column, index) => (
                          <th
                            key={column}
                            scope="col"
                            className="t-caption border-b px-2 py-2"
                            style={{
                              borderColor: "var(--border-hairline)",
                              color: "var(--ink-muted)",
                              textAlign: index === 3 ? "right" : "left",
                            }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.animal.animal_id}>
                          <td
                            className="t-small border-b px-2"
                            style={{
                              borderColor: "var(--border-hairline)",
                              height: "var(--table-row-height)",
                              color: "var(--ink-primary)",
                            }}
                          >
                            {`${row.animal.name ?? QUEUE.unnamed} (${row.animal.animal_id})`}
                          </td>
                          <td
                            className="t-small border-b px-2"
                            style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                          >
                            {row.animal.animal_type}
                          </td>
                          <td
                            className="t-small border-b px-2"
                            style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                          >
                            {row.animal.breed}
                          </td>
                          <td
                            className="t-small tabular border-b px-2 text-right"
                            style={{ borderColor: "var(--border-hairline)", color: "var(--ink-secondary)" }}
                          >
                            {formatCount(row.animal.days_in_care)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="border"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border-hairline)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--card-padding)",
        }}
      >
        <h2 className="t-title" style={{ color: "var(--ink-primary)" }}>
          {PLANNER.expectedHeading}
        </h2>

        <p className="t-body mt-3" style={{ color: "var(--ink-primary)" }}>
          {liftAtK === null
            ? `Queue lift is ${NOT_MEASURED} in the results file.`
            : `Working the top ${formatCount(k)} of the queue reaches animals who are ${formatMultiplier(
                liftAtK,
                2,
              )} more likely to become long-stay residents than a randomly chosen ${formatCount(
                k,
              )}. That figure is measured on held-out data.`}
        </p>

        <div
          className="mt-4 rounded-[var(--radius-md)] px-4 py-3"
          style={{ background: "var(--surface-sunken)" }}
        >
          <p className="t-small" style={{ color: "var(--ink-secondary)" }}>
            {PLANNER.assumptionLine}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="t-small" htmlFor="assumed-uplift" style={{ color: "var(--ink-primary)" }}>
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
          <p className="t-small tabular mt-3" style={{ color: "var(--ink-secondary)" }}>
            {`At that assumed rate, this plan would move about ${(
              plan.length * assumedUplift
            ).toFixed(1)} additional animals into an adoption within 30 days. This number is an assumption, not a measurement.`}
          </p>
        </div>
      </section>
    </div>
  );
}

export default PlannerClient;
