import { BookOpen } from "lucide-react";
import { Bricolage_Grotesque, Caveat } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type CSSProperties } from "react";

import { Reveal } from "@/components/reveal";
import { RotatingWord } from "@/components/rotating-word";
import { auth } from "@/lib/auth/server";

/*
  Design system for this page (self-contained, independent of the app theme)
  - Night ink:   #0A0E1A   panels: #111729   text: #F2EFE8   muted: #9AA3B8
  - Lamp amber:  #FFB547   the single accent: actions, filled bubbles, timer
  - Notebook:    #F7F8FB paper, #C9D5F2 rules, #F28B82 margin line
  To change the accent, find and replace #FFB547 (and rgba(255,181,71) in the glow).
*/

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });

const d = "font-[family-name:var(--font-display)]";
const wrap = "mx-auto w-full max-w-6xl px-5 md:px-8";

// Staggered entrance for the hero, played once on page load (CSS only, no JS needed).
const hi = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const btn =
  "inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB547]";
const btnMain = `${btn} bg-[#FFB547] text-[#1A1203] hover:bg-[#ffc466]`;
const btnAlt = `${btn} border border-white/25 text-[#F2EFE8] hover:bg-white/10`;

// Reads the session cookie, so it renders per request inside Suspense.
async function CtaButtons({ showSignIn = true }: { showSignIn?: boolean }) {
  await connection();
  const { data: session } = await auth.getSession();
  if (session?.user) {
    return (
      <Link href="/dashboard" className={btnMain}>
        Open your dashboard
      </Link>
    );
  }
  return (
    <>
      <Link href="/auth/sign-up" className={btnMain}>
        Join a study room
      </Link>
      {showSignIn && (
        <Link href="/auth/sign-in" className={btnAlt}>
          Sign in
        </Link>
      )}
    </>
  );
}

