import { formatDuration, shortWeekday } from "@/lib/format";
import type { Me, Stats } from "@/lib/types";

/*
 * The shareable progress card: 1080x1920 (Instagram-story size) drawn on a canvas.
 *
 * One function, drawShareCard, draws every frame. The dialog calls it ~60 times a
 * second with a growing `t` for the entrance animation, and once with t = 1 at
 * full size to export the PNG, so the preview and the saved image always match.
 * Colours are fixed (not theme variables) so the image looks the same everywhere.
 *
 * Three cards: "today" (goal ring), "week" (bar chart) and "streak" (an ignition
 * animation in the spirit of Duolingo: the flame lights up, the counter rolls over
 * to the new number, and the week row fills in day by day).
 */

export const CARD_W = 1080;
export const CARD_H = 1920;

export type ShareMode = "today" | "week" | "streak";

export type ShareDay = {
  /** One letter: "M". */
  label: string;
  /** Short weekday: "Mon". */
  short: string;
  seconds: number;
  isToday: boolean;
  /** Part of the current streak run. */
  inStreak: boolean;
};

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
  /** True when today already counts towards the streak. */
  studiedToday: boolean;
  /** Daily goal in seconds; 0 when none is set. */
  goalSeconds: number;
  /** The last 7 days, oldest first. */
  days: ShareDay[];
  /** The site's address as printed on the card, e.g. "studygroup.live". */
  host: string;
  /**
   * Study time just added to today (the session that was just stopped). The goal ring then
   * starts where it was before and a "+25m" chip flies into it. Used by the in-app celebration.
   */
  gainSeconds?: number;
};

export type Fonts = { sans: string; serif: string };

export type Frame = {
  /** Entrance progress, 0..1. */
  t: number;
  /** Seconds since the animation started (flame flicker, embers, twinkling, shine). */
  clock: number;
  /** Confetti progress: 0 = none, around 0.35 = mid-air, 1 = gone. */
  confetti: number;
  /** Draw only the scene (no logo, date or footer), for the in-app celebration. */
  bare?: boolean;
};

/** When things happen, in milliseconds from the start of the animation. */
export type Plan = { enterMs: number; confettiAt: number; confettiMs: number };

/** Streak card timeline (fractions of the entrance): the flame ignites here. */
const IGNITE = 0.3;

export function animationPlan(d: Pick<ShareData, "mode" | "gainSeconds">): Plan {
  if (d.mode === "streak") return { enterMs: 3800, confettiAt: IGNITE * 3800, confettiMs: 2600 };
  // A chip flies into the ring first, so the goal is only reached late in the timeline.
  if (d.mode === "today" && (d.gainSeconds ?? 0) > 0) return { enterMs: 2600, confettiAt: 2200, confettiMs: 2400 };
  return { enterMs: 1700, confettiAt: 700, confettiMs: 2200 };
}

/** The part of the 1080x1920 card that holds the scene, in card coordinates (see Frame.bare). */
export function sceneBox(mode: ShareMode): { y: number; h: number } {
  return mode === "streak" ? { y: 430, h: 1220 } : { y: 470, h: 960 };
}

/**
 * The site's address the way people type it: no scheme and no "www.". The card used to
 * print window.location.host as is, which showed "www.studygroup.live" for visitors who
 * arrived through the www alias.
 */
export function siteHost(): string {
  return window.location.host.replace(/^www\./i, "");
}

