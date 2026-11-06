"use client";

import { useSyncExternalStore } from "react";

// One shared 1-second ticker for every component that shows a running clock.
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const noop = () => () => {};

// Must return the same value until the ticker changes it, so cache the first read.
function getSnapshot() {
  if (now === 0) now = Date.now();
  return now;
}

/**
 * Current time in ms, updated every second while `active` is true.
 * Returns 0 during server rendering, so callers should clamp elapsed times.
 */
export function useNow(active = true): number {
  return useSyncExternalStore(active ? subscribe : noop, getSnapshot, () => 0);
}