async function NavActions() {
  await connection();
  const { data: session } = await auth.getSession();
  if (session?.user) {
    return (
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center rounded-full bg-[#FFB547] px-4 text-sm font-semibold text-[#1A1203] hover:bg-[#ffc466]"
      >
        Dashboard
      </Link>
    );
  }
  return (
    <>
      <Link
        href="/auth/sign-in"
        className="hidden h-9 items-center rounded-full px-4 text-sm font-medium text-[#F2EFE8]/80 hover:text-white sm:inline-flex"
      >
        Sign in
      </Link>
      <Link
        href="/auth/sign-up"
        className="inline-flex h-9 items-center rounded-full bg-[#FFB547] px-4 text-sm font-semibold text-[#1A1203] hover:bg-[#ffc466]"
      >
        Join free
      </Link>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-[#F2EFE8]">
      <span className="flex size-7 items-center justify-center rounded-lg bg-[#FFB547] text-[#1A1203]">
        <BookOpen className="size-4" aria-hidden="true" />
      </span>
      Study Online
    </Link>
  );
}

// One bubble = one focus session, like a filled-in answer sheet.
function Bubble({ state }: { state: "done" | "now" | "todo" }) {
  const look =
    state === "done"
      ? "border-[#FFB547] bg-[#FFB547]"
      : state === "now"
        ? "border-[#FFB547]"
        : "border-white/25";
  return (
    <span aria-hidden="true" className={`relative size-6 rounded-full border-2 ${look}`}>
      {state === "now" && (
        <span className="absolute inset-1 rounded-full bg-[#FFB547]/50 motion-safe:animate-pulse" />
      )}
    </span>
  );
}

const day: Array<"done" | "now" | "todo"> = [
  "done", "done", "done", "done", "done", "now", "todo", "todo",
];

const people = [
  { initials: "SM", name: "Sara", doing: "SAT math, hard set" },
  { initials: "JK", name: "Jon", doing: "IELTS writing task 2" },
  { initials: "AL", name: "Aziz", doing: "Reading passage 3" },
];

// Static illustration of a room floating over the video. Not live data.
function RoomPreview() {
  return (
    <div
      className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#0A0E1A]/55 p-6 text-[#F2EFE8] shadow-2xl backdrop-blur-xl"
      role="img"
      aria-label="Example study room: a shared timer at 18:42, five of eight focus sessions done, and three people studying"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className="size-2 rounded-full bg-[#FFB547] motion-safe:animate-pulse" />
          IELTS and SAT focus room
        </span>
        <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-[#9AA3B8]">
          Example
        </span>
      </div>

      <p className={`${d} mt-6 text-7xl leading-none font-semibold tracking-tight tabular-nums`}>
        18:42
      </p>
      <p className="mt-2 text-sm text-[#9AA3B8]">Focus time left. 5 minute break next.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {day.map((s, i) => (
          <Bubble key={i} state={s} />
        ))}
      </div>
      <p className="mt-2.5 text-xs text-[#9AA3B8]">Your day: 5 of 8 sessions done</p>

      <ul className="mt-6 divide-y divide-white/10 border-t border-white/10">
        {people.map((p) => (
          <li key={p.name} className="flex items-center gap-3 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
              {p.initials}
            </span>
            <p className="min-w-0 truncate text-sm">
              <span className="font-medium">{p.name}</span>
              <span className="text-[#9AA3B8]"> is on {p.doing}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const rows = [
  {
    label: "Who is studying",
    video: "A stranger, filmed months ago",
    room: "Real people in the same session as you",
  },
  {
    label: "The timer",
    video: "Plays on whether you are there or not",
    room: "One shared timer. Start together, break together",
  },
  {
    label: "Your effort",
    video: "Nobody sees it and nothing is saved",
    room: "Counts toward your daily goal and streak",
  },
  {
    label: "If you stop",
    video: "Nothing happens",
    room: "The room sees you go offline",
  },
];

const steps = [
  { title: "Join a room", text: "Open a public room, or enter the invite code a friend sent you." },
  {
    title: "Start the shared timer",
    text: "The room owner presses start. Everyone focuses, then takes the break together.",
  },
  {
    title: "Fill in your day",
    text: "Every session fills a bubble toward your daily goal and keeps your streak alive.",
  },
];

const tile = "rounded-3xl border border-white/10 bg-[#111729] p-7 md:p-8";
const tileLabel = "text-sm font-medium text-[#9AA3B8]";

export default function Home() {
  return (
    <div
      className={`${display.variable} ${hand.variable} flex min-h-full flex-1 flex-col overflow-x-clip bg-[#0A0E1A] text-[#F2EFE8]`}
    >
      <style>{`
        @keyframes rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: no-preference) {
          .hero-in { animation: rise 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: var(--d, 0ms); }
        }
      `}</style>
      <noscript>
        <style>{`[data-reveal] { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      {/* Floating navigation */}
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between rounded-full border border-white/10 bg-[#0A0E1A]/60 py-1.5 pr-1.5 pl-4 backdrop-blur-xl">
          <Wordmark />
          <div className="flex items-center gap-1">
            <Suspense fallback={null}>
              <NavActions />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[#0A0E1A]">
          <video
            className="absolute inset-0 -z-20 size-full object-cover motion-reduce:hidden"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          >
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(10,14,26,0.55)_0%,rgba(10,14,26,0.25)_35%,rgba(10,14,26,0.78)_78%,#0A0E1A_100%)]"
          />

          <div className={`${wrap} mt-auto grid items-end gap-10 pt-36 pb-12 md:pb-16 lg:grid-cols-[1.25fr_0.75fr]`}>
            <div>
              <h1
                style={hi(0)}
                className={`hero-in ${d} max-w-4xl text-[2.75rem] leading-[0.95] font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl lg:text-[5.5rem]`}
              >
                Somebody is studying right next to you.
              </h1>
              <p
                style={hi(150)}
                className={`hero-in ${d} mt-6 text-2xl font-medium text-[#F2EFE8]/90 md:text-3xl`}
              >
                A live study room for{" "}
                <span className="text-[#FFB547]">
                  <RotatingWord words={["the SAT", "IELTS", "finals", "any exam"]} />
                </span>
              </p>
              <p style={hi(250)} className="hero-in mt-4 max-w-md text-pretty text-[#F2EFE8]/70">
                Press start and the whole room focuses with you. Free to use.
              </p>
              <div style={hi(350)} className="hero-in mt-8 flex flex-wrap gap-3">
                <Suspense fallback={<div className="h-12" />}>
                  <CtaButtons />
                </Suspense>
              </div>
            </div>
            <div style={hi(450)} className="hero-in flex justify-start lg:justify-end">
              <RoomPreview />
            </div>
          </div>
        </section>

        {/* The argument: video vs. room */}
        <section>
          <div className={`${wrap} py-24 md:py-32`}>
            <Reveal>
              <h2
                className={`${d} max-w-3xl text-3xl leading-[1.05] font-semibold tracking-tight text-balance md:text-5xl`}
              >
                Study-with-me videos are nice to watch. Nobody in them knows you&rsquo;re there.
              </h2>
              <p className="mt-5 max-w-xl text-lg text-pretty text-[#9AA3B8]">
                They give you the feeling of company. A room gives you the real thing: people who
                started when you started and will notice if you leave.
              </p>
            </Reveal>

            <div className="mt-14 overflow-hidden rounded-3xl border border-white/10">
              <div className="hidden grid-cols-[0.7fr_1fr_1fr] gap-6 border-b border-white/10 bg-[#111729] px-8 py-4 text-sm md:grid">
                <span />
                <span className="text-[#9AA3B8]">A study-with-me video</span>
                <span className="font-semibold text-[#FFB547]">A Study Online room</span>
              </div>
              {rows.map((r, i) => (
                <Reveal
                  key={r.label}
                  delay={i * 90}
                  className="grid gap-2 border-b border-white/10 px-6 py-6 last:border-b-0 md:grid-cols-[0.7fr_1fr_1fr] md:gap-6 md:px-8"
                >
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="text-[#9AA3B8]">
                    <span className="mr-2 text-xs md:hidden">Video:</span>
                    {r.video}
                  </p>
                  <p>
                    <span className="mr-2 text-xs font-semibold text-[#FFB547] md:hidden">Room:</span>
                    {r.room}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-white/10">
          <div className={`${wrap} grid gap-12 py-24 md:grid-cols-3 md:gap-10 md:py-28`}>
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 130}>
                <p
                  aria-hidden="true"
                  className={`${d} text-8xl leading-none font-semibold text-transparent [-webkit-text-stroke:1.5px_rgba(255,181,71,0.7)]`}
                >
                  {i + 1}
                </p>
                <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-xs text-pretty text-[#9AA3B8]">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Inside a room */}
        <section className="border-t border-white/10">
          <div className={`${wrap} py-24 md:py-32`}>
            <Reveal>
              <h2
                className={`${d} max-w-2xl text-3xl leading-[1.05] font-semibold tracking-tight text-balance md:text-5xl`}
              >
                Inside a room
              </h2>
              <p className="mt-4 max-w-xl text-[#9AA3B8]">
                Illustrations of the real room. Everything here works in the app today.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 md:grid-cols-6">
              <Reveal className={`${tile} md:col-span-4`}>
                <p className={tileLabel}>Shared timer</p>
                <p
                  className={`${d} mt-4 text-8xl leading-none font-semibold tracking-tight text-[#FFB547] tabular-nums md:text-9xl`}
                >
                  25:00
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <span className="inline-flex h-10 items-center rounded-full bg-[#FFB547] px-5 text-sm font-semibold text-[#1A1203]">
                    Start for everyone
                  </span>
                  <span className="text-sm text-[#9AA3B8]">
                    Set your own focus and break lengths.
                  </span>
                </div>
              </Reveal>

              <Reveal delay={120} className={`${tile} md:col-span-2`}>
                <p className={tileLabel}>Your day</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {day.map((s, i) => (
                    <Bubble key={i} state={s} />
                  ))}
                </div>
                <p className={`${d} mt-8 text-4xl font-semibold tracking-tight`}>5 of 8</p>
                <p className="mt-1 text-sm text-[#9AA3B8]">sessions done toward your daily goal</p>
              </Reveal>

              <Reveal className={`${tile} md:col-span-2`}>
                <p className={tileLabel}>Who is here</p>
                <ul className="mt-5 space-y-4">
                  {people.map((p) => (
                    <li key={p.name} className="flex items-center gap-3">
                      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                        {p.initials}
                        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[#111729] bg-[#FFB547]" />
                      </span>
                      <p className="min-w-0 text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="block truncate text-[#9AA3B8]">{p.doing}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal delay={120} className={`${tile} md:col-span-4`}>
                <p className={tileLabel}>Room chat</p>
                <div className="mt-5 flex flex-col gap-2.5 text-sm">
                  <p className="max-w-sm self-start rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5">
                    <span className="font-medium">Sara:</span> Starting a round at 21:00. Who&rsquo;s in?
                  </p>
                  <p className="max-w-sm self-start rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5">
                    <span className="font-medium">Jon:</span> In. Writing task 2 tonight.
                  </p>
                  <p className="max-w-sm self-end rounded-2xl rounded-br-md bg-[#FFB547] px-4 py-2.5 font-medium text-[#1A1203]">
                    Same. See you in the room.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Founder note on ruled notebook paper */}
        <section className="relative overflow-hidden bg-[#F7F8FB] text-[#1B2236]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_bottom,transparent_calc(2.8rem-1px),#C9D5F2_calc(2.8rem-1px))] [background-size:100%_2.8rem]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-5 w-px bg-[#F28B82]/70 md:left-[max(2rem,calc(50%-34rem))]"
          />
          <div className={`${wrap} relative py-[5.6rem] md:py-[8.4rem]`}>
            <div className="pl-6 md:pl-10">
              <Reveal as="blockquote" className={`${d} max-w-3xl text-[1.4rem] leading-[2.8rem] font-medium tracking-tight md:text-[1.9rem]`}>
                I study five hours a day for the SAT and IELTS. Study-with-me videos kept me going,
                but they are only videos. So I built a room where people really study together.
              </Reveal>
              <Reveal
                as="p"
                delay={200}
                className="mt-[2.8rem] font-[family-name:var(--font-hand)] text-3xl leading-[2.8rem] text-[#3B4A7A] md:text-4xl"
              >
                &mdash; a student, building this in public
              </Reveal>
            </div>
          </div>
        </section>

        {/* Closing call to action with a lamp glow */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_85%_at_50%_115%,rgba(255,181,71,0.38),transparent_70%)]"
          />
          <div className={`${wrap} relative flex flex-col items-center py-28 text-center md:py-40`}>
            <Reveal
              as="h2"
              className={`${d} max-w-3xl text-5xl leading-[0.98] font-semibold tracking-tight text-balance md:text-7xl`}
            >
              Pull up a chair. Press start.
            </Reveal>
            <Reveal as="p" delay={120} className="mt-5 text-lg text-[#9AA3B8]">
              Free to use. Your first room takes a minute.
            </Reveal>
            <Reveal delay={240} className="mt-9 flex flex-wrap justify-center gap-3">
              <Suspense fallback={<div className="h-12" />}>
                <CtaButtons showSignIn={false} />
              </Suspense>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div
          className={`${wrap} flex flex-wrap items-center justify-between gap-3 py-6 text-sm text-[#9AA3B8]`}
        >
          <span>Study Online</span>
          <span>Built by a student, for students</span>
        </div>
      </footer>
    </div>
  );
}