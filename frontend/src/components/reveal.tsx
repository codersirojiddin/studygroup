"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/*
  Slides an element up into place when it scrolls into view.
  When you scroll back up past it (it drops below the viewport again) it
  returns to its hidden start position, so the animation plays again the next
  time you scroll down. Users with "reduce motion" always see everything.
*/
export function Reveal({
  children,
  className = "",
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds, applied only when revealing. */
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
        } else if (entry.boundingClientRect.top > (entry.rootBounds?.bottom ?? window.innerHeight)) {
          // Below the viewport again (scrolled back up): reset so it can replay.
          setShown(false);
        }
        // Above the viewport (scrolled past): stay as is.
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as ElementType;
  return (
    <Tag
      ref={ref}
      data-reveal=""
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}