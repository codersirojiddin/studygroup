"use client";

import { Play, Square, Timer as TimerIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Badge, Button, Card, CardBody, CardHeader, ErrorText, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { formatClock, secondsSince } from "@/lib/format";
import type { Session } from "@/lib/types";
import { useNow } from "@/lib/use-now";

/**
 * Start/stop control for a personal study session. With roomId, the session
 * is tied to that room; a session running elsewhere must be stopped first.
 */
export function StudyTimer({
  active,
  roomId,
  onChange,
}: {
  active: Session | null;
  roomId?: string;
  onChange: (s: Session | null) => void;
}) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(active !== null);

  const elsewhere = active !== null && (active.roomId ?? undefined) !== roomId;

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await api<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ roomId, topic }) }));
      setTopic("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await api<Session>("/api/sessions/stop", { method: "POST" });
      onChange(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<TimerIcon />}
        title={roomId ? "Your session" : "Solo session"}
        description={roomId ? "Counts toward your stats and this room's leaderboard" : "Study on your own, outside any room"}
        action={active && !elsewhere ? <Badge tone="brand">● Recording</Badge> : undefined}
      />
      <CardBody className="flex flex-col gap-4">
        {active ? (
          <>
            <div>
              <div className="font-mono text-4xl font-medium tracking-tight tabular-nums">
                {formatClock(now ? secondsSince(active.startedAt, now) : active.seconds)}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {active.topic || "No topic"}
                {elsewhere && (
                  <>
                    {" · "}
                    {active.roomId ? (
                      <Link href={`/rooms/${active.roomId}`} className="underline underline-offset-4">
                        in {active.roomName}
                      </Link>
                    ) : (
                      "solo"
                    )}
                  </>
                )}
              </p>
            </div>
            <Button variant="secondary" onClick={stop} loading={busy}>
              <Square className="fill-current" /> Stop session
            </Button>
          </>
        ) : (
          <form onSubmit={start} className="flex flex-col gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What are you studying? (optional)"
              maxLength={100}
            />
            <Button type="submit" variant="brand" loading={busy}>
              <Play className="fill-current" /> Start studying
            </Button>
          </form>
        )}
        <ErrorText>{error}</ErrorText>
      </CardBody>
    </Card>
  );
}