export function siteUrl(): string {
  return `${window.location.protocol}//${siteHost()}`;
}

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
    mode === "week"
      ? `${at(first).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${at(last).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : at(last).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  // The streak is a run of consecutive days that ends today, or yesterday if today is still empty.
  const studiedToday = stats.todaySeconds > 0;
  const lastRunIdx = days.length - (studiedToday ? 1 : 2);
  return {
    mode,
    name: user.displayName,
    handle: user.username ? `@${user.username}` : null,
    dateLabel,
    todaySeconds: stats.todaySeconds,
    weekSeconds: stats.weekSeconds,
    totalSeconds: stats.totalSeconds,
    streakDays: stats.streakDays,
    studiedToday,
    goalSeconds: user.dailyGoalMinutes * 60,
    days: days.map((d, i) => ({
      label: shortWeekday(d.date).charAt(0).toUpperCase(),
      short: shortWeekday(d.date),
      seconds: d.seconds,
      isToday: i === days.length - 1,
      inStreak: stats.streakDays > 0 && i <= lastRunIdx && i > lastRunIdx - stats.streakDays,
    })),
    host: siteHost(),
  };
}

/** Streak counts worth a party: 3, a week, two weeks, a month, ... and every 100. */
export function isMilestone(n: number): boolean {
  return n > 0 && (n % 100 === 0 || [3, 7, 14, 21, 30, 50, 75, 365].includes(n));
}

/** True when the card has something to celebrate (goal reached, a full week, or a streak milestone). */
export function isCelebration(d: ShareData): boolean {
  if (d.mode === "streak") return isMilestone(d.streakDays);
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

/** Outer silhouette of the flame in a -40..40 x -50..50 box (base at y = 50). */
function flameOutline(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.bezierCurveTo(18, -28, 40, -10, 40, 14);
  ctx.bezierCurveTo(40, 36, 22, 50, 0, 50);
  ctx.bezierCurveTo(-22, 50, -40, 36, -40, 14);
  ctx.bezierCurveTo(-40, -2, -30, -12, -22, -20);
  ctx.bezierCurveTo(-20, -8, -12, -2, -6, -4);
  ctx.bezierCurveTo(-8, -22, -4, -38, 0, -50);
  ctx.closePath();
}

/** A plain teardrop for the inner, hotter layers (same box, base at y = 50). */
function flameDrop(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(14, 20, 22, 30, 22, 37);
  ctx.bezierCurveTo(22, 46, 11, 50, 0, 50);
  ctx.bezierCurveTo(-11, 50, -22, 46, -22, 37);
  ctx.bezierCurveTo(-22, 28, -9, 18, 0, 6);
  ctx.closePath();
}

type Rgb = [number, number, number];
const mixRgb = (a: Rgb, b: Rgb, k: number, alpha = 1) =>
  `rgba(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)},${alpha})`;

/**
 * A flame centred on (cx, cy), `size` px tall. `lit` runs 0..1: 0 is a cold grey
 * silhouette, 1 a living three-layer flame whose layers sway and flicker on their own
 * rhythm. In between the two cross-fade, which is what the ignition uses.
 */
function flame(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, lit: number, clock: number) {
  const k = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);

  const layer = (i: number, scale: number, shape: () => void, fill: () => CanvasGradient | string) => {
    ctx.save();
    ctx.translate(0, 50); // scale and sway around the base, like a real flame
    const sway = lit > 0 ? Math.sin(clock * (5.5 + i * 2.1) + i * 1.3) * 0.06 * lit : 0;
    const bob = lit > 0 ? 1 + (Math.sin(clock * (9 + i * 3.4) + i * 1.9) * 0.045 + Math.sin(clock * (15 + i * 4) + i) * 0.02) * lit : 1;
    ctx.transform(1, 0, sway, 1, 0, 0);
    ctx.scale(scale * (1 + (bob - 1) * 0.4), scale * bob);
    ctx.translate(0, -50);
    shape();
    ctx.fillStyle = fill();
    ctx.fill();
    ctx.restore();
  };
  const vertical = (top: string, bottom: string) => () => {
    const g = ctx.createLinearGradient(0, -50, 0, 50);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  };

  if (lit < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - lit;
    layer(0, 1, () => flameOutline(ctx), () => "rgba(244,241,232,0.26)");
    layer(1, 1.3, () => flameDrop(ctx), () => "rgba(244,241,232,0.16)");
    ctx.restore();
  }
  if (lit > 0) {
    ctx.save();
    ctx.globalAlpha *= lit;
    layer(0, 1, () => flameOutline(ctx), vertical("#FF9A2E", "#FF5B1F"));
    layer(1, 1.32, () => flameDrop(ctx), vertical("#FFD25A", "#FFA02E"));
    layer(2, 0.8, () => flameDrop(ctx), vertical("#FFF6C8", "#FFE07A"));
    ctx.restore();
  }
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

/* ------------------------------ streak scenery ------------------------------ */

const EMBERS = (() => {
  const r = rand(23);
  return Array.from({ length: 22 }, () => ({
    dx: (r() - 0.5) * 190,
    rise: 340 + r() * 420,
    speed: 0.16 + r() * 0.2,
    phase: r(),
    drift: 20 + r() * 40,
    wave: 2 + r() * 3,
    size: 5 + r() * 8,
    hot: r() > 0.45,
  }));
})();

const SPARKS = (() => {
  const r = rand(5);
  return Array.from({ length: 26 }, (_, i) => ({
    angle: (i / 26) * Math.PI * 2 + (r() - 0.5) * 0.3,
    from: 230 + r() * 40,
    reach: 190 + r() * 340,
    len: 30 + r() * 46,
    w: 5 + r() * 6,
    hot: r() > 0.4,
  }));
})();

/** A damped spring: overshoots about 19% around x = 0.33, then settles on 1. */
const elastic = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(x * Math.PI * 3));

/** A slowly turning sunburst behind the flame. */
function rays(ctx: CanvasRenderingContext2D, cx: number, cy: number, clock: number, amount: number) {
  if (amount <= 0) return;
  const n = 16;
  const R = 900;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(clock * 0.09);
  const g = ctx.createRadialGradient(0, 0, 120, 0, 0, R);
  g.addColorStop(0, `rgba(255,176,70,${0.17 * amount})`);
  g.addColorStop(1, "rgba(255,176,70,0)");
  ctx.fillStyle = g;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const half = Math.PI / n / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a - half, a + half);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Sparks drifting up from the flame, forever. */
function embers(ctx: CanvasRenderingContext2D, cx: number, baseY: number, clock: number, amount: number) {
  if (amount <= 0) return;
  ctx.save();
  for (const e of EMBERS) {
    const age = (clock * e.speed + e.phase) % 1;
    const x = cx + e.dx * (0.35 + age * 0.65) + Math.sin(age * e.wave * Math.PI + e.phase * 9) * e.drift * age;
    const y = baseY - age * e.rise;
    ctx.globalAlpha = Math.sin(Math.PI * age) * 0.95 * amount;
    ctx.fillStyle = e.hot ? "#FFD25A" : "#FF8A3C";
    ctx.beginPath();
    ctx.arc(x, y, e.size * (1 - age * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The moment the flame catches: a flash, two shock rings and a ring of flying sparks. p: 0..1. */
function ignitionBurst(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  glow(ctx, cx, cy, 580, "255,214,120", 0.55 * (1 - seg(p, 0, 0.5)));
  for (const [delay, w] of [
    [0, 30],
    [0.14, 16],
  ]) {
    const q = seg(p, delay, 1);
    if (q <= 0) continue;
    ctx.globalAlpha = 0.6 * (1 - q);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = w * (1 - q) + 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 140 + 480 * easeOut(q), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineCap = "round";
  for (const sp of SPARKS) {
    const head = sp.from + sp.reach * easeOut(p);
    const tail = Math.max(sp.from * 0.9, head - sp.len * (1 - p) * 2);
    const cos = Math.cos(sp.angle);
    const sin = Math.sin(sp.angle);
    ctx.globalAlpha = 1 - seg(p, 0.5, 1);
    ctx.strokeStyle = sp.hot ? C.amber : C.orange;
    ctx.lineWidth = sp.w * (1 - p * 0.6);
    ctx.beginPath();
    ctx.moveTo(cx + cos * tail, cy + sin * tail);
    ctx.lineTo(cx + cos * head, cy + sin * head);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A counter whose digits roll like an odometer. Digits that stay the same stay put; the ones
 * that change slide up and out while the new ones rise in from below, through a clipped window.
 * `heat` blends the colour from cold grey (0) to flame orange (1).
 */
function rollNumber(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  p: number,
  cx: number,
  baseY: number,
  size: number,
  family: string,
  heat: number,
) {
  const a = String(from);
  const b = String(to);
  const len = Math.max(a.length, b.length);
  const pa = a.padStart(len, " ");
  const pb = b.padStart(len, " ");
  ctx.save();
  ctx.font = `700 ${size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const wOf = (ch: string) => (ch === " " ? 0 : ctx.measureText(ch).width);
  const slots = [...pb].map((ch, i) => Math.max(wOf(ch), wOf(pa[i])));
  const total = slots.reduce((x, y) => x + y, 0);

  const g = ctx.createLinearGradient(0, baseY - size * 0.75, 0, baseY);
  g.addColorStop(0, mixRgb([186, 204, 195], [255, 218, 96], heat));
  g.addColorStop(1, mixRgb([150, 172, 160], [255, 132, 44], heat));
  ctx.fillStyle = g;

  const travel = size * 0.95;
  const rise = easeOutBack(p);
  const outA = 1 - clamp(p * 2.4);
  const inA = clamp(p * 2.4);
  let x = cx - total / 2;
  for (let i = 0; i < len; i++) {
    const sx = x + slots[i] / 2;
    x += slots[i];
    if (pa[i] === pb[i]) {
      ctx.fillText(pb[i], sx, baseY);
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx - slots[i] / 2 - 10, baseY - size * 1.02, slots[i] + 20, size * 1.3);
    ctx.clip();
    const base = ctx.globalAlpha;
    if (pa[i] !== " " && outA > 0) {
      ctx.globalAlpha = base * outA;
      ctx.fillText(pa[i], sx, baseY - travel * easeOut(p));
    }
    ctx.globalAlpha = base * inA;
    ctx.fillText(pb[i], sx, baseY + travel * (1 - rise));
    ctx.restore();
  }
  ctx.restore();
}

