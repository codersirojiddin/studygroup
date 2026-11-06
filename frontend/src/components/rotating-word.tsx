"use client";

import { useEffect, useState } from "react";

// Cycles through words in place. All words share one grid cell, so the layout
// never jumps. With "reduce motion" enabled it stays on the first word.
export function RotatingWord({ words }: { words: string[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % words.length), 2400);
    return () => clearInterval(id);
  }, [words.length]);

  return (
    <span className="inline-grid align-bottom">
      <span className="sr-only">{words.join(", ")}</span>
      {words.map((word, i) => (
        <span
          key={word}
          aria-hidden="true"
          className={`col-start-1 row-start-1 transition-all duration-500 motion-reduce:transition-none ${
            i === active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {word}
        </span>
      ))}
    </span>
  );
}