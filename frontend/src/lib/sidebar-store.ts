"use client";

import { useSyncExternalStore } from "react";

/*
 * Whether the desktop sidebar is a narrow icon rail. "auto" (nothing saved yet) means open
 * everywhere except inside a room, where the space is better spent on the chat and the timer.
 * Once the user toggles it, their choice wins on every page.
 */

export type SidebarPref = "auto" | "expanded" | "collapsed";

const KEY = "study-online:sidebar";
const listeners = new Set<() => void>();

function read(): SidebarPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "expanded" || v === "collapsed" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setSidebarPref(pref: Exclude<SidebarPref, "auto">) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Private mode or storage blocked: the choice just won't be remembered.
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSidebarPref(): SidebarPref {
  return useSyncExternalStore(subscribe, read, () => "auto");
}
