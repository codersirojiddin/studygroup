"use client";

import { BarChart3, CalendarDays, Clock, Flame, Share2, Trophy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { CountUp } from "@/components/count-up";
import { Button, Card, CardBody, CardHeader, cx, Skeleton } from "@/components/ui";
import { formatDuration, shortWeekday } from "@/lib/format";
import type { Stats } from "@/lib/types";

const BAR_AREA = 112; // px, the tallest bar

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
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

/** Seven bars that grow from the baseline one after another (with a little overshoot) when they first show. */
function WeekBars({ days, goal, max }: { days: Stats["last7Days"]; goal: number; max: number }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGrown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  return (
    <div className="relative">
      {goal > 0 && (
        <div
          className={cx(
            "pointer-events-none absolute inset-x-0 border-t border-dashed border-brand/60 transition-opacity delay-700 duration-500",
            grown ? "opacity-100" : "opacity-0",
          )}
          style={{ bottom: `${24 + (goal / max) * BAR_AREA}px` }}
        >
          <span className="absolute -top-5 right-0 text-[10px] font-medium text-brand">daily goal</span>
        </div>
      )}
      <div className="flex h-[136px] items-end gap-2 sm:gap-3" aria-label="Study time, last 7 days">
        {days.map((d, i) => {
          const today = i === days.length - 1;
          const hit = goal > 0 && d.seconds >= goal;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cx(
                  "w-full max-w-12 rounded-md",
                  hit ? "bg-brand shadow-[0_0_14px_-2px_var(--brand)]" : today ? "bg-brand/70" : "bg-brand/35",
                )}
                style={{
                  height: `${grown ? Math.max(4, (d.seconds / max) * BAR_AREA) : 4}px`,
                  transition: `height 800ms cubic-bezier(0.2, 1.25, 0.3, 1) ${i * 70}ms, background-color 300ms, box-shadow 300ms`,
                }}
                title={`${d.date}: ${formatDuration(d.seconds)}`}
              />
              <span className={`text-xs ${today ? "font-semibold" : "text-muted-foreground"}`}>{shortWeekday(d.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Your progress": four numbers that count up, and the last seven days as growing bars. */
export function StatsCard({
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
          <Stat icon={<Clock />} label="Today" value={<CountUp value={stats.todaySeconds} format={formatDuration} />} />
          <Stat icon={<CalendarDays />} label="This week" value={<CountUp value={stats.weekSeconds} format={formatDuration} />} />
          <Stat
            icon={<Flame className={cx(stats.streakDays > 0 && "flame-live text-orange-500")} />}
            label="Streak"
            value={<CountUp value={stats.streakDays} format={(n) => `${n} day${n === 1 ? "" : "s"}`} duration={700} />}
          />
          <Stat icon={<Trophy />} label="All time" value={<CountUp value={stats.totalSeconds} format={formatDuration} />} />
        </div>
        <WeekBars days={stats.last7Days} goal={goal} max={max} />
      </CardBody>
    </Card>
  );
}
