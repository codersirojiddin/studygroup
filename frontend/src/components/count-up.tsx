"use client";

import { useEffect, useRef, useState } from "react";

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * A number that counts from 0 on first show, and from its previous value whenever `target`
 * changes. With "reduce motion" it jumps straight to the target.
 */
export function useCountUp(target: number, duration = 1000): number {
  const [shown, setShown] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const from = current.current;
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : duration;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      current.current = from + (target - from) * easeOut(p);
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return shown;
}

/** Renders `format(value)` while counting up to `value`. Pair with a tabular-nums font. */
export function CountUp({
  value,
  format = (n) => String(n),
  duration,
}: {
  value: number;
  /** Receives a whole number on every frame. */
  format?: (n: number) => string;
  duration?: number;
}) {
  const shown = useCountUp(value, duration);
  return <>{format(Math.round(shown))}</>;
}