/** One soft diagonal glint that sweeps across the finished card. p: 0..1. */
function shine(ctx: CanvasRenderingContext2D, p: number) {
  if (p <= 0 || p >= 1) return;
  const e = p * p * (3 - 2 * p);
  const x = -380 + (CARD_W + 760 + CARD_H * 0.3) * e;
  ctx.save();
  ctx.transform(1, 0, -0.3, 1, 0, 0);
  const g = ctx.createLinearGradient(x - 190, 0, x + 190, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 190, 0, 380, CARD_H);
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
    const label = d.mode === "today" ? "TODAY" : d.mode === "week" ? "THIS WEEK" : "STREAK";
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
      : d.mode === "streak"
        ? d.streakDays === 0
          ? "Start your streak today."
          : !d.studiedToday
            ? "Study today to keep it going."
            : isMilestone(d.streakDays)
              ? `${d.streakDays} days in a row. Milestone!`
              : "Streak extended. Keep it going!"
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

  // With a gain the ring first fills to where it stood, then a chip flies in and it fills the rest.
  const gain = d.goalSeconds > 0 ? Math.min(Math.max(0, d.gainSeconds ?? 0), d.todaySeconds) : 0;
  const shownSeconds =
    gain > 0 ? (d.todaySeconds - gain) * easeOut(seg(t, 0.1, 0.42)) + gain * easeOut(seg(t, 0.5, 0.9)) : d.todaySeconds * e;
  const prog = gain > 0 ? clamp(shownSeconds / d.goalSeconds) : target * e;
  const startFrac = gain > 0 ? clamp((d.todaySeconds - gain) / d.goalSeconds) : 0;

  glow(ctx, cx, cy, R * 1.4, "63,208,154", 0.16);
  ctx.save();
  ctx.lineWidth = W;
  ctx.lineCap = "round";
  ctx.strokeStyle = C.faint;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

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
    const shown = formatDuration(Math.floor(shownSeconds));
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

  // The "+25m" chip: rises from under the ring and pours into the tip of the filled arc.
  if (gain > 0) {
    const tipAngle = -Math.PI / 2 + Math.PI * 2 * Math.max(startFrac, 0.03);
    const tipX = cx + Math.cos(tipAngle) * R;
    const tipY = cy + Math.sin(tipAngle) * R;
    const p = seg(t, 0.34, 0.56);
    if (p > 0 && p < 1) {
      const k = p * p * (3 - 2 * p);
      const x = cx + (tipX - cx) * k + Math.sin(Math.PI * k) * 110 * (tipX < cx ? 1 : -1);
      const y = 1300 + (tipY - 1300) * k;
      const label = `+${formatDuration(gain)}`;
      const style: TextStyle = { size: 52, weight: 700, family: f.sans, color: "#0A1F17", align: "center" };
      const w = measure(ctx, label, style) + 70;
      ctx.save();
      ctx.globalAlpha = clamp(p * 6) * (1 - seg(p, 0.8, 1));
      ctx.translate(x, y);
      const sc = 1 - 0.45 * k;
      ctx.scale(sc, sc);
      ctx.shadowColor = "rgba(63,208,154,0.7)";
      ctx.shadowBlur = 30;
      ctx.fillStyle = C.brand;
      roundRect(ctx, -w / 2, -42, w, 84, 42);
      ctx.fill();
      ctx.shadowBlur = 0;
      text(ctx, label, 0, 18, style);
      ctx.restore();
    }
    // A pulse of light where it lands.
    const land = seg(t, 0.52, 0.7);
    if (land > 0 && land < 1) glow(ctx, tipX, tipY, 360, "63,208,154", 0.5 * Math.sin(Math.PI * land));
  }

  // Goal badge under the ring.
  if (d.goalSeconds > 0) {
    const p = gain > 0 ? seg(t, 0.86, 0.98) : seg(t, 0.55, 0.8);
    enter(ctx, p, 30, () => {
      const done = d.todaySeconds >= d.goalSeconds;
      const label = done ? "Daily goal reached" : `${Math.round(prog * 100)}% of daily goal`;
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

/** The week row under the streak counter: lit circles with a check, joined by a glowing bar. */
function streakRow(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, t: number, clock: number) {
  const slot = 128;
  const left = (CARD_W - slot * 7) / 2;
  const cy = 1490;
  const r = 46;
  const start = 0.5;
  const step = 0.04;
  const prog = (i: number) => seg(t, start + i * step, start + i * step + 0.12);

  enter(ctx, seg(t, 0.44, 0.58), 20, () =>
    text(ctx, "LAST 7 DAYS", 540, cy - 100, { size: 26, weight: 700, family: f.sans, color: C.mute, align: "center", spacing: 5 }),
  );

  // Connectors first, so the circles sit on top of them.
  d.days.forEach((day, i) => {
    const next = d.days[i + 1];
    if (!next || !day.inStreak || !next.inStreak) return;
    const q = easeOut(prog(i + 1));
    if (q <= 0) return;
    const x0 = left + i * slot + slot / 2;
    ctx.fillStyle = "rgba(255,150,50,0.5)";
    roundRect(ctx, x0, cy - 13, slot * q, 26, 13);
    ctx.fill();
  });

  d.days.forEach((day, i) => {
    const x = left + i * slot + slot / 2;
    const p = prog(i);
    const pending = day.isToday && !day.inStreak;

    ctx.save();
    ctx.translate(x, cy);
    if (day.inStreak) {
      const sc = 0.25 + 0.75 * elastic(p);
      ctx.globalAlpha *= clamp(p * 4);
      ctx.scale(sc, sc);
      ctx.shadowColor = "rgba(255,140,40,0.6)";
      ctx.shadowBlur = 30;
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, "#FFD25A");
      g.addColorStop(1, "#FF7A2F");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r - 7, Math.PI * 1.05, Math.PI * 1.7);
      ctx.stroke();
      // The check mark draws itself.
      ctx.strokeStyle = "#5C2300";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([60, 60]);
      ctx.lineDashOffset = 60 * (1 - seg(p, 0.45, 0.95));
      ctx.beginPath();
      ctx.moveTo(-18, 2);
      ctx.lineTo(-5, 15);
      ctx.lineTo(20, -14);
      ctx.stroke();
    } else {
      ctx.globalAlpha *= clamp(p * 3);
      if (pending) {
        ctx.strokeStyle = C.amber;
        ctx.globalAlpha *= 0.6 + 0.3 * Math.sin(clock * 3);
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.setLineDash([13, 11]);
        ctx.lineDashOffset = -clock * 22;
        ctx.beginPath();
        ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // A ripple when today's circle lights up last.
    if (day.isToday && day.inStreak) {
      const q = seg(t, start + i * step + 0.04, start + i * step + 0.23);
      if (q > 0 && q < 1) {
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - q);
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 8 * (1 - q) + 2;
        ctx.beginPath();
        ctx.arc(x, cy, r + 8 + 70 * easeOut(q), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    const labelStyle: TextStyle = {
      size: 30,
      weight: day.isToday ? 700 : 500,
      family: f.sans,
      color: day.inStreak || day.isToday ? C.ink : C.mute,
      align: "center",
      alpha: seg(t, 0.46, 0.6),
    };
    text(ctx, day.short, x, cy + r + 52, { ...labelStyle, size: fitSize(ctx, day.short, slot - 16, labelStyle) });
  });
}

const STREAK_FLAME_H = 470;
const STREAK_FLAME_BASE = 985;

/** Light that sits behind the whole card, text included: sunburst, warm glow and the ignition burst. */
function streakBackdrop(ctx: CanvasRenderingContext2D, d: ShareData, t: number, clock: number) {
  const cx = 540;
  const cy = STREAK_FLAME_BASE - STREAK_FLAME_H * 0.45;
  const lit = d.streakDays > 0 ? easeOut(seg(t, IGNITE, IGNITE + 0.07)) : 0;
  rays(ctx, cx, cy, clock, lit * seg(t, IGNITE, IGNITE + 0.2));
  glow(ctx, cx, cy, 640, "255,140,40", 0.3 * lit);
  if (d.streakDays > 0) ignitionBurst(ctx, cx, cy, seg(t, IGNITE, IGNITE + 0.22));
}

/**
 * The streak card. The flame starts cold, then catches (flash, shock rings, flying sparks),
 * the counter rolls over to the new number, embers start rising, and the week row lights up
 * one day at a time, today last.
 */
function heroStreak(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, t: number, clock: number) {
  const cx = 540;
  const flameH = STREAK_FLAME_H;
  const baseY = STREAK_FLAME_BASE; // the flame grows from here
  const has = d.streakDays > 0;
  const lit = has ? easeOut(seg(t, IGNITE, IGNITE + 0.07)) : 0;

  // Cold flame appears, winds up (squashes), then pops past full size and settles.
  const appear = easeOut(seg(t, 0.06, 0.2));
  let scale = 0.74 + 0.08 * appear;
  if (has) {
    scale -= 0.08 * seg(t, IGNITE - 0.06, IGNITE);
    scale = scale + (1 - scale) * elastic(seg(t, IGNITE, IGNITE + 0.22));
  } else {
    scale += Math.sin(clock * 2) * 0.012; // a patient, sleeping flame
  }
  const h = flameH * scale;
  ctx.save();
  ctx.globalAlpha *= appear;
  flame(ctx, cx, baseY - h / 2, h, lit, clock);
  ctx.restore();

  embers(ctx, cx, baseY - 70, clock, lit * seg(t, IGNITE + 0.05, IGNITE + 0.2));

  // The counter: shows yesterday's number, then rolls to today's as the flame catches.
  const from = d.studiedToday ? Math.max(0, d.streakDays - 1) : d.streakDays;
  const numY = 1238;
  const numSize = fitSize(ctx, String(d.streakDays), 700, { size: 290, weight: 700, family: f.sans, color: C.ink });
  const bump = 1 + 0.12 * Math.sin(Math.PI * seg(t, IGNITE + 0.04, IGNITE + 0.22));
  ctx.save();
  ctx.globalAlpha *= easeOut(seg(t, 0.14, 0.26));
  ctx.translate(cx, numY - numSize * 0.35);
  ctx.scale(bump, bump);
  ctx.translate(-cx, -(numY - numSize * 0.35));
  rollNumber(ctx, from, d.streakDays, seg(t, IGNITE + 0.04, IGNITE + 0.2), cx, numY, numSize, f.sans, lit);
  ctx.restore();

  enter(ctx, seg(t, IGNITE + 0.02, IGNITE + 0.16), 30, () =>
    text(ctx, "day streak", cx, numY + 98, { size: 78, weight: 600, family: f.serif, color: C.ink, align: "center" }),
  );

  streakRow(ctx, d, f, t, clock);
}

type Chip = { icon: (cx: number, cy: number) => void; value: (e: number) => string; final: string; label: string };

function chips(ctx: CanvasRenderingContext2D, d: ShareData, f: Fonts, t: number, clock: number) {
  const activeDays = d.days.filter((x) => x.seconds > 0).length;
  const best = Math.max(0, ...d.days.map((x) => x.seconds));
  const dur = (sec: number) => (e: number) => formatDuration(Math.floor(sec * e));
  const streak: Chip = {
    icon: (cx, cy) => flame(ctx, cx, cy, 56, d.streakDays > 0 ? 1 : 0, clock),
    value: (e) => `${Math.round(d.streakDays * e)}`,
    final: `${d.streakDays}`,
    label: "DAY STREAK",
  };
  const items: Chip[] =
    d.mode === "today"
      ? [
          streak,
          { icon: (cx, cy) => clockIcon(ctx, cx, cy, 56), value: dur(d.weekSeconds), final: formatDuration(d.weekSeconds), label: "THIS WEEK" },
          { icon: (cx, cy) => trophyIcon(ctx, cx, cy, 56), value: dur(d.totalSeconds), final: formatDuration(d.totalSeconds), label: "ALL TIME" },
        ]
      : [
          streak,
          { icon: (cx, cy) => calendarIcon(ctx, cx, cy, 56), value: (e) => `${Math.round(activeDays * e)}/7`, final: `${activeDays}/7`, label: "ACTIVE DAYS" },
          { icon: (cx, cy) => starIcon(ctx, cx, cy, 56), value: dur(best), final: formatDuration(best), label: "BEST DAY" },
        ];

  const y0 = 1420;
  const w = 280;
  const h = 214;
  const gap = 30;
  items.forEach((it, i) => {
    const from = 0.5 + i * 0.08;
    enter(ctx, seg(t, from, from + 0.3), 60, () => {
      const x = 90 + i * (w + gap);
      ctx.fillStyle = C.card;
      roundRect(ctx, x, y0, w, h, 46);
      ctx.fill();
      ctx.strokeStyle = C.cardLine;
      ctx.lineWidth = 2;
      ctx.stroke();
      // The icon pops in with a little overshoot.
      ctx.save();
      const pop = 0.5 + 0.5 * elastic(seg(t, from + 0.08, from + 0.34));
      ctx.translate(x + 62, y0 + 58);
      ctx.scale(pop, pop);
      it.icon(0, 0);
      ctx.restore();
      // Numbers count up, but are sized for the final value so they never jitter.
      const style: TextStyle = { size: 62, weight: 700, family: f.sans, color: C.ink };
      const size = fitSize(ctx, it.final, w - 64, style);
      text(ctx, it.value(easeOut(seg(t, from + 0.05, 0.98))), x + 34, y0 + 150, { ...style, size });
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
    text(ctx, d.host, 990, 1842, { size: 34, weight: 600, family: f.sans, color: C.brand, align: "right" });
  });
}

/* ------------------------------ the card ------------------------------ */

/**
 * Draws one frame in logical 1080x1920 coordinates. Scale the context first when
 * drawing to a smaller canvas.
 */
export function drawShareCard(ctx: CanvasRenderingContext2D, d: ShareData, fonts: Fonts, frame: Frame) {
  const { t, clock, confetti, bare = false } = frame;
  const streakMode = d.mode === "streak";
  ctx.save();
  ctx.lineCap = "butt";
  ctx.setLineDash([]);
  background(ctx, clock);
  sparkles(ctx, clock, t);
  // Behind the text, so the date and numbers stay readable while confetti flies.
  if (streakMode) streakBackdrop(ctx, d, t, clock);
  confettiBurst(ctx, 540, d.mode === "today" ? 900 : streakMode ? 760 : 700, confetti);
  if (!bare) {
    header(ctx, d, fonts, seg(t, 0, 0.2));
    headline(ctx, d, fonts, seg(t, 0.05, 0.28));
  }
  if (d.mode === "today") heroToday(ctx, d, fonts, t, clock);
  else if (streakMode) heroStreak(ctx, d, fonts, t, clock);
  else heroWeek(ctx, d, fonts, t, clock);
  if (!streakMode && !bare) chips(ctx, d, fonts, t, clock);
  if (!bare) footer(ctx, d, fonts, seg(t, 0.75, 1));
  // One glint across the finished card.
  const settled = animationPlan(d).enterMs / 1000;
  shine(ctx, seg(clock, settled + 0.15, settled + 1.3));
  ctx.restore();
}
