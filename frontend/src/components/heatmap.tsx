"use client";

import { useEffect, useMemo, useRef } from "react";

import { cx } from "@/components/ui";
import { formatDuration } from "@/lib/format";

const WEEKS = 53;
const CELL = 11; // px
const GAP = 3; // px

// Empty, then four steps of the brand colour blended into the card colour,
// so the scale follows the light and dark themes.
const LEVELS = [
  "bg-muted",
  "bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--brand)_50%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--brand)_75%,var(--card))]",
  "bg-brand",
];

function level(seconds: number) {
  const m = seconds / 60;
  if (m <= 0) return 0;
  if (m < 30) return 1;
  if (m < 60) return 2;
  if (m < 120) return 3;
  return 4;
}

function ymd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 53 week columns ending with the week of `now`, Sunday on top like GitHub. */
function buildGrid(now: number) {
  const t = new Date(now);
  const end = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - end.getDay() - (WEEKS - 1) * 7);
  const cells: (string | null)[] = []; // column-major; null = a day in the future
  const months: { week: number; label: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + r);
      cells.push(d > end ? null : ymd(d));
      if (d <= end && d.getDate() === 1) {
        months.push({ week: w, label: d.toLocaleDateString(undefined, { month: "short" }) });
      }
    }
  }
  return { cells, months };
}

function dayLabel(date: string) {
  // Parse as local noon so the date never shifts across a time-zone edge.
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function Heatmap({
  days,
  now,
  label,
}: {
  days: { date: string; seconds: number }[];
  /** Current time in ms (from useNow); 0 means not ready. */
  now: number;
  label: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useMemo(() => buildGrid(now), [now]);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d.seconds])), [days]);

  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const cells = useMemo(
    () =>
      grid.cells.map((date, i) => {
        if (!date) return <div key={i} className="invisible" style={{ width: CELL, height: CELL }} />;
        const secs = byDate.get(date) ?? 0;
        return (
          <div
            key={i}
            className={cx("rounded-[3px]", LEVELS[level(secs)])}
            style={{ width: CELL, height: CELL }}
            title={`${secs > 0 ? formatDuration(secs) : "No study"} · ${dayLabel(date)}`}
          />
        );
      }),
    [grid, byDate],
  );

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1" role="img" aria-label={label}>
        <div className="inline-flex gap-2">
          <div
            className="grid shrink-0 grid-rows-7 pt-5 text-[10px] text-muted-foreground"
            style={{ gap: GAP, lineHeight: `${CELL}px` }}
            aria-hidden
          >
            {WEEKDAYS.map((d, i) => (
              <span key={i} style={{ height: CELL }}>
                {d}
              </span>
            ))}
          </div>
          <div>
            <div className="relative mb-1 h-4 text-[10px] text-muted-foreground" aria-hidden>
              {grid.months.map((m) => (
                <span key={m.week} className="absolute" style={{ left: m.week * (CELL + GAP) }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7" style={{ gap: GAP }}>
              {cells}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground" aria-hidden>
        Less
        {LEVELS.map((c, i) => (
          <span key={i} className={cx("rounded-[3px]", c)} style={{ width: CELL, height: CELL }} />
        ))}
        More
      </div>
    </div>
  );
}
