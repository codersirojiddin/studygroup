"use client";

import { CalendarDays, Clock, Flame, History, Lock, Pencil, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { AppShell, PublicShell } from "@/components/app-header";
import { Heatmap } from "@/components/heatmap";
import { SocialLinks } from "@/components/social-links";
import { Alert, Avatar, Card, CardBody, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import { api, ApiError, publicApi } from "@/lib/api";
import { formatDuration, timeZone } from "@/lib/format";
import type { Me, Profile } from "@/lib/types";
import { useNow } from "@/lib/use-now";

type State = "loading" | "ready" | "missing" | "error";

const editLink =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent [&_svg]:size-4";

export function ProfileClient({ username, signedIn }: { username: string; signedIn: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<State>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const now = useNow(false);

  useEffect(() => {
    let cancelled = false;
    publicApi<Profile>(`/api/profiles/${encodeURIComponent(username)}?tz=${encodeURIComponent(timeZone())}`)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setState("ready");
      })
      .catch((e) => {
        if (!cancelled) setState(e instanceof ApiError && e.status === 404 ? "missing" : "error");
      });
    if (signedIn) {
      api<Me>("/api/me")
        .then((m) => !cancelled && setMe(m))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [username, signedIn]);

  const isMe = me?.username === username.toLowerCase();

  let content: ReactNode;
  if (state === "loading" || !now) {
    content = (
      <>
        <Skeleton className="h-36" />
        <Skeleton className="h-24" />
        <Skeleton className="h-52" />
      </>
    );
  } else if (state === "missing") {
    content = isMe ? (
      <EmptyState
        icon={<Lock />}
        title="Your profile is private"
        description="Only you can see that this page exists. Turn on a public profile to let others find it."
        action={
          <Link href="/settings/profile" className={editLink}>
            Open profile settings
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={<Lock />}
        title="Profile not found"
        description={`There's no public profile for @${username}.`}
      />
    );
  } else if (state === "error" || !profile) {
    content = <Alert tone="danger">Couldn&apos;t load this profile. Try again in a moment.</Alert>;
  } else {
    const a = profile.activity;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    content = (
      <>
        <Card>
          <CardBody className="flex flex-wrap items-center gap-5">
            <Avatar name={profile.displayName} seed={profile.username} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="font-heading truncate text-2xl font-semibold tracking-tight md:text-3xl">
                {profile.displayName}
              </h1>
              <p className="text-muted-foreground">@{profile.username}</p>
              {profile.bio && <p className="mt-2 max-w-prose text-pretty">{profile.bio}</p>}
              <SocialLinks socials={profile.socials} />
              <p className="mt-2 text-xs text-muted-foreground">
                Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </p>
            </div>
            {isMe && (
              <Link href="/settings/profile" className={editLink}>
                <Pencil /> Edit profile
              </Link>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile icon={<Clock />} label="Total study time" value={formatDuration(a.totalSeconds)} />
          <StatTile icon={<History />} label="Sessions" value={String(a.sessionCount)} />
          <StatTile icon={<Flame />} label="Current streak" value={plural(a.streakDays, "day")} />
          <StatTile icon={<Trophy />} label="Longest streak" value={plural(a.longestStreakDays, "day")} />
        </div>

        <Card>
          <CardHeader
            icon={<CalendarDays />}
            title={`${plural(a.activeDays, "study day")} in the last year`}
            description="Each square is a day. Sessions count toward the day they started."
          />
          <CardBody>
            <Heatmap
              days={a.days}
              now={now}
              label={`Study activity over the last year: ${plural(a.activeDays, "active day")}`}
            />
          </CardBody>
        </Card>
      </>
    );
  }

  return signedIn ? <AppShell>{content}</AppShell> : <PublicShell>{content}</PublicShell>;
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      </CardBody>
    </Card>
  );
}
