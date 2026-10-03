"use client";

import { useMemo, useState } from "react";
import { addDateKeys, sundayKeyNy, type InventoryNeed } from "@/lib/inventory-model";

type Props = {
  needs: InventoryNeed[];
  todayKey: string;
  /** Hide other people. Apps pass their own id. */
  personId?: string;
};

function tally(rows: InventoryNeed[]) {
  const papers = new Map<string, number>();
  const boxes = new Map<string, number>();
  let tissue = 0;
  const people = new Map<string, InventoryNeed[]>();
  for (const row of rows) {
    papers.set(row.paper, (papers.get(row.paper) || 0) + 1);
    if (row.boxSize) boxes.set(row.boxSize, (boxes.get(row.boxSize) || 0) + 1);
    tissue += row.tissue;
    const key = `${row.personId}|${row.personName}|${row.role}`;
    const list = people.get(key) || [];
    list.push(row);
    people.set(key, list);
  }
  return { papers, boxes, tissue, people };
}

function RequirementList({ rows }: { rows: InventoryNeed[] }) {
  const { papers, boxes, tissue, people } = tally(rows);
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">No wrapping supplies for this selection.</p>;
  }
  return (
    <div className="space-y-4">
      {[...people.entries()].map(([key, personRows]) => {
        const sample = personRows[0]!;
        const personTally = tally(personRows);
        return (
          <section key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {sample.personName}
              <span className="ml-2 font-normal text-slate-500">{sample.role}</span>
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-800">
              {[...personTally.papers.entries()].map(([label, count]) => (
                <li key={label}>
                  {label} for {count} item{count === 1 ? "" : "s"}
                </li>
              ))}
              {[...personTally.boxes.entries()].map(([size, count]) => (
                <li key={size}>
                  {count} cardboard box{count === 1 ? "" : "es"} ({size})
                </li>
              ))}
              {personTally.tissue > 0 ? (
                <li>
                  {personTally.tissue} sheet{personTally.tissue === 1 ? "" : "s"} of tissue (1 per box)
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
      {people.size > 1 ? (
        <section className="rounded-lg border border-slate-300 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-900">Everyone</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-800">
            {[...papers.entries()].map(([label, count]) => (
              <li key={label}>
                {label} for {count} item{count === 1 ? "" : "s"}
              </li>
            ))}
            {[...boxes.entries()].map(([size, count]) => (
              <li key={size}>
                {count} cardboard box{count === 1 ? "" : "es"} ({size})
              </li>
            ))}
            {tissue > 0 ? (
              <li>
                {tissue} sheet{tissue === 1 ? "" : "s"} of tissue (1 per box)
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function InventoryCalendar({ needs, todayKey, personId }: Props) {
  const mine = personId ? needs.filter((row) => row.personId === personId) : needs;
  const thisSunday = sundayKeyNy(todayKey);
  const [weekStart, setWeekStart] = useState(thisSunday);
  const [selectedDay, setSelectedDay] = useState(todayKey);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDateKeys(weekStart, i)),
    [weekStart],
  );
  const weekRows = mine.filter((row) => weekDays.includes(row.dateKey));
  const dayRows = mine.filter((row) => row.dateKey === selectedDay);
  const weekLabel = `${weekDays[0]} – ${weekDays[6]}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Inventory calendar</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            onClick={() => setWeekStart(addDateKeys(weekStart, -7))}
          >
            Previous week
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              setWeekStart(thisSunday);
              setSelectedDay(todayKey);
            }}
          >
            This week
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            onClick={() => setWeekStart(addDateKeys(weekStart, 7))}
          >
            Next week
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        Sunday–Saturday. Click a day for that day’s list. The week total updates with the gifts assigned right now.
      </p>
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="text-center text-[11px] font-semibold uppercase text-slate-500">
            {label}
          </div>
        ))}
        {weekDays.map((day) => {
          const count = mine.filter((row) => row.dateKey === day).length;
          const selected = day === selectedDay;
          const today = day === todayKey;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`rounded-lg border px-1 py-2 text-center text-xs ${
                selected
                  ? "border-[#0f0351] bg-[#f6b933] text-[#0f0351]"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              <span className="block font-semibold">{day.slice(8)}</span>
              <span className="block text-[10px]">{count} item{count === 1 ? "" : "s"}</span>
              {today ? <span className="block text-[10px] font-semibold">Today</span> : null}
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Week {weekLabel}</h3>
        <div className="mt-3">
          <RequirementList rows={weekRows} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Day {selectedDay}</h3>
        <div className="mt-3">
          <RequirementList rows={dayRows} />
        </div>
      </section>
    </div>
  );
}
