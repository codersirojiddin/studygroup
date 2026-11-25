"use client";

import { useMemo, type CSSProperties } from "react";

import { cx } from "@/components/ui";

const COLORS = ["var(--brand)", "#FFC84A", "#FF7A2F", "#7C9CFF", "#FF8FB1", "#F4F1E8"];

// A deterministic 0..1 from two numbers, so a burst looks the same on every render (and renders purely).
const unit = (a: number, b: number) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A one-off burst of confetti from the middle of the nearest positioned parent. Change `burstKey`
 * (any number above 0) to fire it again. Hidden with "reduce motion".
 */
export function ConfettiBurst({
  burstKey,
  count = 24,
  spread = 180,
  size = 8,
  duration = 900,
  className,
}: {
  burstKey: number;
  count?: number;
  /** How far the pieces fly, px. */
  spread?: number;
  /** Piece size, px. */
  size?: number;
  duration?: number;
  className?: string;
}) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Fan upwards-ish: angles from -160deg to -20deg, plus a little sideways scatter.
        const angle = ((-160 + unit(i, burstKey) * 140) * Math.PI) / 180;
        const dist = spread * (0.45 + unit(i + 1, burstKey) * 0.55);
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          rot: (unit(i + 2, burstKey) - 0.5) * 720,
          w: size * (0.7 + unit(i + 3, burstKey) * 0.7),
          h: size * (1 + unit(i + 4, burstKey) * 0.9),
          color: COLORS[Math.floor(unit(i + 5, burstKey) * COLORS.length)],
          delay: unit(i + 6, burstKey) * 60,
        };
      }),
    [count, spread, size, burstKey],
  );
  if (burstKey <= 0) return null;

  return (
    <span key={burstKey} aria-hidden className={cx("pointer-events-none absolute inset-0", className)}>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-1/2 left-1/2 rounded-[2px]"
          style={
            {
              width: p.w,
              height: p.h,
              marginLeft: -p.w / 2,
              marginTop: -p.h / 2,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
              "--dur": `${duration}ms`,
              "--fall": `${spread * 0.35}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
