"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NeonAuthUIProvider } from "@neondatabase/neon-js/auth/react/ui";

import { authClient } from "@/lib/auth/client";
import { clearAccessToken } from "@/lib/api";

// Turn Google on only after it is configured in the Neon Console
// (Auth > OAuth providers); otherwise the button would lead to an error.
const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => {
        clearAccessToken();
        router.refresh();
      }}
      Link={Link}
      redirectTo="/dashboard"
      credentials={{ forgotPassword: true }}
      emailVerification
      social={googleEnabled ? { providers: ["google"] } : undefined}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
