"use client";

import { Check, Copy, Download, Flame, RotateCcw, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { Button, Dialog, Skeleton, Tabs } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import {
  animationPlan,
  buildShareData,
  CARD_H,
  CARD_W,
  drawShareCard,
  isCelebration,
  loadFonts,
  readFonts,
  renderShareBlob,
  siteUrl,
  type Fonts,
  type ShareData,
  type ShareMode,
} from "@/lib/share-card";
import type { Me, Stats } from "@/lib/types";

const PREVIEW_W = 648; // preview canvas pixels (the card is 1080 wide)
const PREVIEW_H = Math.round((PREVIEW_W * CARD_H) / CARD_W);
const previewSize = "h-[min(56vh,600px)]";

/** The animated card. Entrance, count-ups, flame flicker and confetti all come from drawShareCard. */
function ShareCanvas({ data, fonts, replay }: { data: ShareData; fonts: Fonts; replay: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = canvas.width / CARD_W;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const celebrate = isCelebration(data);
    const plan = animationPlan(data);
    const start = performance.now();
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = now - start;
      // The card's own timeline runs a little past the entrance (confetti, the closing glint).
      const entering = elapsed < plan.enterMs + Math.max(plan.confettiMs, 1500);
      // Full speed while things move, then 30 fps for the idle flicker.
      if (reduceMotion || entering || now - last > 33) {
        last = now;
        const t = reduceMotion ? 1 : Math.min(1, elapsed / plan.enterMs);
        const confetti = !celebrate
          ? 0
          : reduceMotion
            ? 0.34
            : Math.min(1, Math.max(0, (elapsed - plan.confettiAt) / plan.confettiMs));
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawShareCard(ctx, data, fonts, { t, clock: reduceMotion ? 0.35 : elapsed / 1000, confetti });
      }
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [data, fonts, replay]);

  return (
    <canvas
      ref={ref}
      width={PREVIEW_W}
      height={PREVIEW_H}
      role="img"
      aria-label="Preview of your shareable progress card"
      className={`${previewSize} aspect-[9/16] w-auto rounded-2xl shadow-2xl ring-1 ring-black/10`}
    />
  );
}

function shareText(d: ShareData): string {
  const streak = d.streakDays > 0 ? ` · ${d.streakDays}-day streak 🔥` : "";
  let line: string;
  if (d.mode === "streak") {
    line =
      d.streakDays > 0
        ? `I'm on a ${d.streakDays}-day study streak 🔥 on Study Online`
        : "I'm starting a study streak on Study Online 🔥";
  } else if (d.mode === "today") {
    line = `I studied ${formatDuration(d.todaySeconds)} today on Study Online${streak}`;
  } else {
    line = `I studied ${formatDuration(d.weekSeconds)} this week on Study Online${streak}`;
  }
  return `${line}\n${siteUrl()}`;
}

/**
 * Tilts its child toward the pointer, with a light glare that follows it, so the card feels
 * like a physical thing you can hold. Does nothing on touch screens or with reduced motion.
 */
function TiltFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  function move(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = "transform 90ms ease-out";
    el.style.transform = `perspective(900px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 11).toFixed(2)}deg) scale(1.02)`;
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--glare", "1");
  }

  function leave() {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 650ms cubic-bezier(0.2, 0.8, 0.2, 1)";
    el.style.transform = "";
    el.style.setProperty("--glare", "0");
  }

  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className="relative rounded-2xl will-change-transform">
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: "var(--glare, 0)",
          background: "radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,0.18), transparent 55%)",
        }}
      />
    </div>
  );
}

function ShareBody({ stats, me }: { stats: Stats; me: Me }) {
  const [mode, setMode] = useState<ShareMode>("today");
  const [fonts, setFonts] = useState<Fonts | null>(null);
  const [made, setMade] = useState<{ mode: ShareMode; blob: Blob } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  const data = useMemo(() => buildShareData(mode, stats, me), [mode, stats, me]);

  useEffect(() => {
    let cancelled = false;
    const f = readFonts();
    loadFonts(f).then(() => !cancelled && setFonts(f));
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-render the PNG so Share/Save work instantly (and keep the click's user gesture).
  useEffect(() => {
    if (!fonts) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderShareBlob(data, fonts)
        .then((blob) => !cancelled && setMade({ mode: data.mode, blob }))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data, fonts]);

  const blob = made?.mode === mode ? made.blob : null;
  const file = useMemo(
    () => (blob ? new File([blob], `study-online-${mode}.png`, { type: "image/png" }) : null),
    [blob, mode],
  );
  const canShare = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const canCopy = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  function flash(message: string) {
    setNote(message);
    setTimeout(() => setNote(null), 2000);
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "My Study Online progress", text: shareText(data) });
    } catch (e) {
      if ((e as DOMException).name !== "AbortError") flash("Couldn't open the share sheet");
    }
  }

  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flash("Image saved");
  }

  async function copy() {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Image copied");
    } catch {
      flash("Copying isn't supported here");
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        <Tabs
          value={mode}
          onChange={setMode}
          items={[
            { value: "today", label: "Today" },
            { value: "week", label: "This week" },
            {
              value: "streak",
              label: (
                <span className="inline-flex items-center gap-1">
                  <Flame className="size-3.5 text-orange-500" /> Streak
                </span>
              ),
            },
          ]}
        />
        <Button variant="ghost" size="icon" aria-label="Replay animation" onClick={() => setReplay((n) => n + 1)}>
          <RotateCcw />
        </Button>
      </div>

      <div className="animate-card-in relative isolate">
        <div
          aria-hidden
          className={`absolute -inset-5 -z-10 rounded-[2rem] blur-2xl transition-colors duration-700 ${mode === "streak" ? "bg-orange-500/30" : "bg-brand/25"}`}
        />
        {fonts ? (
          <TiltFrame>
            <ShareCanvas data={data} fonts={fonts} replay={replay} />
          </TiltFrame>
        ) : (
          <Skeleton className={`${previewSize} aspect-[9/16] rounded-2xl`} />
        )}
      </div>

      <div className="flex w-full flex-wrap justify-center gap-2">
        {canShare && (
          <Button variant="brand" onClick={share}>
            <Share2 /> Share
          </Button>
        )}
        <Button variant={canShare ? "secondary" : "brand"} onClick={download} disabled={!file}>
          <Download /> Save image
        </Button>
        {canCopy && (
          <Button variant="secondary" onClick={copy} disabled={!blob}>
            <Copy /> Copy
          </Button>
        )}
      </div>

      <p aria-live="polite" className="h-5 text-sm font-medium text-brand">
        {note && (
          <span key={note} className="animate-pop inline-flex items-center gap-1.5">
            <Check className="size-4" /> {note}
          </span>
        )}
      </p>
    </div>
  );
}

/** Opens from the "Your progress" card: a polished, shareable picture of today and this week. */
export function ShareDialog({
  open,
  onClose,
  stats,
  me,
}: {
  open: boolean;
  onClose: () => void;
  stats: Stats;
  me: Me;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share your progress"
      description="Save the picture or send it straight to your friends."
      className="max-w-md"
    >
      <ShareBody stats={stats} me={me} />
    </Dialog>
  );
}
