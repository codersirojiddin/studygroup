"use client";

import { Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ShareCanvas, ShareDialog, useCardFonts } from "@/components/share-dialog";
import { Button, Skeleton } from "@/components/ui";
import { dismissMoment, hasNextMoment, useMoment, type Moment } from "@/lib/celebrations";
import { formatDuration } from "@/lib/format";
import { buildShareData, isMilestone, sceneBox, CARD_W, type ShareMode } from "@/lib/share-card";

/**
 * Full-screen celebration after a study session: the flame lighting up on the day's first real
 * study time, or the goal ring filling. One at a time; "Continue" brings up the next one. Mount
 * once in the signed-in page frame.
 */
export function CelebrationHost() {
  const moment = useMoment();
  // key: each moment gets a fresh canvas, so its animation starts from the beginning.
  return moment ? <MomentOverlay key={moment.id} moment={moment} /> : null;
}

function copy(m: Moment): { title: string; sub: string } {
  if (m.kind === "goal") {
    return { title: "Daily goal reached!", sub: `${formatDuration(m.me.dailyGoalMinutes * 60)} studied today. Nice work!` };
  }
  return isMilestone(m.stats.streakDays)
    ? { title: `${m.stats.streakDays}-day streak!`, sub: "A real milestone. Keep that flame alive." }
    : { title: "Streak extended!", sub: "Come back tomorrow to keep it going." };
}

function MomentOverlay({ moment }: { moment: Moment }) {
  const ref = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fonts = useCardFonts();
  const [sharing, setSharing] = useState(false);
  const mode: ShareMode = moment.kind === "streak" ? "streak" : "today";

  const data = useMemo(
    () => ({
      ...buildShareData(mode, moment.stats, moment.me),
      gainSeconds: moment.kind === "goal" ? moment.gainSeconds : undefined,
    }),
    [mode, moment],
  );

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Where the scene is on screen. Taken just before closing: once the dialog is closed it has no layout.
  const stageRect = useRef<DOMRect | null>(null);
  const measure = () => {
    stageRect.current = stage.current?.getBoundingClientRect() ?? null;
  };

  // Runs on every way out (button, Escape): the flame flies to the header, then the next moment shows.
  function finish() {
    if (moment.kind === "streak" && !hasNextMoment()) flyFlameToHeader(stageRect.current);
    dismissMoment();
  }

  const { title, sub } = copy(moment);

  return (
    <>
      <dialog
        ref={ref}
        onCancel={measure}
        onClose={finish}
        aria-label={title}
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-transparent p-4 text-white backdrop:bg-[#04110b]/90 backdrop:backdrop-blur-md"
      >
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-5 text-center">
          <div>
            <h2 className="font-heading text-3xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-white/70">{sub}</p>
          </div>
          <div ref={stage}>
            {fonts ? (
              <ShareCanvas data={data} fonts={fonts} bare />
            ) : (
              <Skeleton className="h-[360px] w-[min(86vw,440px)] rounded-3xl bg-white/10" />
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="brand"
              size="lg"
              autoFocus
              onClick={() => {
                measure();
                ref.current?.close();
              }}
            >
              Continue
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setSharing(true)}>
              <Share2 /> Share
            </Button>
          </div>
        </div>
      </dialog>
      <ShareDialog open={sharing} onClose={() => setSharing(false)} stats={moment.stats} me={moment.me} initialMode={mode} />
    </>
  );
}

/**
 * The big flame shrinks and flies up into the streak flame in the header, which then bumps
 * (the header badge listens for the dismissal). Skipped with reduced motion or no badge.
 */
function flyFlameToHeader(from: DOMRect | null) {
  const target = document.getElementById("streak-flame");
  if (!from || from.width === 0 || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const to = target.getBoundingClientRect();
  if (to.width === 0) return;

  // Where the flame sits inside the scene, as a share of the canvas height.
  const box = sceneBox("streak");
  const fromX = from.left + from.width / 2;
  const fromY = from.top + (from.height * (985 - 235 - box.y)) / box.h;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;
  const size = (from.width / CARD_W) * 470;

  const ghost = target.cloneNode(true) as SVGElement;
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:2147483647;pointer-events:none;color:#ff8a2b;fill:#ffb347;overflow:visible`;
  document.body.appendChild(ghost);

  const at = (x: number, y: number, scale: number) => `translate(${x - size / 2}px, ${y - size / 2}px) scale(${scale})`;
  const anim = ghost.animate(
    [
      { transform: at(fromX, fromY, 1), opacity: 1 },
      { transform: at((fromX + toX) / 2, Math.min(fromY, toY) - 40, 0.55), opacity: 1, offset: 0.45 },
      { transform: at(toX, toY, to.width / size), opacity: 1 },
    ],
    { duration: 700, easing: "cubic-bezier(0.5, 0, 0.2, 1)" },
  );
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
}
