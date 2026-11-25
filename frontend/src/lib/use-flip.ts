"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * FLIP for lists: when the children of `container` change order (or the items around them come and
 * go), each one glides from where it was to where it is now instead of jumping. Give every child a
 * stable `data-flip="<id>"`. New children are left alone, so they can have their own entrance.
 * Call it on every render; it only measures.
 */
export function useFlip(container: RefObject<HTMLElement | null>) {
  const before = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = new Map<string, number>();
    for (const child of el.querySelectorAll<HTMLElement>(":scope > [data-flip]")) {
      const key = child.dataset.flip!;
      const top = child.getBoundingClientRect().top;
      now.set(key, top);
      const was = before.current.get(key);
      if (reduce || was === undefined || Math.abs(was - top) < 1) continue;
      child.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], {
        duration: 320,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
    before.current = now;
  });
}
