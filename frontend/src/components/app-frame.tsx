"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { UserButton } from "@neondatabase/neon-js/auth/react/ui";

import { Logo, ThemeToggle } from "@/components/brand";
import { CelebrationHost } from "@/components/celebration-host";
import { SidebarBody } from "@/components/sidebar";
import { StreakBadge } from "@/components/streak-badge";
import { Button, cx } from "@/components/ui";
import { UserSearch } from "@/components/user-search";
import { refreshActive } from "@/lib/active-session-store";
import { refreshRooms } from "@/lib/rooms-store";
import { setSidebarPref, useSidebarPref } from "@/lib/sidebar-store";

const FrameContext = createContext(false);

/** True inside AppFrame, so a page's AppShell knows the sidebar is already there. */
export function useInFrame() {
  return useContext(FrameContext);
}

/*
 * The signed-in layout: sidebar on the left (a drawer on phones), a slim top bar and the page.
 * The (app) route group mounts it once, so the sidebar keeps its state while you move between pages.
 *
 * The streak flame, search, theme and account stay in the top bar on purpose: the streak
 * celebration flies to the flame, which therefore has to be on screen on every device.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pref = useSidebarPref();
  // The drawer is open only for the page it was opened on, so any navigation closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const drawerOpen = openAt === pathname;
  // Width changes animate only after the first paint, so a saved "collapsed" choice doesn't visibly shrink on load.
  const [animate, setAnimate] = useState(false);
  const rail = pref === "collapsed" || (pref === "auto" && pathname.startsWith("/rooms/"));

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useEffect(() => {
    void refreshRooms(); // shared and de-duplicated, so a page change is cheap
  }, [pathname]);

  useEffect(() => {
    void refreshActive();
    const timer = setInterval(() => void refreshActive(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshActive();
        void refreshRooms();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <FrameContext.Provider value={true}>
      <div className="flex flex-1">
        <aside
          className={cx(
            "sticky top-0 hidden h-dvh shrink-0 border-r bg-card md:block",
            animate && "transition-[width] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:transition-none",
            rail ? "w-[4.5rem]" : "w-64",
          )}
        >
          <SidebarBody collapsed={rail} onToggle={() => setSidebarPref(rail ? "expanded" : "collapsed")} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 md:hidden"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                onClick={() => setOpenAt(pathname)}
              >
                <Menu />
              </Button>
              <div className="md:hidden">
                <Logo href="/dashboard" />
              </div>
              <div className="ml-auto flex items-center gap-1">
                <StreakBadge />
                <UserSearch />
                <ThemeToggle />
                <UserButton size="icon" />
              </div>
            </div>
          </header>
          {children}
        </div>
      </div>

      {/* Phone drawer: always mounted so it can slide, and inert while closed. */}
      <div className={cx("fixed inset-0 z-50 md:hidden", !drawerOpen && "pointer-events-none")} inert={!drawerOpen}>
        <div
          onClick={() => setOpenAt(null)}
          className={cx(
            "absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cx(
            "absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-card shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:transition-none",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarBody collapsed={false} onClose={() => setOpenAt(null)} />
        </aside>
      </div>
      <CelebrationHost />
    </FrameContext.Provider>
  );
}
