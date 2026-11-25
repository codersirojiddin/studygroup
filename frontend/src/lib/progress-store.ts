"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import { timeZone } from "@/lib/format";
import type { Session, Stats } from "@/lib/types";

/*
 * The latest study stats, shared by everything that shows or reacts to them: the dashboard,
 * the streak flame in the header and the celebrations after a session. One place means one
 * request instead of one per component, and the header's flame updates the moment any page
 * loads fresh numbers.
 */

export type StatsPayload = { stats: Stats; recent: Session[] };

const REUSE_MS = 3_000; // callers this close together share one response
const STALE_MS = 5 * 60_000; // the header re-checks after this long

let snapshot: Stats | null = null;
let snapshotAt = 0;
let last: { at: number; payload: StatsPayload } | null = null;
let inflight: Promise<StatsPayload> | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function request(): Promise<StatsPayload> {
  const mine = ++seq;
  return api<StatsPayload>(`/api/sessions/stats?tz=${encodeURIComponent(timeZone())}`).then((payload) => {
    // A slower, older response must not overwrite a newer one.
    if (mine === seq) {
      last = { at: Date.now(), payload };
      snapshot = payload.stats;
      snapshotAt = Date.now();
      listeners.forEach((l) => l());
    }
    return payload;
  });
}

/**
 * Loads the stats. `fresh` always asks the server (use it right after something changed,
 * such as a stopped session); otherwise a recent or in-flight response is reused.
 */
export function loadStats(fresh = false): Promise<StatsPayload> {
  if (fresh) return request();
  if (inflight) return inflight;
  if (last && Date.now() - last.at < REUSE_MS) return Promise.resolve(last.payload);
  inflight = request().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Makes sure there are reasonably recent numbers; quiet on failure. */
export function ensureStats() {
  if (snapshot && Date.now() - snapshotAt < STALE_MS) return;
  loadStats().catch(() => {});
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The latest stats, or null until the first load. */
export function useStats(): Stats | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}
