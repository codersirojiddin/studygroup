"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  DoorOpen,
  Lock,
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AppShell } from "@/components/app-header";
import { Pomodoro } from "@/components/pomodoro";
import { StudyTimer } from "@/components/study-timer";
import { useAutoTrack, useStoredBool } from "@/lib/use-auto-track";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  cx,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  useConfirm,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatClock, formatDuration, secondsSince, timeZone } from "@/lib/format";
import type { ChatMessage, LeaderboardEntry, Me, Member, PresenceMember, Role, Room, Session, Timer } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { useRoomRealtime, type RoomEvent } from "@/lib/use-room-realtime";

const canEdit = (role?: Role) => role === "owner" || role === "moderator";

/** Shared timer plus this client's clock offset from the server (ms). */
type TimerClock = { timer: Timer; offsetMs: number };

export function RoomClient({ id }: { id: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [active, setActive] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [clock, setClock] = useState<TimerClock | null>(null);

  const applyTimer = useCallback((timer: Timer, serverNow: string) => {
    setClock({ timer, offsetMs: new Date(serverNow).getTime() - Date.now() });
  }, []);

  const load = useCallback(async () => {
    try {
      const [detail, user, session] = await Promise.all([
        api<{ room: Room; members: Member[]; timer?: Timer; serverNow: string }>(`/api/rooms/${id}`),
        api<Me>("/api/me"),
        api<Session | null>("/api/sessions/active"),
      ]);
      setRoom(detail.room);
      setMembers(detail.members);
      if (detail.timer) applyTimer(detail.timer, detail.serverNow);
      setMe(user);
      setActive(session);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError((e as Error).message);
    }
  }, [id, applyTimer]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  if (notFound) {
    return (
      <AppShell>
        <EmptyState
          icon={<DoorOpen />}
          title="Room not found"
          description="It may have been deleted, or it's a private room you haven't joined."
          action={<Button onClick={() => router.push("/dashboard")}>Back to dashboard</Button>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link href="/dashboard" className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <Alert tone="danger">{error}</Alert>
      {!room || !me ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      ) : room.myRole ? (
        <MemberView
          room={room}
          members={members}
          me={me}
          active={active}
          setActive={setActive}
          reload={load}
          clock={clock}
          applyTimer={applyTimer}
        />
      ) : (
        <Preview room={room} onJoined={load} />
      )}
    </AppShell>
  );
}

function RoomTitle({ room }: { room: Room }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">{room.name}</h1>
        {room.visibility === "private" && (
          <Badge>
            <Lock /> Private
          </Badge>
        )}
        {room.myRole && room.myRole !== "member" && <Badge tone="brand">{room.myRole}</Badge>}
      </div>
      {room.description && <p className="mt-1.5 max-w-2xl whitespace-pre-line text-muted-foreground">{room.description}</p>}
    </div>
  );
}

function Preview({ room, onJoined }: { room: Room; onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = room.memberCount >= room.maxMembers;
  async function join() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/rooms/${room.id}/join`, { method: "POST" });
      onJoined();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Users className="size-6" />
        </div>
        <RoomTitle room={room} />
        <p className="text-sm text-muted-foreground">
          {room.memberCount} of {room.maxMembers} seats taken
        </p>
        <Button size="lg" variant="brand" onClick={join} loading={busy} disabled={full}>
          {full ? "Room is full" : "Join this room"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </CardBody>
    </Card>
  );
}

function MemberView({
  room,
  members,
  me,
  active,
  setActive,
  reload,
  clock,
  applyTimer,
}: {
  room: Room;
  members: Member[];
  me: Me;
  active: Session | null;
  setActive: (s: Session | null) => void;
  reload: () => void;
  clock: TimerClock | null;
  applyTimer: (timer: Timer, serverNow: string) => void;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"invite" | "settings" | null>(null);
  const chat = useChatHistory(room.id);
  const [boardVersion, setBoardVersion] = useState(0);
  const [trackFocus, setTrackFocus] = useStoredBool("study-online:track-focus", true);
  const bumpBoard = useCallback(() => setBoardVersion((v) => v + 1), []);
  const { dismiss } = useAutoTrack({
    roomId: room.id,
    clock,
    active,
    setActive,
    enabled: trackFocus,
    onChange: bumpBoard,
  });

  const live = useRoomRealtime(room.id, {
    onEvent: (e: RoomEvent) => {
      if (e === "kicked" || e === "room_deleted") {
        setNotice(e === "kicked" ? "You are no longer a member of this room." : "This room was deleted.");
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        reload();
      }
    },
    onTimer: applyTimer,
    onChat: chat.add,
    onChatDeleted: chat.remove,
    onConnected: () => {
      chat.refresh();
      // The server ends Pomodoro sessions when a connection drops; pick up the real state.
      api<Session | null>("/api/sessions/active")
        .then(setActive)
        .catch(() => {});
    },
  });

  return (
    <>
      <Alert>{notice}</Alert>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <RoomTitle room={room} />
        <RoomActions room={room} onInvite={() => setDialog("invite")} onSettings={() => setDialog("settings")} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            {clock ? (
              <Pomodoro
                roomId={room.id}
                timer={clock.timer}
                offsetMs={clock.offsetMs}
                canControl={canEdit(room.myRole)}
                onUpdated={applyTimer}
                track={trackFocus}
                onTrackChange={setTrackFocus}
              />
            ) : (
              <Skeleton className="h-80" />
            )}
            <StudyTimer
              active={active}
              roomId={room.id}
              onChange={(s) => {
                // Stopping an automatic session by hand means "not this focus phase".
                if (s === null && active?.source === "pomodoro") dismiss();
                setActive(s);
                setBoardVersion((v) => v + 1);
              }}
            />
          </div>
          <Chat
            room={room}
            me={me}
            chat={chat}
            send={live.sendChat}
            error={live.error}
            connected={live.connected}
          />
        </div>
        <div className="flex flex-col gap-4">
          <People room={room} members={members} me={me} presence={live.presence} connected={live.connected} onChange={reload} />
          <Leaderboard roomId={room.id} myId={me.id} version={boardVersion} />
        </div>
      </div>

      {canEdit(room.myRole) && (
        <>
          <InviteDialog open={dialog === "invite"} onClose={() => setDialog(null)} room={room} onChange={reload} />
          <SettingsDialog
            key={room.name + room.description + room.visibility + room.maxMembers}
            open={dialog === "settings"}
            onClose={() => setDialog(null)}
            room={room}
            onSaved={reload}
          />
        </>
      )}
    </>
  );
}

function RoomActions({ room, onInvite, onSettings }: { room: Room; onInvite: () => void; onSettings: () => void }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leaveOrDelete() {
    const owner = room.myRole === "owner";
    const ok = await confirm(
      owner
        ? {
            title: `Delete "${room.name}"?`,
            description: "Everyone will be removed and the chat history deleted. This can't be undone.",
            confirmLabel: "Delete room",
            danger: true,
          }
        : { title: `Leave "${room.name}"?`, description: "You can rejoin later if the room has space.", confirmLabel: "Leave" },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api(owner ? `/api/rooms/${room.id}` : `/api/rooms/${room.id}/leave`, { method: owner ? "DELETE" : "POST" });
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {canEdit(room.myRole) && (
          <>
            <Button variant="secondary" onClick={onInvite}>
              <UserPlus /> Invite
            </Button>
            <Button variant="secondary" size="icon" onClick={onSettings} aria-label="Room settings">
              <Settings />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          onClick={leaveOrDelete}
          loading={busy}
          className="text-destructive-foreground hover:text-destructive-foreground"
        >
          {room.myRole === "owner" ? (
            <>
              <Trash2 /> Delete
            </>
          ) : (
            <>
              <LogOut /> Leave
            </>
          )}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {dialog}
    </div>
  );
}

/* ---------- People: members merged with live presence ---------- */

function People({
  room,
  members,
  me,
  presence,
  connected,
  onChange,
}: {
  room: Room;
  members: Member[];
  me: Me;
  presence: PresenceMember[];
  connected: boolean;
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const live = new Map(presence.map((p) => [p.userId, p]));
  const now = useNow(presence.some((p) => p.studying));
  const myRole = room.myRole;

  // Online first (studying before idle), then offline; keep role order within groups.
  const rank = (m: Member) => {
    const p = live.get(m.userId);
    return p?.studying ? 0 : p ? 1 : 2;
  };
  const sorted = [...members].sort((a, b) => rank(a) - rank(b));
  const onlineCount = members.filter((m) => live.has(m.userId)).length;

  async function act(m: Member, kind: "promote" | "demote" | "remove") {
    setMenu(null);
    if (kind === "remove") {
      const ok = await confirm({
        title: `Remove ${m.displayName}?`,
        description: "They'll be disconnected from the room. They can rejoin a public room later.",
        confirmLabel: "Remove",
        danger: true,
      });
      if (!ok) return;
    }
    setError(null);
    try {
      await api(
        `/api/rooms/${room.id}/members/${m.userId}`,
        kind === "remove"
          ? { method: "DELETE" }
          : { method: "PATCH", body: JSON.stringify({ role: kind === "promote" ? "moderator" : "member" }) },
      );
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Users />}
        title="People"
        description={`${onlineCount} online · ${members.length}/${room.maxMembers} members`}
        action={
          <span className={cx("flex items-center gap-1.5 text-xs", connected ? "text-brand" : "text-muted-foreground")}>
            <span className={cx("size-1.5 rounded-full", connected ? "animate-pulse bg-brand" : "bg-muted-foreground")} />
            {connected ? "Live" : "Reconnecting"}
          </span>
        }
      />
      <CardBody className="pt-3">
        <ul className="-mx-2 flex flex-col">
          {sorted.map((m) => {
            const p = live.get(m.userId);
            const self = m.userId === me.id;
            const canKick = !self && (myRole === "owner" || (myRole === "moderator" && m.role === "member"));
            const canPromote = !self && myRole === "owner" && m.role !== "owner";
            return (
              <li key={m.userId} className="relative flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
                <Avatar name={m.displayName} seed={m.userId} status={p?.studying ? "studying" : p ? "online" : "offline"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cx("truncate text-sm font-medium", !p && "text-muted-foreground")}>{m.displayName}</span>
                    {self && <span className="text-xs text-muted-foreground">(you)</span>}
                    {m.role === "owner" && <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="owner" />}
                    {m.role === "moderator" && <Shield className="size-3.5 shrink-0 text-break" aria-label="moderator" />}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p?.studying && p.since ? (
                      <span className="text-brand">
                        Studying {formatClock(now ? secondsSince(p.since, now) : 0)}
                        {p.topic && ` · ${p.topic}`}
                      </span>
                    ) : p ? (
                      "Online"
                    ) : (
                      "Offline"
                    )}
                  </div>
                </div>
                {(canKick || canPromote) && (
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Manage ${m.displayName}`}
                      onClick={() => setMenu(menu === m.userId ? null : m.userId)}
                    >
                      <MoreHorizontal />
                    </Button>
                    {menu === m.userId && (
                      <div
                        className="absolute top-9 right-0 z-20 w-48 rounded-lg border bg-popover p-1 shadow-lg"
                        onMouseLeave={() => setMenu(null)}
                      >
                        {canPromote && (
                          <MenuItem onClick={() => act(m, m.role === "moderator" ? "demote" : "promote")}>
                            <Shield /> {m.role === "moderator" ? "Remove moderator" : "Make moderator"}
                          </MenuItem>
                        )}
                        {canKick && (
                          <MenuItem danger onClick={() => act(m, "remove")}>
                            <UserMinus /> Remove from room
                          </MenuItem>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <ErrorText>{error}</ErrorText>
      </CardBody>
      {dialog}
    </Card>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent [&_svg]:size-4",
        danger && "text-destructive-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Leaderboard ---------- */

function Leaderboard({ roomId, myId, version }: { roomId: string; myId: string; version: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<{ entries: LeaderboardEntry[] }>(`/api/rooms/${roomId}/leaderboard?tz=${encodeURIComponent(timeZone())}`)
        .then((r) => !cancelled && setEntries(r.entries))
        .catch(() => {});
    load();
    // Running sessions keep adding time, so refresh periodically.
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId, version]);

  const top = entries?.[0]?.seconds ?? 0;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card>
      <CardHeader icon={<Trophy />} title="This week" description="Focus time in this room since Monday" />
      <CardBody className="pt-3">
        {!entries ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : top === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">No study time yet this week. Be the first!</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {entries.slice(0, 10).map((e, i) => (
              <li key={e.userId} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-medium text-muted-foreground tabular-nums">
                  {e.seconds > 0 && i < 3 ? medals[i] : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cx("truncate text-sm", e.userId === myId && "font-semibold")}>
                      {e.displayName}
                      {e.userId === myId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums">{formatDuration(e.seconds)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(e.seconds / top) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------- Chat ---------- */

type ChatState = ReturnType<typeof useChatHistory>;

/** Chat messages: saved history plus live messages, deduplicated by id. */
function useChatHistory(roomId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const merge = (prev: ChatMessage[], incoming: ChatMessage[]) => {
    const byId = new Map(prev.map((m) => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  };

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/rooms/${roomId}/messages?limit=50`);
      setMessages((prev) => merge(prev, r.messages));
      setHasMore((h) => (loaded ? h : r.hasMore));
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [roomId, loaded]);

  const loadMore = useCallback(async () => {
    if (messages.length === 0) return;
    setLoadingMore(true);
    try {
      const before = encodeURIComponent(messages[0].sentAt);
      const r = await api<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/api/rooms/${roomId}/messages?limit=50&before=${before}`,
      );
      setMessages((prev) => merge(prev, r.messages));
      setHasMore(r.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [roomId, messages]);

  const add = useCallback((m: ChatMessage) => setMessages((prev) => merge(prev, [m])), []);
  const remove = useCallback((id: string) => setMessages((prev) => prev.filter((m) => m.id !== id)), []);

  return { messages, hasMore, loadingMore, loaded, refresh, loadMore, add, remove };
}

function Chat({
  room,
  me,
  chat,
  send,
  error,
  connected,
}: {
  room: Room;
  me: Me;
  chat: ChatState;
  send: (text: string) => boolean;
  error: string | null;
  connected: boolean;
}) {
  const [text, setText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastId = chat.messages.at(-1)?.id;

  // Follow new messages only when already at the bottom (don't yank while reading history).
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (t && send(t)) {
      setText("");
      stickToBottom.current = true;
    }
  }

  async function remove(m: ChatMessage) {
    setDeleteError(null);
    try {
      await api(`/api/rooms/${room.id}/messages/${m.id}`, { method: "DELETE" });
      chat.remove(m.id);
    } catch (e) {
      setDeleteError((e as Error).message);
    }
  }

  const mod = canEdit(room.myRole);

  return (
    <Card className="flex flex-col">
      <CardHeader icon={<MessagesSquare />} title="Room chat" description="Messages are saved for this room" />
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="mt-3 flex h-96 flex-col overflow-y-auto border-y px-5 py-4"
      >
        {chat.hasMore && (
          <Button variant="ghost" size="sm" className="mx-auto mb-3" onClick={chat.loadMore} loading={chat.loadingMore}>
            <RefreshCw /> Load earlier messages
          </Button>
        )}
        {!chat.loaded ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="m-auto text-center text-sm text-muted-foreground">
            <MessagesSquare className="mx-auto mb-2 size-6 opacity-50" />
            No messages yet. Say hi 👋
          </div>
        ) : (
          chat.messages.map((m, i) => {
            const mine = m.userId === me.id;
            const prev = chat.messages[i - 1];
            const grouped =
              prev && prev.userId === m.userId && new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() < 5 * 60_000;
            return (
              <div key={m.id} className={cx("group flex gap-2.5", mine && "flex-row-reverse", grouped ? "mt-1" : "mt-4 first:mt-0")}>
                <div className="w-7 shrink-0">{!grouped && !mine && <Avatar name={m.displayName} seed={m.userId} size="sm" />}</div>
                <div className={cx("flex max-w-[75%] flex-col", mine && "items-end")}>
                  {!grouped && (
                    <div className="mb-1 text-xs text-muted-foreground">
                      {mine ? "You" : m.displayName} ·{" "}
                      {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                  <div className={cx("flex items-center gap-1", mine && "flex-row-reverse")}>
                    <div
                      className={cx(
                        "rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                        mine ? "rounded-tr-md bg-primary text-primary-foreground" : "rounded-tl-md bg-muted",
                      )}
                    >
                      {m.text}
                    </div>
                    {(mine || mod) && (
                      <button
                        onClick={() => remove(m)}
                        aria-label="Delete message"
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive-foreground focus-visible:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 p-4">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={connected ? "Message the room…" : "Reconnecting…"}
          disabled={!connected}
        />
        <Button type="submit" size="icon" disabled={!connected || !text.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
      {(error || deleteError) && (
        <div className="px-4 pb-4">
          <ErrorText>{error ?? deleteError}</ErrorText>
        </div>
      )}
    </Card>
  );
}

/* ---------- Dialogs ---------- */

function InviteDialog({ open, onClose, room, onChange }: { open: boolean; onClose: () => void; room: Room; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function copy() {
    if (!room.inviteCode) return;
    await navigator.clipboard.writeText(room.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    const ok = await confirm({
      title: "Create a new invite code?",
      description: "The current code will stop working immediately.",
      confirmLabel: "Create new code",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/rooms/${room.id}/invite`, { method: "POST" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite people"
      description={
        room.visibility === "private"
          ? "Share this code. People enter it under “Join with code” on their dashboard."
          : "Anyone can find this public room under Discover. The code works too."
      }
    >
      <div className="flex items-center gap-2">
        <code className="flex h-11 flex-1 items-center rounded-lg border bg-muted px-4 font-mono text-lg tracking-wider">
          {room.inviteCode}
        </code>
        <Button variant="secondary" size="lg" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="self-start" onClick={regenerate} loading={busy}>
        <RefreshCw /> Generate a new code
      </Button>
      {dialog}
    </Dialog>
  );
}

function SettingsDialog({ open, onClose, room, onSaved }: { open: boolean; onClose: () => void; room: Room; onSaved: () => void }) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [visibility, setVisibility] = useState(room.visibility);
  const [maxMembers, setMaxMembers] = useState(room.maxMembers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, visibility, maxMembers }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Room settings">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        <div className="flex gap-3">
          <Field label="Visibility" className="flex-1">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Room["visibility"])}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </Select>
          </Field>
          <Field label="Max members" className="w-28">
            <Input type="number" min={2} max={100} value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
