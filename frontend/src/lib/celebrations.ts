"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import { loadStats } from "@/lib/progress-store";
import type { Me, Session, Stats } from "@/lib/types";

/*
 * Moments worth celebrating right after a study session ends: the day's first real
 * study time (the streak flame lights up) and reaching the daily goal. Each fires at most
 * once per day per device. The overlay in celebration-host.tsx shows them one at a time.
 */

export type MomentKind = "streak" | "goal";

export type Moment = {
  id: number;
  kind: MomentKind;
  stats: Stats;
  me: Me;
  /** Seconds the session that just ended added to today. 0 when unknown. */
  gainSeconds: number;
};

/** A day only counts as a streak day to celebrate once at least this much was studied. */
const MIN_STREAK_SECONDS = 60;

const queue: Moment[] = [];
let nextId = 1;
const dismissed: Record<MomentKind, number> = { streak: 0, goal: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The moment on screen now (the first in line), or null. */
export function useMoment(): Moment | null {
  return useSyncExternalStore(
    subscribe,
    () => queue[0] ?? null,
    () => null,
  );
}

/** How many moments of this kind were closed so far; lets other components react (flame bump, ring pulse). */
export function useDismissals(kind: MomentKind): number {
  return useSyncExternalStore(
    subscribe,
    () => dismissed[kind],
    () => 0,
  );
}

/** True when another moment is waiting behind the current one. */
export function hasNextMoment(): boolean {
  return queue.length > 1;
}

export function dismissMoment() {
  const m = queue.shift();
  if (m) dismissed[m.kind]++;
  emit();
}

/* ---- once per day, per device ---- */

const memory: Partial<Record<MomentKind, string>> = {};
const storageKey = (kind: MomentKind) => `study-online:celebrated-${kind}`;

function alreadyShown(kind: MomentKind, day: string): boolean {
  if (memory[kind] === day) return true;
  try {
    return localStorage.getItem(storageKey(kind)) === day;
  } catch {
    return false;
  }
}

function markShown(kind: MomentKind, day: string) {
  memory[kind] = day;
  try {
    localStorage.setItem(storageKey(kind), day);
  } catch {
    // Private mode: the in-memory flag still stops repeats until the page reloads.
  }
}

/**
 * Call right after a study session was stopped. Loads fresh numbers (which also refreshes the
 * header's flame) and queues whatever deserves a celebration. Never throws: a failed check
 * must not disturb the page.
 */
export async function announceSessionEnd(stopped?: Session | null): Promise<void> {
  try {
    const [{ stats }, me] = await Promise.all([loadStats(true), api<Me>("/api/me")]);
    const today = stats.last7Days[stats.last7Days.length - 1]?.date;
    if (!today) return;

    // A session that began before midnight belongs to yesterday's numbers.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    if (stopped && new Date(stopped.startedAt) < midnight) return;

    const gainSeconds = stopped?.seconds ?? 0;
    const add = (kind: MomentKind) => {
      markShown(kind, today);
      queue.push({ id: nextId++, kind, stats, me, gainSeconds });
    };

    if (stats.streakDays >= 1 && stats.todaySeconds >= MIN_STREAK_SECONDS && !alreadyShown("streak", today)) add("streak");
    const goal = me.dailyGoalMinutes * 60;
    if (goal > 0 && stats.todaySeconds >= goal && !alreadyShown("goal", today)) add("goal");
    emit();
  } catch {
    // Offline or signed out: skip the celebration.
  }
}
