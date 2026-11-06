import type { Timer } from "@/lib/types";

export type Phase = "idle" | "focus" | "break";

export type TimerView = {
  phase: Phase;
  paused: boolean;
  /** Seconds left in the current phase. */
  left: number;
  /** Length of the current phase in seconds. */
  length: number;
  /** 1-based focus round. */
  round: number;
};

/**
 * Derives the phase from the shared timer state. Mirrors rooms.Timer.Phase in
 * the Go backend. `serverNow` is the client clock corrected by the server offset.
 */
export function timerView(t: Timer, serverNow: number): TimerView {
  const paused = !t.running && t.pausedMs > 0;
  if (!t.running && !paused) {
    return { phase: "idle", paused: false, left: t.focusSeconds, length: t.focusSeconds, round: 1 };
  }
  const elapsed = t.running && t.startedAt ? (serverNow - new Date(t.startedAt).getTime()) / 1000 : t.pausedMs / 1000;
  const cycle = t.focusSeconds + t.breakSeconds;
  const e = Math.max(0, elapsed);
  const pos = e % cycle;
  const round = Math.floor(e / cycle) + 1;
  if (pos < t.focusSeconds) {
    return { phase: "focus", paused, left: t.focusSeconds - pos, length: t.focusSeconds, round };
  }
  return { phase: "break", paused, left: cycle - pos, length: t.breakSeconds, round };
}

/** Short two-tone chime for phase changes. Silently does nothing if audio is blocked. */
export function chime(phase: Phase) {
  try {
    const ctx = new AudioContext();
    const tones = phase === "break" ? [660, 880] : [880, 660];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.25;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.start(start);
      osc.stop(start + 0.25);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio unavailable; the visual change is enough.
  }
}
