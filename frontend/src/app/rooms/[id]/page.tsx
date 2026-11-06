import { Suspense } from "react";

import { RoomClient } from "./room-client";

async function Room({ params }: { params: PageProps<"/rooms/[id]">["params"] }) {
  const { id } = await params;
  return <RoomClient key={id} id={id} />;
}

export default function RoomPage({ params }: PageProps<"/rooms/[id]">) {
  return (
    <Suspense>
      <Room params={params} />
    </Suspense>
  );
}
