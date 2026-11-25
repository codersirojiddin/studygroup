"use client";

import { Crown, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CountUp } from "@/components/count-up";
import { Avatar, Card, CardBody, CardHeader, cx, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDuration, timeZone } from "@/lib/format";
import type { LeaderboardEntry } from "@/lib/types";
import { useFlip } from "@/lib/use-flip";

type Moves = Record<string, number>;

/** ▲2 / ▼1: how many places someone moved since the last refresh. Shown for a few seconds. */
function Move({ by }: { by?: number }) {
  if (!by) return null;
  return (
    <span
      className={cx(
        "animate-pop ml-1 inline-flex items-center text-[10px] font-semibold tabular-nums",
        by > 0 ? "text-brand" : "text-destructive-foreground",
      )}
      aria-label={by > 0 ? `up ${by}` : `down ${-by}`}
    >
      {by > 0 ? "▲" : "▼"}
      {Math.abs(by)}
    </span>
  );
}

// Pedestal height, color and entrance delay by place. The winner rises last.
const PEDESTAL = [
  { h: 68, bg: "from-amber-300 to-amber-500", delay: 450 },
  { h: 50, bg: "from-slate-200 to-slate-400", delay: 200 },
  { h: 38, bg: "from-orange-300 to-orange-500", delay: 0 },
];

function Podium({ places, myId, grown, moves }: { places: LeaderboardEntry[]; myId: string; grown: boolean; moves: Moves }) {
  // 2nd on the left, 1st in the middle, 3rd on the right.
  const order = [1, 0, 2].filter((i) => places[i]);
  return (
    <div className="flex items-end justify-center gap-3 px-2 pt-7 pb-1" role="list" aria-label="Top three">
      {order.map((i) => {
        const e = places[i];
        const ped = PEDESTAL[i];
        const you = e.userId === myId;
        return (
          <div key={e.userId} role="listitem" className="flex w-[5.25rem] flex-col items-center gap-0.5 text-center">
            <div className="relative">
              {i === 0 && (
                <Crown
                  className="animate-crown absolute -top-5 left-1/2 size-5 -translate-x-1/2 fill-amber-400 text-amber-500"
                  aria-label="first place"
                />
              )}
              <div className={cx("rounded-full", you && "ring-2 ring-brand ring-offset-2 ring-offset-card")}>
                <Avatar name={e.displayName} seed={e.userId} size={i === 0 ? "lg" : "md"} />
              </div>
            </div>
            <span className={cx("mt-1 w-full truncate text-xs", you ? "font-semibold" : "font-medium")}>
              {you ? "You" : e.displayName.split(" ")[0]}
              <Move by={moves[e.userId]} />
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              <CountUp value={e.seconds} format={formatDuration} />
            </span>
            <div
              className={cx(
                "mt-1 flex w-full items-start justify-center rounded-t-lg bg-gradient-to-b pt-1 text-sm font-bold text-black/60",
                ped.bg,
              )}
              style={{
                height: grown ? ped.h : 6,
                transition: `height 700ms cubic-bezier(0.2, 1.2, 0.3, 1) ${ped.delay}ms`,
              }}
            >
              {grown && i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * This week's focus time in a room: a podium for the top three, then the rest as bars. Rows glide
 * to their new place when the order changes, and anyone who moved gets a ▲/▼ for a few seconds.
 */
export function Leaderboard({ roomId, myId, version }: { roomId: string; myId: string; version: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [moves, setMoves] = useState<Moves>({});
  const [grown, setGrown] = useState(false);
  const ranks = useRef(new Map<string, number>());
  const list = useRef<HTMLOListElement>(null);
  useFlip(list);

  useEffect(() => {
    let cancelled = false;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<{ entries: LeaderboardEntry[] }>(`/api/rooms/${roomId}/leaderboard?tz=${encodeURIComponent(timeZone())}`)
        .then((r) => {
          if (cancelled) return;
          // Compare with the previous order to find who moved (positive = up).
          const next = new Map(r.entries.map((e, i) => [e.userId, i]));
          const diff: Moves = {};
          for (const [id, i] of next) {
            const was = ranks.current.get(id);
            if (was !== undefined && was !== i) diff[id] = was - i;
          }
          ranks.current = next;
          setEntries(r.entries);
          if (Object.keys(diff).length > 0) {
            setMoves(diff);
            clearTimeout(clear);
            clear = setTimeout(() => setMoves({}), 4500);
          }
        })
        .catch(() => {});
    load();
    // Running sessions keep adding time, so refresh periodically.
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(clear);
    };
  }, [roomId, version]);

  // Pedestals and bars start flat and grow once the first data has been painted.
  const loaded = entries !== null;
  useEffect(() => {
    if (!loaded) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGrown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [loaded]);

  const top = entries?.[0]?.seconds ?? 0;
  const podium = entries?.filter((e) => e.seconds > 0).slice(0, 3) ?? [];
  const rest = entries?.slice(podium.length, 10) ?? [];

  return (
    <Card>
      <CardHeader icon={<Trophy />} title="This week" description="Focus time in this room since Monday" />
      <CardBody className="pt-3">
        {!entries ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : top === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">No study time yet this week. Be the first!</p>
        ) : (
          <>
            <Podium places={podium} myId={myId} grown={grown} moves={moves} />
            <ol ref={list} className="mt-3 flex flex-col gap-3">
              {rest.map((e, j) => {
                const rank = podium.length + j + 1;
                return (
                  <li
                    key={e.userId}
                    data-flip={e.userId}
                    style={{ animationDelay: `${j * 50}ms` }}
                    className="animate-item-in flex items-center gap-3"
                  >
                    <span className="w-6 text-center text-sm font-medium text-muted-foreground tabular-nums">{rank}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cx("truncate text-sm", e.userId === myId && "font-semibold")}>
                          {e.displayName}
                          {e.userId === myId && <span className="font-normal text-muted-foreground"> (you)</span>}
                          <Move by={moves[e.userId]} />
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums">
                          <CountUp value={e.seconds} format={formatDuration} />
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{
                            width: grown ? `${(e.seconds / top) * 100}%` : "0%",
                            transition: `width 800ms cubic-bezier(0.2, 0.8, 0.2, 1) ${j * 60}ms`,
                          }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </CardBody>
    </Card>
  );
}
