/** 3725 -> "1h 2m"; 59 -> "0m". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 3725 -> "1:02:05"; for running timers. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function secondsSince(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 1000;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function shortWeekday(date: string): string {
  // date is YYYY-MM-DD; parse as local noon to avoid TZ edge cases.
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}
