"use client";

import { createAuthClient } from "@neondatabase/neon-js/auth/next";

// Talks to the same-origin /api/auth proxy (see app/api/auth/[...path]).
export const authClient = createAuthClient();
