import { formatDuration, shortWeekday } from "@/lib/format";
import type { Me, Stats } from "@/lib/types";

/*
 * The shareable progress card: 1080x1920 (Instagram-story size) drawn on a canvas.
 *
 * One function, drawShareCard, draws every frame. The dialog calls it ~60 times a
 * second with a growing `t` for the entrance animation, and once with t = 1 at
 * full size to export the PNG, so the preview and the saved image always match.
 * Colours are fixed (not theme variables) so the image looks the same everywhere.
 */

export const CARD_W = 1080;
export const CARD_H = 1920;

export type ShareMode = "today" | "week";

export type ShareData = {
  mode: ShareMode;
  name: string;
  handle: string | null;
  /** "Saturday, November 7" or "Nov 1 – Nov 7". */
  dateLabel: string;
  todaySeconds: number;
  weekSeconds: number;
  totalSeconds: number;
  streakDays: number;
  /** Daily goal in seconds; 0 when none is set. */
  goalSeconds: number;
  /** The last 7 days, oldest first. */
  days: { label: string; seconds: number; isToday: boolean }[];
  host: string;
};

export type Fonts = { sans: string; serif: string };

export type Frame = {
  /** Entrance progress, 0..1. */
  t: number;
  /** Seconds of idle animation (flame flicker, twinkling). */
  clock: number;
  /** Confetti progress: 0 = none, around 0.35 = mid-air, 1 = gone. */
  confetti: number;
};

