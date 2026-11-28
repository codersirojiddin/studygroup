import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-5">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
              <BookOpen className="size-4" />
            </span>
            Study Online
          </Link>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-3xl flex-1 px-5 py-10
          [&_a]:underline [&_a]:underline-offset-4 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight
          [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-7
          [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
      >
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}