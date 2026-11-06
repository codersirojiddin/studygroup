import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthView } from "@neondatabase/neon-js/auth/react/ui";
import { authViewPaths } from "@neondatabase/neon-js/auth/react/ui/server";

import { Logo, ThemeToggle } from "@/components/app-header";

// Covers sign-in, sign-up, forgot-password, reset-password, email
// verification callbacks and sign-out, using Neon Auth's own UI.
const paths = Object.values(authViewPaths) as string[];

export function generateStaticParams() {
  return paths.map((path) => ({ path }));
}

async function View({ params }: { params: PageProps<"/auth/[path]">["params"] }) {
  const { path } = await params;
  if (!paths.includes(path)) notFound();
  return <AuthView path={path} />;
}

export default function AuthPage({ params }: PageProps<"/auth/[path]">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <Suspense>
            <View params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
