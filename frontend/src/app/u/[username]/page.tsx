import { connection } from "next/server";
import { Suspense } from "react";

import { auth } from "@/lib/auth/server";

import { ProfileClient } from "./profile-client";

async function Profile({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  await connection();
  const { username } = await params;
  const { data: session } = await auth.getSession();
  return <ProfileClient key={username} username={username} signedIn={Boolean(session?.user)} />;
}

export default function ProfilePage({ params }: PageProps<"/u/[username]">) {
  return (
    <Suspense>
      <Profile params={params} />
    </Suspense>
  );
}
