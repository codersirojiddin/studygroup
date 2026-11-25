"use client";

import { Check, ListTodo, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ConfettiBurst } from "@/components/confetti-burst";
import { Button, Card, CardBody, CardHeader, cx, ErrorText, Input, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { timeZone } from "@/lib/format";
import type { Todo } from "@/lib/types";
import { useFlip } from "@/lib/use-flip";

const LEAVE_MS = 260;

/** Personal to-do list: open tasks plus what you finished today. */
export function Todos({ className }: { className?: string }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Animation state: the task just ticked, tasks sliding out, and the two confetti triggers.
  const [justDone, setJustDone] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [tickBurst, setTickBurst] = useState(0);
  const [allDoneBurst, setAllDoneBurst] = useState(0);
  // Items stagger in on the first load only.
  const [firstLoad, setFirstLoad] = useState(true);
  const list = useRef<HTMLUListElement>(null);
  useFlip(list);

  const load = useCallback(async () => {
    try {
      setTodos(await api<Todo[]>(`/api/todos?tz=${encodeURIComponent(timeZone())}`));
      setTimeout(() => setFirstLoad(false), 800);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const open = todos?.filter((t) => !t.done) ?? [];
  const done = todos?.filter((t) => t.done) ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    try {
      const todo = await api<Todo>("/api/todos", { method: "POST", body: JSON.stringify({ title: t }) });
      setTodos((prev) => [...(prev ?? []).filter((x) => !x.done), todo, ...(prev ?? []).filter((x) => x.done)]);
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(todo: Todo) {
    if (!todo.done) {
      // Ticking a task: the box pops, the tick draws, a few sparks fly. Ticking the last open one is a party.
      setJustDone(todo.id);
      setTickBurst((n) => n + 1);
      setTimeout(() => setJustDone((cur) => (cur === todo.id ? null : cur)), 900);
      if (open.length === 1 && open[0].id === todo.id) setAllDoneBurst((n) => n + 1);
    }
    // Optimistic: flip now, reconcile with the server response.
    setTodos((prev) => prev?.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)) ?? null);
    try {
      const updated = await api<Todo>(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: !todo.done }),
      });
      setTodos((prev) => prev?.map((t) => (t.id === todo.id ? updated : t)) ?? null);
    } catch (err) {
      setError((err as Error).message);
      load();
    }
  }

  async function remove(todo: Todo) {
    // Slide out and collapse first, then drop it from the list once the animation has played.
    setLeaving((l) => [...l, todo.id]);
    const played = new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
    try {
      await Promise.all([api(`/api/todos/${todo.id}`, { method: "DELETE" }), played]);
      setTodos((prev) => prev?.filter((t) => t.id !== todo.id) ?? null);
    } catch (err) {
      setError((err as Error).message);
      load();
    } finally {
      setLeaving((l) => l.filter((id) => id !== todo.id));
    }
  }

  const allDone = open.length === 0 && done.length > 0;

  return (
    <Card className={className}>
      <CardHeader
        icon={<ListTodo />}
        title="To-do"
        description={todos ? `${open.length} open · ${done.length} done today` : "Loading…"}
      />
      <CardBody className="relative flex flex-col gap-3">
        <form onSubmit={add} className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" maxLength={200} />
          <Button type="submit" variant="secondary" size="icon" aria-label="Add task" disabled={!title.trim()}>
            <Plus />
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>
        {!todos ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : todos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet. Add what you plan to cover today.</p>
        ) : (
          <ul ref={list} className="-mx-2 flex max-h-72 flex-col overflow-y-auto">
            {[...open, ...done].map((t, i) => {
              const going = leaving.includes(t.id);
              const ticked = justDone === t.id;
              return (
                <li
                  key={t.id}
                  data-flip={t.id}
                  style={{
                    transitionDuration: `${LEAVE_MS}ms`,
                    ...(firstLoad ? { animationDelay: `${Math.min(i, 8) * 45}ms` } : null),
                  }}
                  className={cx(
                    "animate-item-in grid transition-all ease-out",
                    going ? "-translate-x-3 grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
                  )}
                >
                  {/* Collapsing needs a zero-height grid row, so the box clips only while leaving. */}
                  <div className={cx("min-h-0", going && "overflow-hidden")}>
                    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
                      <button
                        onClick={() => toggle(t)}
                        aria-label={t.done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                        className={cx(
                          "relative flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          t.done ? "border-brand bg-brand text-brand-foreground" : "border-input hover:border-brand",
                          ticked && "animate-check-box",
                        )}
                      >
                        {t.done && <Check className={cx("size-3.5", ticked && "check-draw")} strokeWidth={3} />}
                        {ticked && <ConfettiBurst burstKey={tickBurst} count={9} spread={30} size={4} duration={650} />}
                      </button>
                      <span className="min-w-0 flex-1">
                        {/* The strike-through is a line that grows left to right across just the text. */}
                        <span
                          className={cx("inline-block max-w-full truncate align-bottom text-sm", t.done && "text-muted-foreground")}
                          style={{
                            backgroundImage: "linear-gradient(currentColor, currentColor)",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "0 58%",
                            backgroundSize: t.done ? "100% 1.5px" : "0% 1.5px",
                            transition: "background-size 320ms ease-out, color 300ms",
                          }}
                        >
                          {t.title}
                        </span>
                      </span>
                      <button
                        onClick={() => remove(t)}
                        aria-label={`Delete "${t.title}"`}
                        className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive-foreground focus-visible:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {allDone && (
          <p className="animate-pop text-center text-sm font-medium text-brand">Everything done. Nice work!</p>
        )}
        <ConfettiBurst burstKey={allDoneBurst} count={34} spread={220} size={9} duration={1200} className="top-1/3" />
      </CardBody>
    </Card>
  );
}