/** Builds the card's content from the dashboard stats. Call in the browser. */
export function buildShareData(
  mode: ShareMode,
  stats: Stats,
  user: Pick<Me, "displayName" | "username" | "dailyGoalMinutes">,
): ShareData {
  const days = stats.last7Days;
  const at = (date: string) => new Date(`${date}T12:00:00`);
  const first = days[0]?.date ?? "";
  const last = days[days.length - 1]?.date ?? "";
  const dateLabel =
    mode === "today"
      ? at(last).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
      : `${at(first).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${at(last).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return {
    mode,
    name: user.displayName,
    handle: user.username ? `@${user.username}` : null,
    dateLabel,
    todaySeconds: stats.todaySeconds,
    weekSeconds: stats.weekSeconds,
    totalSeconds: stats.totalSeconds,
    streakDays: stats.streakDays,
    goalSeconds: user.dailyGoalMinutes * 60,
    days: days.map((d, i) => ({
      label: shortWeekday(d.date).charAt(0).toUpperCase(),
      seconds: d.seconds,
      isToday: i === days.length - 1,
    })),
    host: window.location.host,
  };
}

/** True when the card has something to celebrate (goal reached, or a full week). */
export function isCelebration(d: ShareData): boolean {
  if (d.mode === "today") return d.goalSeconds > 0 && d.todaySeconds >= d.goalSeconds;
  return d.days.length === 7 && d.days.every((x) => x.seconds > 0);
}

/** The font stacks the page already loaded (next/font hides the real family names in CSS variables). */
export function readFonts(): Fonts {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string) => cs.getPropertyValue(name).trim();
  return {
    sans: `${pick("--font-geist-sans") || "system-ui"}, ui-sans-serif, system-ui, sans-serif`,
    serif: `${pick("--font-fraunces") || "Georgia"}, ui-serif, Georgia, serif`,
  };
}

/** Makes sure the fonts are ready before the first frame, so text never pops in late. */
export async function loadFonts(f: Fonts): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`700 64px ${f.sans}`),
      document.fonts.load(`500 40px ${f.sans}`),
      document.fonts.load(`600 64px ${f.serif}`),
    ]);
  } catch {
    // Fall back to whatever is available.
  }
}

/** Renders the final frame at full size and returns it as a PNG. */
export function renderShareBlob(d: ShareData, fonts: Fonts): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unavailable"));
  drawShareCard(ctx, d, fonts, { t: 1, clock: 0.35, confetti: isCelebration(d) ? 0.34 : 0 });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode image"))), "image/png"),
  );
}

/* ------------------------------ palette ------------------------------ */

const C = {
  ink: "#F4F1E8",
  mute: "rgba(244,241,232,0.62)",
  faint: "rgba(244,241,232,0.1)",
  brand: "#3FD09A",
  brandDeep: "#1E8F66",
  amber: "#FFC84A",
  orange: "#FF7A2F",
  card: "rgba(255,255,255,0.07)",
  cardLine: "rgba(255,255,255,0.1)",
};

/* ------------------------------ helpers ------------------------------ */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Progress of t inside [a, b], clamped to 0..1. */
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type TextStyle = {
  size: number;
  weight?: number;
  family: string;
  color: string;
  align?: CanvasTextAlign;
  alpha?: number;
  /** Extra space between letters, px. */
  spacing?: number;
};

function setFont(ctx: CanvasRenderingContext2D, s: TextStyle) {
  ctx.font = `${s.weight ?? 500} ${s.size}px ${s.family}`;
}

function measure(ctx: CanvasRenderingContext2D, str: string, s: TextStyle): number {
  ctx.save();
  setFont(ctx, s);
  const chars = [...str];
  const w = s.spacing
    ? chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + s.spacing * (chars.length - 1)
    : ctx.measureText(str).width;
  ctx.restore();
  return w;
}

function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, s: TextStyle) {
  ctx.save();
  ctx.globalAlpha *= s.alpha ?? 1;
  setFont(ctx, s);
  ctx.fillStyle = s.color;
  ctx.textBaseline = "alphabetic";
  if (!s.spacing) {
    ctx.textAlign = s.align ?? "left";
    ctx.fillText(str, x, y);
  } else {
    // Canvas has no portable letter-spacing, so place the letters one by one.
    ctx.textAlign = "left";
    const chars = [...str];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + s.spacing * (chars.length - 1);
    let cx = s.align === "center" ? x - total / 2 : s.align === "right" ? x - total : x;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, cx, y);
      cx += widths[i] + s.spacing!;
    });
  }
  ctx.restore();
}

/** Largest font size (up to `size`) at which `str` fits in maxW. */
function fitSize(ctx: CanvasRenderingContext2D, str: string, maxW: number, s: TextStyle): number {
  let size = s.size;
  while (size > 20 && measure(ctx, str, { ...s, size }) > maxW) size -= 2;
  return size;
}

/** Fades and lifts whatever `draw` paints as p goes 0 -> 1. */
function enter(ctx: CanvasRenderingContext2D, p: number, dy: number, draw: () => void) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(p * 1.6);
  ctx.translate(0, (1 - easeOut(p)) * dy);
  draw();
  ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function rand(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ icons ------------------------------ */

function flame(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, lit: boolean, clock: number) {
  ctx.save();
  ctx.translate(cx, cy);
  const wob = lit ? Math.sin(clock * 9) * 0.045 + Math.sin(clock * 15 + 1) * 0.025 : 0;
  ctx.scale((size / 100) * (1 + wob * 0.5), (size / 100) * (1 + wob * 1.6));
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.bezierCurveTo(18, -28, 40, -10, 40, 14);
  ctx.bezierCurveTo(40, 36, 22, 50, 0, 50);
  ctx.bezierCurveTo(-22, 50, -40, 36, -40, 14);
  ctx.bezierCurveTo(-40, -2, -30, -12, -22, -20);
  ctx.bezierCurveTo(-20, -8, -12, -2, -6, -4);
  ctx.bezierCurveTo(-8, -22, -4, -38, 0, -50);
  ctx.closePath();
  if (lit) {
    const g = ctx.createLinearGradient(0, -50, 0, 50);
    g.addColorStop(0, C.amber);
    g.addColorStop(1, C.orange);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = "rgba(244,241,232,0.28)";
  }
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(14, 20, 20, 29, 20, 35);
  ctx.bezierCurveTo(20, 45, 10, 50, 0, 50);
  ctx.bezierCurveTo(-10, 50, -20, 45, -20, 35);
  ctx.bezierCurveTo(-20, 26, -8, 18, 0, 8);
  ctx.closePath();
  ctx.fillStyle = lit ? "rgba(255,244,200,0.92)" : "rgba(244,241,232,0.18)";
  ctx.fill();
  ctx.restore();
}

function clockIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = C.brand;
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.22);
  ctx.lineTo(0, 0);
  ctx.lineTo(size * 0.17, size * 0.1);
  ctx.stroke();
  ctx.restore();
}

function calendarIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = C.brand;
  ctx.lineWidth = size * 0.09;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  roundRect(ctx, -size * 0.44, -size * 0.38, size * 0.88, size * 0.82, size * 0.14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.44, -size * 0.1);
  ctx.lineTo(size * 0.44, -size * 0.1);
  ctx.moveTo(-size * 0.22, -size * 0.5);
  ctx.lineTo(-size * 0.22, -size * 0.26);
  ctx.moveTo(size * 0.22, -size * 0.5);
  ctx.lineTo(size * 0.22, -size * 0.26);
  ctx.moveTo(-size * 0.17, size * 0.17);
  ctx.lineTo(-size * 0.04, size * 0.29);
  ctx.lineTo(size * 0.2, size * 0.04);
  ctx.stroke();
  ctx.restore();
}

function trophyIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = C.brand;
  ctx.fillStyle = C.brand;
  ctx.lineWidth = size * 0.09;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, -size * 0.42);
  ctx.lineTo(size * 0.28, -size * 0.42);
  ctx.lineTo(size * 0.28, -size * 0.1);
  ctx.quadraticCurveTo(size * 0.28, size * 0.16, 0, size * 0.18);
  ctx.quadraticCurveTo(-size * 0.28, size * 0.16, -size * 0.28, -size * 0.1);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, -size * 0.3);
  ctx.quadraticCurveTo(-size * 0.5, -size * 0.3, -size * 0.44, -size * 0.12);
  ctx.quadraticCurveTo(-size * 0.4, 0, -size * 0.26, 0);
  ctx.moveTo(size * 0.28, -size * 0.3);
  ctx.quadraticCurveTo(size * 0.5, -size * 0.3, size * 0.44, -size * 0.12);
  ctx.quadraticCurveTo(size * 0.4, 0, size * 0.26, 0);
  ctx.moveTo(0, size * 0.18);
  ctx.lineTo(0, size * 0.34);
  ctx.moveTo(-size * 0.2, size * 0.42);
  ctx.lineTo(size * 0.2, size * 0.42);
  ctx.stroke();
  ctx.restore();
}

function starIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = C.brand;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size * 0.5 : size * 0.22;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------ scenery ------------------------------ */

const SPARKLES = (() => {
  const r = rand(11);
  const out: { x: number; y: number; size: number; speed: number; phase: number }[] = [];
  while (out.length < 16) {
    const x = 50 + r() * 980;
    const y = 400 + r() * 820;
    // Keep the middle clear: that's where the ring or the big number sits.
    if (Math.hypot(x - 540, y - 900) < 400) continue;
    out.push({ x, y, size: 8 + r() * 14, speed: 1 + r() * 2, phase: r() * 6.28 });
  }
  return out;
})();

const CONFETTI_COLORS = [C.brand, C.amber, C.orange, C.ink, "#7C9CFF", "#FF8FB1"];
const CONFETTI = (() => {
  const r = rand(7);
  return Array.from({ length: 96 }, () => ({
    angle: -Math.PI / 2 + (r() - 0.5) * 2.3,
    speed: 650 + r() * 1350,
    w: 12 + r() * 14,
    h: 22 + r() * 22,
    rot: r() * 6.28,
    spin: (r() - 0.5) * 16,
    color: CONFETTI_COLORS[Math.floor(r() * CONFETTI_COLORS.length)],
    delay: r() * 0.1,
  }));
})();

function background(ctx: CanvasRenderingContext2D, clock: number) {
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, "#0A1F17");
  g.addColorStop(0.55, "#0F2C21");
  g.addColorStop(1, "#143D2E");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  glow(ctx, 900 + Math.sin(clock * 0.6) * 30, 220, 780, "63,208,154", 0.26);
  glow(ctx, 120, 1720 + Math.cos(clock * 0.5) * 30, 840, "255,160,60", 0.13);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 2;
  for (const r of [470, 610, 750]) {
    ctx.beginPath();
    ctx.arc(540, 900, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function sparkles(ctx: CanvasRenderingContext2D, clock: number, t: number) {
  const fade = seg(t, 0.3, 0.9);
  ctx.save();
  ctx.fillStyle = C.ink;
  for (const s of SPARKLES) {
    const a = (0.12 + 0.22 * (0.5 + 0.5 * Math.sin(clock * s.speed + s.phase))) * fade;
    ctx.globalAlpha = a;
    sparkle(ctx, s.x, s.y, s.size);
  }
  ctx.restore();
}

function confettiBurst(ctx: CanvasRenderingContext2D, ox: number, oy: number, progress: number) {
  if (progress <= 0) return;
  const alpha = 1 - seg(progress, 0.7, 1);
  if (alpha <= 0) return;
  ctx.save();
  for (const p of CONFETTI) {
    const tau = clamp(progress - p.delay) * 2.1; // seconds in the air
    const x = ox + Math.cos(p.angle) * p.speed * tau;
    const y = oy + Math.sin(p.angle) * p.speed * tau + 0.5 * 1900 * tau * tau;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(p.rot + p.spin * tau * 0.4);
    ctx.scale(1, Math.cos(p.spin * tau)); // flips like paper
    ctx.fillStyle = p.color;
    roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 4);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------ sections ------------------------------ */

function header(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, p: number) {
  enter(ctx, p, 40, () => {
    // Logo mark: a rounded tile with an open book.
    const g = ctx.createLinearGradient(90, 110, 190, 210);
    g.addColorStop(0, C.brand);
    g.addColorStop(1, C.brandDeep);
    ctx.fillStyle = g;
    roundRect(ctx, 90, 110, 100, 100, 30);
    ctx.fill();
    ctx.strokeStyle = "#0A1F17";
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(140, 148);
    ctx.lineTo(140, 184);
    ctx.moveTo(140, 148);
    ctx.quadraticCurveTo(122, 138, 112, 142);
    ctx.lineTo(112, 178);
    ctx.quadraticCurveTo(124, 174, 140, 184);
    ctx.moveTo(140, 148);
    ctx.quadraticCurveTo(158, 138, 168, 142);
    ctx.lineTo(168, 178);
    ctx.quadraticCurveTo(156, 174, 140, 184);
    ctx.stroke();
    text(ctx, "Study Online", 214, 178, { size: 54, weight: 700, family: f.sans, color: C.ink });

    // Period pill.
    const label = d.mode === "today" ? "TODAY" : "THIS WEEK";
    const style: TextStyle = { size: 30, weight: 700, family: f.sans, color: C.brand, spacing: 5 };
    const w = measure(ctx, label, style) + 76;
    ctx.fillStyle = "rgba(63,208,154,0.12)";
    roundRect(ctx, 990 - w, 126, w, 68, 34);
    ctx.fill();
    ctx.strokeStyle = "rgba(63,208,154,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, label, 990 - w / 2, 172, { ...style, align: "center" });
  });
}

function headline(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, p: number) {
  const activeDays = d.days.filter((x) => x.seconds > 0).length;
  const sub =
    d.mode === "week"
      ? `${activeDays} of 7 days studied`
      : d.goalSeconds > 0 && d.todaySeconds >= d.goalSeconds
        ? "Daily goal reached. Nice work!"
        : d.todaySeconds > 0
          ? "Every minute counts."
          : "Ready when you are.";
  enter(ctx, p, 40, () => {
    text(ctx, d.dateLabel, 90, 330, { size: 68, weight: 600, family: f.serif, color: C.ink });
    text(ctx, sub, 90, 392, { size: 40, weight: 500, family: f.sans, color: C.mute });
  });
}

function heroToday(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, t: number, clock: number) {
  const cx = 540;
  const cy = 900;
  const R = 330;
  const W = 62;
  const target = d.goalSeconds > 0 ? clamp(d.todaySeconds / d.goalSeconds) : d.todaySeconds > 0 ? 1 : 0;
  const e = easeOut(seg(t, 0.12, 0.7));

  glow(ctx, cx, cy, R * 1.4, "63,208,154", 0.16);
  ctx.save();
  ctx.lineWidth = W;
  ctx.lineCap = "round";
  ctx.strokeStyle = C.faint;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  const prog = target * e;
  if (prog > 0.002) {
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI * 2 * prog;
    const grad = ctx.createLinearGradient(cx - R, cy + R, cx + R, cy - R);
    grad.addColorStop(0, C.brandDeep);
    grad.addColorStop(1, C.brand);
    ctx.shadowColor = "rgba(63,208,154,0.6)";
    ctx.shadowBlur = 38;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, 12 + Math.sin(clock * 4) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  enter(ctx, seg(t, 0.14, 0.5), 30, () => {
    text(ctx, "FOCUSED TODAY", cx, cy - 120, { size: 32, weight: 700, family: f.sans, color: C.mute, align: "center", spacing: 5 });
    const shown = formatDuration(Math.floor(d.todaySeconds * e));
    const size = fitSize(ctx, shown, 470, { size: 150, weight: 700, family: f.sans, color: C.ink });
    text(ctx, shown, cx, cy + 50, { size, weight: 700, family: f.sans, color: C.ink, align: "center" });
    text(ctx, d.goalSeconds > 0 ? `of ${formatDuration(d.goalSeconds)} goal` : "no daily goal set", cx, cy + 130, {
      size: 44,
      weight: 500,
      family: f.sans,
      color: C.mute,
      align: "center",
    });
  });

  // Goal badge under the ring.
  if (d.goalSeconds > 0) {
    const p = seg(t, 0.55, 0.8);
    enter(ctx, p, 30, () => {
      const done = d.todaySeconds >= d.goalSeconds;
      const label = done ? "Daily goal reached" : `${Math.round(target * 100 * e)}% of daily goal`;
      const style: TextStyle = { size: 38, weight: 700, family: f.sans, color: done ? "#0A1F17" : C.ink };
      const w = measure(ctx, label, style) + (done ? 140 : 90);
      const x = cx - w / 2;
      ctx.fillStyle = done ? C.brand : "rgba(255,255,255,0.08)";
      roundRect(ctx, x, 1290, w, 84, 42);
      ctx.fill();
      if (done) {
        ctx.strokeStyle = "#0A1F17";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x + 36, 1334);
        ctx.lineTo(x + 50, 1348);
        ctx.lineTo(x + 76, 1318);
        ctx.stroke();
      }
      text(ctx, label, cx + (done ? 32 : 0), 1345, { ...style, align: "center" });
    });
  }
}

function heroWeek(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, t: number, clock: number) {
  const e = easeOut(seg(t, 0.12, 0.6));
  enter(ctx, seg(t, 0.12, 0.45), 30, () => {
    text(ctx, "STUDIED THIS WEEK", 540, 540, { size: 32, weight: 700, family: f.sans, color: C.mute, align: "center", spacing: 5 });
    const shown = formatDuration(Math.floor(d.weekSeconds * e));
    const size = fitSize(ctx, shown, 900, { size: 200, weight: 700, family: f.sans, color: C.ink });
    text(ctx, shown, 540, 540 + size * 0.95, { size, weight: 700, family: f.sans, color: C.ink, align: "center" });
  });

  // Bars.
  const left = 120;
  const slot = 120;
  const baseline = 1250;
  const maxH = 400;
  const maxDay = Math.max(0, ...d.days.map((x) => x.seconds));
  // A goal far above anything studied would squash every bar, so only draw it when it's in reach.
  const showGoal = d.goalSeconds > 0 && d.goalSeconds <= maxDay * 1.6;
  const maxV = Math.max(maxDay, showGoal ? d.goalSeconds : 0, 1);

  if (showGoal) {
    const gy = baseline - (d.goalSeconds / maxV) * maxH;
    ctx.save();
    ctx.globalAlpha = seg(t, 0.3, 0.6);
    ctx.strokeStyle = "rgba(63,208,154,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 12]);
    ctx.beginPath();
    ctx.moveTo(left - 20, gy);
    ctx.lineTo(left + slot * 7 + 20, gy);
    ctx.stroke();
    ctx.restore();
    text(ctx, "goal", left + slot * 7 + 20, gy - 14, {
      size: 26,
      weight: 600,
      family: f.sans,
      color: C.brand,
      align: "right",
      alpha: seg(t, 0.3, 0.6),
    });
  }

  d.days.forEach((day, i) => {
    const p = seg(t, 0.2 + i * 0.05, 0.62 + i * 0.05);
    const grow = easeOutBack(p);
    const full = day.seconds > 0 ? Math.max(18, (day.seconds / maxV) * maxH) : 12;
    const h = Math.max(4, full * clamp(grow, 0, 1.08));
    const x = left + i * slot + (slot - 76) / 2;
    const hit = showGoal && day.seconds >= d.goalSeconds;

    ctx.save();
    if (day.seconds <= 0) {
      ctx.fillStyle = C.faint;
    } else if (day.isToday || hit) {
      const g = ctx.createLinearGradient(0, baseline - h, 0, baseline);
      g.addColorStop(0, C.brand);
      g.addColorStop(1, C.brandDeep);
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(63,208,154,0.5)";
      ctx.shadowBlur = day.isToday ? 34 + Math.sin(clock * 3) * 6 : 20;
    } else {
      ctx.fillStyle = "rgba(63,208,154,0.5)";
    }
    roundRect(ctx, x, baseline - h, 76, h, 22);
    ctx.fill();
    ctx.restore();

    if (day.isToday && day.seconds > 0 && p > 0.9) {
      text(ctx, formatDuration(day.seconds), x + 38, baseline - h - 22, {
        size: 34,
        weight: 700,
        family: f.sans,
        color: C.ink,
        align: "center",
        alpha: seg(p, 0.9, 1),
      });
    }
    text(ctx, day.label, x + 38, baseline + 62, {
      size: 36,
      weight: day.isToday ? 700 : 500,
      family: f.sans,
      color: day.isToday ? C.ink : C.mute,
      align: "center",
      alpha: seg(t, 0.3, 0.6),
    });
  });
}

type Chip = { icon: (cx: number, cy: number) => void; value: string; label: string };

function chips(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, t: number, clock: number) {
  const activeDays = d.days.filter((x) => x.seconds > 0).length;
  const best = Math.max(0, ...d.days.map((x) => x.seconds));
  const streak: Chip = {
    icon: (cx, cy) => flame(ctx, cx, cy, 56, d.streakDays > 0, clock),
    value: `${d.streakDays}`,
    label: "DAY STREAK",
  };
  const items: Chip[] =
    d.mode === "today"
      ? [
          streak,
          { icon: (cx, cy) => clockIcon(ctx, cx, cy, 56), value: formatDuration(d.weekSeconds), label: "THIS WEEK" },
          { icon: (cx, cy) => trophyIcon(ctx, cx, cy, 56), value: formatDuration(d.totalSeconds), label: "ALL TIME" },
        ]
      : [
          streak,
          { icon: (cx, cy) => calendarIcon(ctx, cx, cy, 56), value: `${activeDays}/7`, label: "ACTIVE DAYS" },
          { icon: (cx, cy) => starIcon(ctx, cx, cy, 56), value: formatDuration(best), label: "BEST DAY" },
        ];

  const y0 = 1420;
  const w = 280;
  const h = 214;
  const gap = 30;
  items.forEach((it, i) => {
    enter(ctx, seg(t, 0.5 + i * 0.08, 0.8 + i * 0.08), 60, () => {
      const x = 90 + i * (w + gap);
      ctx.fillStyle = C.card;
      roundRect(ctx, x, y0, w, h, 46);
      ctx.fill();
      ctx.strokeStyle = C.cardLine;
      ctx.lineWidth = 2;
      ctx.stroke();
      it.icon(x + 62, y0 + 58);
      const style: TextStyle = { size: 62, weight: 700, family: f.sans, color: C.ink };
      const size = fitSize(ctx, it.value, w - 64, style);
      text(ctx, it.value, x + 34, y0 + 150, { ...style, size });
      text(ctx, it.label, x + 34, y0 + 190, { size: 24, weight: 700, family: f.sans, color: C.mute, spacing: 3 });
    });
  });
}

function footer(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, p: number) {
  enter(ctx, p, 40, () => {
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 1712);
    ctx.lineTo(990, 1712);
    ctx.stroke();

    ctx.fillStyle = "rgba(63,208,154,0.18)";
    ctx.beginPath();
    ctx.arc(150, 1796, 56, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, (d.name.trim().charAt(0) || "?").toUpperCase(), 150, 1816, {
      size: 54,
      weight: 700,
      family: f.sans,
      color: C.brand,
      align: "center",
    });
    const nameStyle: TextStyle = { size: 50, weight: 700, family: f.sans, color: C.ink };
    text(ctx, d.name, 232, d.handle ? 1790 : 1812, { ...nameStyle, size: fitSize(ctx, d.name, 420, nameStyle) });
    if (d.handle) text(ctx, d.handle, 232, 1842, { size: 36, weight: 500, family: f.sans, color: C.mute });

    text(ctx, "Study with me", 990, 1790, { size: 44, weight: 700, family: f.serif, color: C.ink, align: "right" });
    text(ctx, d.host, 990, 1842, { size: 32, weight: 500, family: f.sans, color: C.mute, align: "right" });
  });
}

/* ------------------------------ the card ------------------------------ */

/**
 * Draws one frame in logical 1080x1920 coordinates. Scale the context first when
 * drawing to a smaller canvas.
 */
export function drawShareCard(ctx: CanvasRenderingContext2D, d: ShareData, fonts: Fonts, frame: Frame) {
  const { t, clock, confetti } = frame;
  ctx.save();
  ctx.lineCap = "butt";
  ctx.setLineDash([]);
  background(ctx, clock);
  sparkles(ctx, clock, t);
  // Behind the text, so the date and numbers stay readable while confetti flies.
  confettiBurst(ctx, 540, d.mode === "today" ? 900 : 700, confetti);
  header(ctx, d, fonts, seg(t, 0, 0.2));
  headline(ctx, d, fonts, seg(t, 0.05, 0.28));
  if (d.mode === "today") heroToday(ctx, d, fonts, t, clock);
  else heroWeek(ctx, d, fonts, t, clock);
  chips(ctx, d, fonts, t, clock);
  footer(ctx, d, fonts, seg(t, 0.75, 1));
  ctx.restore();
}
