"use client";

import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock,
  Compass,
  Flame,
  History,
  KeyRound,
  Lock,
  Plus,
  Share2,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/app-header";
import { DailyGoal } from "@/components/daily-goal";
import { ShareDialog } from "@/components/share-dialog";
import { StudyTimer } from "@/components/study-timer";
import { Todos } from "@/components/todos";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDuration, greeting, shortWeekday, timeZone } from "@/lib/format";
import type { Me, Room, Session, Stats } from "@/lib/types";
import { useNow } from "@/lib/use-now";

type RoomLists = { mine: Room[]; public: Room[] };

export default function Dashboard() {
  const [rooms, setRooms] = useState<RoomLists | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const now = useNow(false);

  const load = useCallback(async () => {
    try {
      const [r, s, a, user] = await Promise.all([
        api<RoomLists>("/api/rooms"),
        api<{ stats: Stats; recent: Session[] }>(`/api/sessions/stats?tz=${encodeURIComponent(timeZone())}`),
        api<Session | null>("/api/sessions/active"),
        api<Me>("/api/me"),
      ]);
      setMe(user);
      setRooms(r);
      setStats(s.stats);
      setRecent(s.recent);
      setActive(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const date = now ? new Date(now) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={date?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) ?? " "}
        title={me && date ? `${greeting(date)}, ${me.displayName.split(" ")[0]}` : <Skeleton className="h-9 w-72" />}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/account/settings" className="underline-offset-4 hover:text-foreground hover:underline">
              Change your display name
            </Link>
            {me && (
              <Link
                href={me.username ? `/u/${me.username}` : "/settings/profile"}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {me.username ? "View your profile" : "Choose a username"}
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog("join")}>
              <KeyRound /> Join with code
            </Button>
            <Button onClick={() => setDialog("create")}>
              <Plus /> New room
            </Button>
          </>
        }
      />
      <Alert tone="danger">{error && `Couldn't load your data: ${error}`}</Alert>

      {me && !me.username && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Claim your username</p>
              <p className="text-sm text-muted-foreground">
                Get a public profile with your study heatmap, and let friends find you.
              </p>
            </div>
            <Link
              href="/settings/profile"
              className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
            >
              Choose username
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {stats && me ? (
          <DailyGoal todaySeconds={stats.todaySeconds} goalMinutes={me.dailyGoalMinutes} onGoalChange={setMe} />
        ) : (
          <Skeleton className="h-64" />
        )}
        <StatsCard
          stats={stats}
          goalMinutes={me?.dailyGoalMinutes}
          onShare={stats && me ? () => setShareOpen(true) : undefined}
          className="lg:col-span-2"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Todos className="lg:col-span-2" />
        <StudyTimer
          active={active}
          onChange={(s) => {
            setActive(s);
            if (!s) load();
          }}
        />
      </div>

      <RoomsSection rooms={rooms} onCreate={() => setDialog("create")} />
      <RecentSessions sessions={recent} />

      {stats && me && <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} stats={stats} me={me} />}
      <CreateRoomDialog open={dialog === "create"} onClose={() => setDialog(null)} />
      <JoinDialog open={dialog === "join"} onClose={() => setDialog(null)} />
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function StatsCard({
  stats,
  goalMinutes,
  onShare,
  className,
}: {
  stats: Stats | null;
  goalMinutes?: number;
  onShare?: () => void;
  className?: string;
}) {
  if (!stats) return <Skeleton className={`h-64 ${className}`} />;
  const goal = (goalMinutes ?? 0) * 60;
  const max = Math.max(goal, 1, ...stats.last7Days.map((d) => d.seconds));
  return (
    <Card className={className}>
      <CardHeader
        icon={<BarChart3 />}
        title="Your progress"
        description="Last 7 days"
        action={
          onShare && (
            <Button variant="secondary" size="sm" onClick={onShare} aria-label="Share your progress">
              <Share2 /> <span className="hidden sm:inline">Share</span>
            </Button>
          )
        }
      />
      <CardBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat icon={<Clock />} label="Today" value={formatDuration(stats.todaySeconds)} />
          <Stat icon={<CalendarDays />} label="This week" value={formatDuration(stats.weekSeconds)} />
          <Stat icon={<Flame />} label="Streak" value={`${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}`} />
          <Stat icon={<Trophy />} label="All time" value={formatDuration(stats.totalSeconds)} />
        </div>
        <div className="relative">
          {goal > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-brand/60"
              style={{ bottom: `${24 + (goal / max) * 112}px` }}
            >
              <span className="absolute -top-5 right-0 text-[10px] font-medium text-brand">daily goal</span>
            </div>
          )}
          <div className="flex h-[136px] items-end gap-2 sm:gap-3" aria-label="Study time, last 7 days">
            {stats.last7Days.map((d, i) => {
              const today = i === stats.last7Days.length - 1;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`w-full max-w-12 rounded-md transition-all ${
                      goal > 0 && d.seconds >= goal ? "bg-brand" : today ? "bg-brand/70" : "bg-brand/35"
                    }`}
                    style={{ height: `${Math.max(4, (d.seconds / max) * 112)}px` }}
                    title={`${d.date}: ${formatDuration(d.seconds)}`}
                  />
                  <span className={`text-xs ${today ? "font-semibold" : "text-muted-foreground"}`}>{shortWeekday(d.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function RoomsSection({ rooms, onCreate }: { rooms: RoomLists | null; onCreate: () => void }) {
  const [tab, setTab] = useState<"mine" | "public">("mine");
  const list = rooms?.[tab];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Study rooms</h2>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "mine", label: `My rooms${rooms ? ` (${rooms.mine.length})` : ""}` },
            { value: "public", label: "Discover" },
          ]}
        />
      </div>
      {!list ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : list.length === 0 ? (
        tab === "mine" ? (
          <EmptyState
            icon={<Users />}
            title="You haven't joined any rooms yet"
            description="Create your own room or find a public one in Discover."
            action={
              <Button onClick={onCreate}>
                <Plus /> Create a room
              </Button>
            }
          />
        ) : (
          <EmptyState icon={<Compass />} title="No public rooms to discover" description="Be the first: create a public room." />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoomCard({ room }: { room: Room }) {
  const full = room.memberCount >= room.maxMembers;
  return (
    <Link
      href={`/rooms/${room.id}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 font-semibold">{room.name}</h3>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{room.description || "No description"}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Badge>
          <Users /> {room.memberCount}/{room.maxMembers}
        </Badge>
        {room.visibility === "private" && (
          <Badge>
            <Lock /> Private
          </Badge>
        )}
        {room.myRole && room.myRole !== "member" && <Badge tone="brand">{room.myRole}</Badge>}
        {!room.myRole && full && <Badge tone="warning">Full</Badge>}
      </div>
    </Link>
  );
}

function RecentSessions({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return null;
  return (
    <Card>
      <CardHeader icon={<History />} title="Recent sessions" />
      <CardBody className="pt-3">
        <ul className="divide-y">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.topic || "Untitled session"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {new Date(s.startedAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {s.roomName ?? "Solo"}
                </div>
              </div>
              <div className="shrink-0 font-medium tabular-nums">
                {s.endedAt ? formatDuration(s.seconds) : <Badge tone="brand">● Live</Badge>}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function CreateRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [maxMembers, setMaxMembers] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const room = await api<Room>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name, description, visibility, maxMembers }),
      });
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create a study room" description="Invite friends or open it to everyone.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="e.g. SAT Math prep" autoFocus />
        </Field>
        <Field label="Description" hint="Optional. What will people study here?">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} />
        </Field>
        <div className="flex gap-3">
          <Field label="Visibility" className="flex-1">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
              <option value="public">Public: anyone can join</option>
              <option value="private">Private: invite code only</option>
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
            Create room
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function JoinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const room = await api<Room>("/api/rooms/join", { method: "POST", body: JSON.stringify({ code }) });
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Join with an invite code" description="Ask the room owner for their code.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          placeholder="e.g. 3f9a1c0b7d"
          className="font-mono"
          autoFocus
        />
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Join room
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
