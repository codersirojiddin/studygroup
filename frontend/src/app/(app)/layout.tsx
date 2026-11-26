import { Suspense, type ReactNode } from "react";

import { AppFrame } from "@/components/app-frame";

// Everything for signed-in users (dashboard, rooms, settings, account) shares one frame,
// so the sidebar stays mounted while you move between these pages.
// The frame reads the current path, which is only known per request, hence the Suspense
// boundary; its fallback is just the empty sidebar column so the page doesn't jump.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1">
          <aside className="hidden w-64 shrink-0 border-r bg-card md:block" />
          <div className="flex-1" />
        </div>
      }
    >
      <AppFrame>{children}</AppFrame>
    </Suspense>
  );
}
