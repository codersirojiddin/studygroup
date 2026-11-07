"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { timerView } from "@/lib/pomodoro";
import type { Session, Timer } from "@/lib/types";
import { useNow } from "@/lib/use-now";

type Clock = { timer: Timer; offsetMs: number };

/**
 * Counts the room's Pomodoro focus phases toward the user's stats.
 *
 * One rule keeps the numbers honest: a user has a single running session at a
 * time. While the room timer is in a focus phase and this page is open we start
 * a "pomodoro" session, unless a session is already running (started by hand,
 * solo, or in another room). That session then simply keeps counting, so the
 * same minutes are never counted twice.
 *
 * The session stops when the focus phase ends, is paused, skipped or reset, or
 * when tracking is switched off. The server also caps it at the end of the focus
 * phase and ends it when you leave the room, so a closed tab can't inflate stats.
 */
export function useAutoTrack({
  roomId,
  clock,
  active,
  setActive,
  enabled,
  onChange,
}: {
  roomId: string;
  clock: Clock | null;
  active: Session | null;
  setActive: (s: Session | null) => void;
  enabled: boolean;
  onChange?: () => void;
}) {
  const now = useNow(clock?.timer.running ?? false);
  const view = clock && now ? timerView(clock.timer, now + clock.offsetMs) : null;
  // Changes only when a focus phase starts or stops, so the effects below run rarely.
  const focusKey =
    enabled && clock?.timer.running && view?.phase === "focus" ? `${clock.timer.updatedAt}#${view.round}` : null;

  // The focus phase the user chose to stop tracking, so we don't restart it.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const dismiss = useCallback(() => setDismissed(focusKey), [focusKey]);

  const ownsActive = active?.source === "pomodoro" && active.roomId === roomId;
  // The focus phase our running session belongs to (null = unknown yet).
  const trackedKey = useRef<string | null>(null);

  // Focus phase running and nothing recording: start.
  useEffect(() => {
    if (!focusKey || active || dismissed === focusKey) return;
    let cancelled = false;
    api<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ roomId, source: "pomodoro" }) })
      .then((s) => {
        if (cancelled) return;
        trackedKey.current = focusKey;
        setActive(s);
        onChange?.();
      })
      .catch(() =>
        // Already recording elsewhere, or the phase just ended: show what the server has.
        api<Session | null>("/api/sessions/active")
          .then((s) => !cancelled && setActive(s))
          .catch(() => {}),
      );
    return () => {
      cancelled = true;
    };
  }, [focusKey, active, dismissed, roomId, setActive, onChange]);

  // The timer was restarted straight into a new focus phase: the server ended our
  // old session, so ask what is running now (nothing -> the effect above starts one).
  useEffect(() => {
    if (!ownsActive || !focusKey) return;
    if (trackedKey.current === null) {
      trackedKey.current = focusKey; // a session from before a page reload: adopt it
      return;
    }
    if (trackedKey.current === focusKey) return;
    trackedKey.current = null;
    let cancelled = false;
    api<Session | null>("/api/sessions/active")
      .then((s) => !cancelled && setActive(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ownsActive, focusKey, setActive]);

  // Our session is running but the focus phase is over (or tracking was turned off): stop.
  useEffect(() => {
    if (!ownsActive || focusKey) return;
    trackedKey.current = null;
    api("/api/sessions/stop?source=pomodoro", { method: "POST" })
      .catch(() => {}) // the server may have ended it already
      .finally(() => {
        setActive(null);
        onChange?.();
      });
  }, [ownsActive, focusKey, setActive, onChange]);

  return { dismiss, tracking: ownsActive && focusKey !== null };
}

/** A boolean setting kept in localStorage (this device only). */
export function useStoredBool(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        // Storage unavailable; the setting just won't persist.
      }
    },
    [key],
  );
  return [value, set] as const;
}
