"use client";

import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import type { Room } from "@/lib/types";

/* The rooms the user belongs to, for the sidebar. One request is shared by everyone who asks. */

const REUSE_MS = 3_000;

let mine: Room[] | null = null;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** Loads the list unless it was loaded a moment ago. Quiet on failure. */
export function refreshRooms(): Promise<void> {
  if (inflight) return inflight;
  if (mine && Date.now() - loadedAt < REUSE_MS) return Promise.resolve();
  inflight = api<{ mine: Room[]; public: Room[] }>("/api/rooms")
    .then((r) => {
      mine = r.mine;
      loadedAt = Date.now();
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget everything, for example when another account signs in. */
export function resetRooms() {
  mine = null;
  loadedAt = 0;
  emit();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The user's rooms, or null until the first load. */
export function useMyRooms(): Room[] | null {
  return useSyncExternalStore(
    subscribe,
    () => mine,
    () => null,
  );
}
