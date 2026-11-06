"use client";

import { Check, ListTodo, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button, Card, CardBody, CardHeader, cx, ErrorText, Input, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { timeZone } from "@/lib/format";
import type { Todo } from "@/lib/types";

/** Personal to-do list: open tasks plus what you finished today. */
export function Todos({ className }: { className?: string }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTodos(await api<Todo[]>(`/api/todos?tz=${encodeURIComponent(timeZone())}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

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
    setTodos((prev) => prev?.filter((t) => t.id !== todo.id) ?? null);
    try {
      await api(`/api/todos/${todo.id}`, { method: "DELETE" });
    } catch (err) {
      setError((err as Error).message);
      load();
    }
  }

  const open = todos?.filter((t) => !t.done) ?? [];
  const done = todos?.filter((t) => t.done) ?? [];

  return (
    <Card className={className}>
      <CardHeader
        icon={<ListTodo />}
        title="To-do"
        description={todos ? `${open.length} open · ${done.length} done today` : "Loading…"}
      />
      <CardBody className="flex flex-col gap-3">
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
          <ul className="-mx-2 flex max-h-72 flex-col overflow-y-auto">
            {[...open, ...done].map((t) => (
              <li key={t.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
                <button
                  onClick={() => toggle(t)}
                  aria-label={t.done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                  className={cx(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    t.done ? "border-brand bg-brand text-brand-foreground" : "border-input hover:border-brand",
                  )}
                >
                  {t.done && <Check className="size-3.5" strokeWidth={3} />}
                </button>
                <span className={cx("min-w-0 flex-1 truncate text-sm", t.done && "text-muted-foreground line-through")}>
                  {t.title}
                </span>
                <button
                  onClick={() => remove(t)}
                  aria-label={`Delete "${t.title}"`}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive-foreground focus-visible:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
