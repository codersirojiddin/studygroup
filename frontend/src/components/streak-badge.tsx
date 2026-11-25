"use client";

import { Flame } from "lucide-react";
import { useEffect, useState } from "react";

import { cx } from "@/components/ui";
import { useDismissals } from "@/lib/celebrations";
import { ensureStats, useStats } from "@/lib/progress-store";
import { useNow } from "@/lib/use-now";

type Risk = "none" | "low" | "medium" | "high";

/**
 * The streak flame in the header. It calmly flickers while the streak is safe for today. If the
 * streak is alive but today is still empty it grows restless as the evening goes on, and trembles
 * in the last hours before midnight. After the celebration the flame that flew up here bumps.
 */
export function StreakBadge() {
  const stats = useStats();
  const now = useNow(true);
  const bumps = useDismissals("streak");
  const [bumpsAtMount] = useState(bumps);

  useEffect(() => {
    ensureStats();
  }, []);

  if (!stats) return null;
  const streak = stats.streakDays;
  const studiedToday = stats.todaySeconds > 0;
  const hour = now ? new Date(now).getHours() : 0;
  const risk: Risk = streak > 0 && !studiedToday ? (hour >= 20 ? "high" : hour >= 17 ? "medium" : "low") : "none";

  const label =
    streak === 0
      ? "Study today to start a streak"
      : risk === "high"
        ? `Your ${streak}-day streak ends tonight. Study before midnight to keep it!`
        : risk === "none"
          ? `${streak}-day streak. You're done for today!`
          : `${streak}-day streak. Study today to keep it going.`;

  return (
    <span
      key={bumps > bumpsAtMount ? bumps : "idle"}
      title={label}
      aria-label={label}
      role="img"
      className={cx(
        "inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold tabular-nums transition-colors",
        bumps > bumpsAtMount && "animate-bump",
        risk === "high" && "bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/40 dark:text-orange-400",
        risk === "medium" && "bg-orange-500/5 text-foreground",
        streak === 0 && "text-muted-foreground",
      )}
    >
      <Flame
        id="streak-flame"
        className={cx(
          "size-[18px]",
          streak === 0
            ? "text-muted-foreground"
            : "text-orange-500 " +
                (risk === "none" ? "fill-orange-400 flame-live" : risk === "low" ? "fill-orange-400/40 flame-live" : "fill-orange-400/30"),
          risk === "medium" && "flame-risk",
          risk === "high" && "flame-risk flame-risk-fast",
        )}
      />
      {streak}
    </span>
  );
}
