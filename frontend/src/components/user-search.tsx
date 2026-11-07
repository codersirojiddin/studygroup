"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Avatar, Button, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { UserSummary } from "@/lib/types";

/** Header search: find people by username or name and open their profile. */
export function UserSearch() {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // small screens only
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ term: string; items: UserSummary[] } | null>(null);

  const term = q.trim().replace(/^@/, "");
  // null while the answer for the current term is still on its way
  const items = result && result.term === term ? result.items : null;

  useEffect(() => {
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const found = await api<UserSummary[]>(`/api/users/search?q=${encodeURIComponent(term)}`);
        setResult({ term, items: found });
        setActive(0);
      } catch {
        setResult({ term, items: [] });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const close = () => {
    setOpen(false);
    setExpanded(false);
    setQ("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown" && items?.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items?.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && items?.[active]) {
      e.preventDefault();
      router.push(`/u/${items[active].username}`);
      close();
    }
  };

  const showList = open && term.length >= 2;

  return (
    <div ref={box} className="sm:relative">
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Search people"
        onClick={() => setExpanded((v) => !v)}
      >
        <Search />
      </Button>
      <div
        className={cx(
          expanded ? "absolute inset-x-0 top-full border-b bg-background p-3" : "hidden",
          "sm:static sm:block sm:border-0 sm:bg-transparent sm:p-0",
        )}
      >
        <div className="relative sm:w-56 lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search people…"
            aria-label="Search people"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          />
          {showList && (
            <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
              {items === null && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
              {items?.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No one found</p>}
              {items?.map((u, i) => (
                <Link
                  key={u.username}
                  href={`/u/${u.username}`}
                  onClick={close}
                  onMouseEnter={() => setActive(i)}
                  className={cx(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                    i === active ? "bg-accent" : "",
                  )}
                >
                  <Avatar name={u.displayName} seed={u.username} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
