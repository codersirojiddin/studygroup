"use client";

import { SmilePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui";
import { glyphOf, REACTIONS, type Reaction, type ReactionName } from "@/lib/reactions";

export type Cheer = Reaction & { id: number };

const LIFETIME_MS = 2100; // a little longer than the 1.9s float animation

/** Cheers currently floating on screen. `push` adds one; it removes itself after the animation. */
export function useCheers() {
  const [cheers, setCheers] = useState<Cheer[]>([]);
  const next = useRef(0);
  const push = useCallback((r: Reaction) => {
    const id = ++next.current;
    setCheers((c) => [...c.slice(-23), { ...r, id }]); // never more than 24 at once
    setTimeout(() => setCheers((c) => c.filter((x) => x.id !== id)), LIFETIME_MS);
  }, []);
  return { cheers, push };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * The emoji floating up over one member's row (put it inside a `relative` row). When the
 * receiver is you, each one also carries the sender's first name.
 */
export function CheerFloaters({ cheers, userId, meId }: { cheers: Cheer[]; userId: string; meId: string }) {
  return (
    <>
      {cheers
        .filter((c) => c.to === userId)
        .map((c) => (
          <span
            key={c.id}
            aria-hidden
            className="cheer"
            // Position and drift come from the id, so cheers fan out instead of stacking.
            style={
              {
                "--x": `${8 + ((c.id * 37) % 44)}px`,
                "--drift": `${((c.id * 53) % 41) - 20}px`,
                "--tilt": `${((c.id * 29) % 31) - 15}deg`,
              } as CSSProperties
            }
          >
            {glyphOf(c.emoji)}
            {userId === meId && <span className="cheer-from">{firstName(c.fromName)}</span>}
          </span>
        ))}
    </>
  );
}

/** A smiley button that opens a row of cheers. It stays open so you can send a few in a row. */
export function ReactionPicker({ name, onPick }: { name: string; onPick: (emoji: ReactionName) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Cheer ${name} on`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SmilePlus />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={`Cheer ${name} on`}
          className="animate-pop absolute top-9 right-0 z-40 flex gap-0.5 rounded-full border bg-popover p-1 shadow-lg"
        >
          {REACTIONS.map((r) => (
            <button
              key={r.name}
              role="menuitem"
              aria-label={r.label}
              onClick={() => onPick(r.name)}
              className="grid size-9 place-items-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-accent active:scale-90"
            >
              {r.glyph}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
