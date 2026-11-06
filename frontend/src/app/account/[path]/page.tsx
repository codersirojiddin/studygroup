import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AccountView } from "@neondatabase/neon-js/auth/react/ui";
import { accountViewPaths } from "@neondatabase/neon-js/auth/react/ui/server";

import { AppShell, PageHeader } from "@/components/app-header";

const paths = Object.values(accountViewPaths) as string[];

export function generateStaticParams() {
  return paths.map((path) => ({ path }));
}

async function View({ params }: { params: PageProps<"/account/[path]">["params"] }) {
  const { path } = await params;
  if (!paths.includes(path)) notFound();
  return <AccountView path={path} />;
}

export default function AccountPage({ params }: PageProps<"/account/[path]">) {
  return (
    <AppShell>
      <PageHeader title="Account" description="Your name here is what others see in rooms." />
      <Suspense>
        <View params={params} />
      </Suspense>
    </AppShell>
  );
}
