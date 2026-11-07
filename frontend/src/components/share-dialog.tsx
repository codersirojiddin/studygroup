"use client";

import { Check, Copy, Download, RotateCcw, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Dialog, Skeleton, Tabs } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import {
  buildShareData,
  CARD_H,
  CARD_W,
  drawShareCard,
  isCelebration,
  loadFonts,
  readFonts,
  renderShareBlob,
  type Fonts,
  type ShareData,
  type ShareMode,
} from "@/lib/share-card";
import type { Me, Stats } from "@/lib/types";

const ENTER_MS = 1700; // entrance animation
const CONFETTI_MS = 2200;
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
    const start = performance.now();
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = now - start;
      const entering = elapsed < ENTER_MS + CONFETTI_MS;
      // Full speed while things move, then 30 fps for the idle flicker.
      if (reduceMotion || entering || now - last > 33) {
        last = now;
        const t = reduceMotion ? 1 : Math.min(1, elapsed / ENTER_MS);
        const confetti = !celebrate ? 0 : reduceMotion ? 0.34 : Math.min(1, Math.max(0, (elapsed - 700) / CONFETTI_MS));
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
  const line =
    d.mode === "today"
      ? `I studied ${formatDuration(d.todaySeconds)} today on Study Online${streak}`
      : `I studied ${formatDuration(d.weekSeconds)} this week on Study Online${streak}`;
  return `${line}\n${window.location.origin}`;
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
    () => (blob ? new File([blob], `study-online-${mode === "today" ? "today" : "week"}.png`, { type: "image/png" }) : null),
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
          ]}
        />
        <Button variant="ghost" size="icon" aria-label="Replay animation" onClick={() => setReplay((n) => n + 1)}>
          <RotateCcw />
        </Button>
      </div>

      <div className="relative isolate">
        <div aria-hidden className="absolute -inset-5 -z-10 rounded-[2rem] bg-brand/25 blur-2xl" />
        {fonts ? <ShareCanvas data={data} fonts={fonts} replay={replay} /> : <Skeleton className={`${previewSize} aspect-[9/16] rounded-2xl`} />}
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
