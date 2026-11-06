"use client";

import { Pause, Play, RotateCcw, SkipForward, Timer as TimerIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge, Button, Card, CardBody, CardHeader, ErrorText, Field, Input, ProgressRing } from "@/components/ui";
import { api } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { chime, timerView, type Phase } from "@/lib/pomodoro";
import type { Timer } from "@/lib/types";
import { useNow } from "@/lib/use-now";

const phaseLabel: Record<Phase, string> = { idle: "Ready", focus: "Focus", break: "Break" };

/**
 * The room's shared Pomodoro. Everyone sees the same countdown; owners and
 * moderators control it. offsetMs is server time minus client time.
 */
export function Pomodoro({
  roomId,
  timer,
  offsetMs,
  canControl,
  onUpdated,
}: {
  roomId: string;
  timer: Timer;
  offsetMs: number;
  canControl: boolean;
  onUpdated: (timer: Timer, serverNow: string) => void;
}) {
  const now = useNow(timer.running);
  // now is 0 during server rendering; fall back to the paused/idle view then.
  const view = timerView(timer, now ? now + offsetMs : new Date(timer.updatedAt).getTime());
  const [focusMin, setFocusMin] = useState(Math.round(timer.focusSeconds / 60));
  const [breakMin, setBreakMin] = useState(Math.round(timer.breakSeconds / 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chime when the phase flips while running (not on first render or on manual changes).
  const prevPhase = useRef<Phase | null>(null);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = view.phase;
    if (prev && prev !== "idle" && view.phase !== "idle" && prev !== view.phase && timer.running) chime(view.phase);
  }, [view.phase, timer.running]);

  // Show the countdown in the tab title so it's visible from other tabs.
  useEffect(() => {
    if (view.phase === "idle") return;
    const prev = document.title;
    document.title = `${formatClock(view.left)} · ${phaseLabel[view.phase]}${view.paused ? " (paused)" : ""}`;
    return () => {
      document.title = prev;
    };
  }, [view.left, view.phase, view.paused]);

  async function control(action: string, extra: object = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ timer: Timer; serverNow: string }>(`/api/rooms/${roomId}/timer`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      onUpdated(res.timer, res.serverNow);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function start(e: FormEvent) {
    e.preventDefault();
    control("start", { focusMinutes: focusMin, breakMinutes: breakMin });
  }

  const progress = view.phase === "idle" ? 0 : 1 - view.left / view.length;
  const color = view.phase === "break" ? "var(--break)" : "var(--brand)";

  return (
    <Card>
      <CardHeader
        icon={<TimerIcon />}
        title="Room Pomodoro"
        description={`${Math.round(timer.focusSeconds / 60)} min focus · ${Math.round(timer.breakSeconds / 60)} min break`}
        action={
          <div className="flex gap-1.5">
            {view.phase !== "idle" && <Badge>Round {view.round}</Badge>}
            <Badge tone={view.phase === "break" ? "break" : view.phase === "focus" ? "brand" : "neutral"}>
              {phaseLabel[view.phase]}
              {view.paused && " · paused"}
            </Badge>
          </div>
        }
      />
      <CardBody className="flex flex-col items-center gap-5">
        <ProgressRing value={progress} size={196} stroke={10} color={color}>
          <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatClock(view.left)}</span>
          <span className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {view.phase === "idle" ? "Not started" : view.paused ? "Paused" : view.phase === "focus" ? "Stay focused" : "Take a breather"}
          </span>
        </ProgressRing>

        {canControl ? (
          view.phase === "idle" ? (
            <form onSubmit={start} className="flex w-full flex-wrap items-end justify-center gap-3">
              <Field label="Focus (min)" className="w-28">
                <Input type="number" min={1} max={180} value={focusMin} onChange={(e) => setFocusMin(Number(e.target.value))} />
              </Field>
              <Field label="Break (min)" className="w-28">
                <Input type="number" min={1} max={60} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
              </Field>
              <Button type="submit" variant="brand" loading={busy}>
                <Play className="fill-current" /> Start for everyone
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              {view.paused ? (
                <Button variant="brand" onClick={() => control("resume")} loading={busy}>
                  <Play className="fill-current" /> Resume
                </Button>
              ) : (
                <Button onClick={() => control("pause")} loading={busy}>
                  <Pause className="fill-current" /> Pause
                </Button>
              )}
              <Button variant="secondary" onClick={() => control("skip")} disabled={busy}>
                <SkipForward /> Skip to {view.phase === "focus" ? "break" : "focus"}
              </Button>
              <Button variant="ghost" onClick={() => control("reset")} disabled={busy}>
                <RotateCcw /> Reset
              </Button>
            </div>
          )
        ) : (
          <p className="text-center text-xs text-muted-foreground">The room owner and moderators control this timer.</p>
        )}
        <ErrorText>{error}</ErrorText>
      </CardBody>
    </Card>
  );
}
