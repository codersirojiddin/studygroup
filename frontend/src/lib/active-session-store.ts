"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import type { Session } from "@/lib/types";

/*
 * The user's running study session, shared by everything that shows or changes it: the dashboard
 * timer, a room's timer and the mini timer in the sidebar. Pages publish what they start or stop,
 * and the sidebar re-checks the server from time to time (another tab, the server's 12-hour cap).
 */

let active: Session | null = null;
const listeners = new Set<() => void>();

/** Tell everyone about the current session (null = nothing is recording). */
export function publishActive(s: Session | null) {
  if (s === active) return;
  active = s;
  listeners.forEach((l) => l());
}

/** Asks the server which session is running; quiet on failure. */
export function refreshActive(): Promise<void> {
  return api<Session | null>("/api/sessions/active")
    .then(publishActive)
    .catch(() => {});
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The running session, or null (also until the first load finishes). */
export function useActiveSession(): Session | null {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
}
