"use client";

import { BookOpen, ChevronsLeft, ChevronsRight, LayoutDashboard, Settings, Square, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { ClockText } from "@/components/clock-text";
import SoboMascot from "@/components/SoboMascot";
import { Button, Skeleton, cx } from "@/components/ui";
import { publishActive, useActiveSession } from "@/lib/active-session-store";
import { api } from "@/lib/api";
import { announceSessionEnd } from "@/lib/celebrations";
import { formatClock, secondsSince } from "@/lib/format";
import { useMyRooms } from "@/lib/rooms-store";
import type { Session } from "@/lib/types";
import { useNow } from "@/lib/use-now";

/** Which sidebar item the current page belongs to (null = none, e.g. a public profile). */
function activeKeyFor(pathname: string): string | null {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/settings") || pathname.startsWith("/account")) return "settings";
  const room = /^\/rooms\/([^/]+)/.exec(pathname);
  return room ? `room:${room[1]}` : null;
}

/*
 * One row of the sidebar. The icon always sits at the same x position, so when the sidebar shrinks
 * to a rail the labels simply fade and get clipped; nothing jumps.
 */
function Item({
  href,
  dataKey,
  active,
  collapsed,
  icon,
  label,
  trailing,
  title,
  style,
  className,
}: {
  href: string;
  dataKey: string;
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  title?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-key={dataKey}
      title={collapsed ? (title ?? label) : undefined}
      aria-current={active ? "page" : undefined}
      style={style}
      className={cx(
        "relative z-10 mx-3 flex h-10 items-center gap-3 overflow-hidden rounded-lg px-[14px] text-sm font-medium transition-colors motion-reduce:transition-none",
        active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        className,
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">{icon}</span>
      <span className={cx("min-w-0 flex-1 truncate transition-opacity duration-200 motion-reduce:transition-none", collapsed && "opacity-0")}>
        {label}
      </span>
      {trailing && (
        <span className={cx("shrink-0 transition-opacity duration-200 motion-reduce:transition-none", collapsed && "opacity-0")}>
          {trailing}
        </span>
      )}
    </Link>
  );
}

function RecordingDot() {
  return (
    <span className="relative flex size-2" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-brand" />
    </span>
  );
}

/**
 * The running session, always in view. Manual sessions can be stopped right here. A session that
 * the room's Pomodoro started on its own is controlled from that room (its tracking switch lives
 * there), so here it links back to the room instead of offering a Stop that would just restart.
 */
function MiniTimer({ collapsed }: { collapsed: boolean }) {
  const active = useActiveSession();
  const now = useNow(active !== null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!active) return null;

  const clock = formatClock(now ? secondsSince(active.startedAt, now) : active.seconds);
  const href = active.roomId ? `/rooms/${active.roomId}` : "/dashboard";
  const auto = active.source === "pomodoro";
  const what = active.topic || (active.roomName ? `in ${active.roomName}` : "Solo session");

  async function stop() {
    setBusy(true);
    setFailed(false);
    try {
      const stopped = await api<Session>("/api/sessions/stop", { method: "POST" });
      publishActive(null);
      void announceSessionEnd(stopped);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (collapsed) {
    return (
      <Link
        href={href}
        title={`Recording · ${clock} · ${what}`}
        className="animate-pop mx-3 mb-2 flex flex-col items-center gap-1 rounded-lg border bg-background py-2 hover:bg-accent/60"
      >
        <RecordingDot />
        <span className="font-mono text-[10px] leading-none tabular-nums">{clock}</span>
      </Link>
    );
  }

  return (
    <div className="animate-pop relative isolate mx-3 mb-2 rounded-xl border bg-background p-3">
      <span
        aria-hidden
        className="animate-breathe pointer-events-none absolute -inset-1 -z-10 rounded-2xl bg-brand/10 blur-lg"
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RecordingDot />
        <span className="truncate">{auto ? "Auto · Pomodoro" : "Recording"}</span>
      </div>
      <Link href={href} className="mt-1 block" aria-label="Open the session">
        <ClockText className="font-mono text-2xl font-medium tracking-tight tabular-nums" value={clock} />
      </Link>
      <p className="truncate text-xs text-muted-foreground">{what}</p>
      {auto ? (
        <Link
          href={href}
          className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-lg border bg-card text-xs font-medium shadow-xs hover:bg-accent"
        >
          Open room
        </Link>
      ) : (
        <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={stop} loading={busy}>
          <Square className="fill-current" /> Stop
        </Button>
      )}
      {failed && (
        <p role="alert" className="mt-1.5 text-xs text-destructive-foreground">
          Couldn&apos;t stop. Try again.
        </p>
      )}
    </div>
  );
}

/** The sidebar's content. Used by the desktop sidebar and, always open, by the mobile drawer. */
export function SidebarBody({
  collapsed,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  /** Desktop: collapse or expand. */
  onToggle?: () => void;
  /** Mobile drawer: close it. */
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const rooms = useMyRooms();
  const active = useActiveSession();
  const key = activeKeyFor(pathname);

  // One highlight slides between the items (pages, rooms). It is moved by hand instead of through
  // state, so a page change costs no re-render and the very first placement doesn't animate.
  const navRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const roomCount = rooms?.length ?? -1;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const place = () => {
      const el = key ? nav.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) : null;
      if (!el) {
        pill.style.opacity = "0";
        return;
      }
      const first = pill.dataset.placed !== "1";
      if (first) pill.style.transition = "none";
      pill.style.height = `${el.offsetHeight}px`;
      pill.style.transform = `translateY(${el.offsetTop}px)`;
      pill.style.opacity = "1";
      if (first) {
        void pill.offsetHeight; // flush, so the jump above isn't animated
        pill.style.transition = "";
        pill.dataset.placed = "1";
      }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [key, roomCount, collapsed]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b px-5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight" aria-label="Study Online">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
            <BookOpen className="size-4" />
          </span>
          <span className={cx("truncate transition-opacity duration-200 motion-reduce:transition-none", collapsed && "opacity-0")}>
            Study Online
          </span>
        </Link>
        {onClose && (
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="Close menu" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <div ref={navRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-3">
        <div
          ref={pillRef}
          aria-hidden
          className="pointer-events-none absolute top-0 right-3 left-3 rounded-lg bg-accent opacity-0 transition-[transform,height,opacity] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand motion-reduce:transition-none"
        />

        <div className="flex flex-col gap-0.5">
          <Item
            href="/dashboard"
            dataKey="dashboard"
            active={key === "dashboard"}
            collapsed={collapsed}
            icon={<LayoutDashboard />}
            label="Dashboard"
          />
          <Item
            href="/settings/profile"
            dataKey="settings"
            active={key === "settings"}
            collapsed={collapsed}
            icon={<Settings />}
            label="Settings"
          />
        </div>

        {collapsed ? (
          <div className="mx-5 my-3 h-px bg-border" />
        ) : (
          <div className="mt-5 mb-1 px-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">My rooms</div>
        )}

        <div className="flex flex-col gap-0.5">
          {rooms === null ? (
            <div className={cx("flex flex-col gap-2 px-5", collapsed && "items-center")}>
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : rooms.length === 0 ? (
            !collapsed && (
              <p className="px-6 text-sm text-muted-foreground">
                No rooms yet.{" "}
                <Link href="/dashboard" className="underline underline-offset-4 hover:text-foreground">
                  Create or join one
                </Link>
              </p>
            )
          ) : (
            rooms.map((room, i) => {
              const recording = active?.roomId === room.id;
              return (
                <Item
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  dataKey={`room:${room.id}`}
                  active={key === `room:${room.id}`}
                  collapsed={collapsed}
                  label={room.name}
                  title={recording ? `${room.name} · you're studying here` : room.name}
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  className="animate-item-in"
                  icon={
                    <span className="relative flex size-5 items-center justify-center rounded-md bg-secondary text-[11px] font-semibold text-foreground">
                      {room.name.trim().charAt(0).toUpperCase() || "#"}
                      {recording && (
                        <span className="absolute -top-0.5 -right-0.5 rounded-full ring-2 ring-card">
                          <RecordingDot />
                        </span>
                      )}
                    </span>
                  }
                  trailing={
                    <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${room.memberCount} members`}>
                      {room.memberCount}
                    </span>
                  }
                />
              );
            })
          )}
        </div>

        {/* Sobo mascot: lives in the scrollable zone, so it can never squeeze the timer or the Collapse button. */}
                {!collapsed && (
          <div className="sobo-slot mt-6 px-3">
            <SoboMascot className="aspect-square w-full" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t pt-3 pb-3">
        <MiniTimer collapsed={collapsed} />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mx-3 flex h-9 w-[calc(100%-1.5rem)] items-center gap-3 overflow-hidden rounded-lg px-[14px] text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground motion-reduce:transition-none"
          >
            <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">
              {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            </span>
            <span className={cx("truncate transition-opacity duration-200 motion-reduce:transition-none", collapsed && "opacity-0")}>
              Collapse
            </span>
          </button>
        )}
      </div>
    </div>
  );
}