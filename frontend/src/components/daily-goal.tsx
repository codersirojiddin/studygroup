"use client";

import { Pencil, Target } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button, Card, CardBody, CardHeader, Dialog, ErrorText, Field, Input, ProgressRing } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Me } from "@/lib/types";

const presets = [60, 120, 180, 240];

/** Today's study time against the user's daily goal, with an editor. */
export function DailyGoal({
  todaySeconds,
  goalMinutes,
  onGoalChange,
}: {
  todaySeconds: number;
  goalMinutes: number;
  onGoalChange: (me: Me) => void;
}) {
  const [editing, setEditing] = useState(false);
  const goal = goalMinutes * 60;
  const pct = Math.min(1, todaySeconds / goal);
  const reached = todaySeconds >= goal;

  return (
    <Card>
      <CardHeader
        icon={<Target />}
        title="Daily goal"
        description={reached ? "Goal reached, nice work! 🎉" : `${formatDuration(Math.max(0, goal - todaySeconds))} to go`}
        action={
          <Button variant="ghost" size="icon" className="size-8" aria-label="Edit daily goal" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        }
      />
      <CardBody className="flex justify-center">
        <ProgressRing value={pct} size={150} stroke={12}>
          <span className="text-2xl font-semibold tabular-nums">{Math.round(pct * 100)}%</span>
          <span className="text-xs text-muted-foreground">
            {formatDuration(todaySeconds)} / {formatDuration(goal)}
          </span>
        </ProgressRing>
      </CardBody>
      <GoalDialog open={editing} onClose={() => setEditing(false)} current={goalMinutes} onSaved={onGoalChange} />
    </Card>
  );
}

function GoalDialog({
  open,
  onClose,
  current,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  current: number;
  onSaved: (me: Me) => void;
}) {
  const [hours, setHours] = useState(Math.floor(current / 60));
  const [minutes, setMinutes] = useState(current % 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/api/me/goal", {
        method: "PUT",
        body: JSON.stringify({ minutes: hours * 60 + minutes }),
      });
      onSaved(me);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Daily study goal" description="How much do you want to study each day?">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={hours * 60 + minutes === m ? "primary" : "secondary"}
              onClick={() => {
                setHours(Math.floor(m / 60));
                setMinutes(m % 60);
              }}
            >
              {formatDuration(m * 60)}
            </Button>
          ))}
        </div>
        <div className="flex gap-3">
          <Field label="Hours" className="flex-1">
            <Input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </Field>
          <Field label="Minutes" className="flex-1">
            <Input type="number" min={0} max={59} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save goal
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
