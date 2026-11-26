"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AppFrame, useInFrame } from "@/components/app-frame";
import { Logo, ThemeToggle } from "@/components/brand";

// These two moved to brand.tsx; keep the old import path working for the auth pages.
export { Logo, ThemeToggle };

/** Header for pages anyone can open, such as public profiles. */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
        <Logo href="/" />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/auth/sign-in"
            className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
          >
            Join free
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Page frame for signed-out visitors. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">{children}</main>
    </>
  );
}

/**
 * Standard page frame for signed-in pages. Inside the (app) route group the sidebar and top bar are
 * already there, so this only draws the page area; elsewhere (a profile opened by a signed-in user)
 * it brings its own frame.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const inFrame = useInFrame();
  const page = (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">{children}</main>
  );
  return inFrame ? page : <AppFrame>{page}</AppFrame>;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <div className="mt-1.5 text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
