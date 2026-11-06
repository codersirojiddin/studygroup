import { createNeonAuth } from "@neondatabase/neon-js/auth/next/server";

// Server-only. The browser talks to /api/auth on this origin; this instance
// proxies those requests to Neon Auth and keeps the session in signed,
// first-party cookies. Neither value below is exposed to the client.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
