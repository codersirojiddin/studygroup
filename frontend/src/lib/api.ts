"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL!.replace(/\/$/, "");

// Neon Auth JWTs live for 15 minutes. Cache the current one in memory only
// (never localStorage) and fetch a new one shortly before it expires.
let cached: { token: string; exp: number } | null = null;
let inflight: Promise<string> | null = null;

function expiryOf(token: string): number {
  const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  return payload.exp * 1000;
}

export async function getAccessToken(): Promise<string> {
  if (cached && cached.exp - Date.now() > 60_000) return cached.token;
  inflight ??= (async () => {
    try {
      // Call Better Auth's JWT endpoint through our /api/auth proxy directly.
      // authClient.token() can't be used here: the SDK routes /token through
      // its getSession cache and returns { session, user } instead of { token }.
      const res = await fetch("/api/auth/token", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) throw new Error("Not signed in");
      if (!res.ok) throw new Error(`Token request failed (${res.status})`);
      const { token } = (await res.json()) as { token?: string };
      if (!token) throw new Error("Token response had no token");
      cached = { token, exp: expiryOf(token) };
      return token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearAccessToken() {
  cached = null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Calls the Go API with the caller's Neon Auth JWT as a bearer token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) clearAccessToken();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Calls a public Go API endpoint without credentials, so it works signed out. */
export async function publicApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

/**
 * Opens an authenticated WebSocket. Browsers can't send an Authorization
 * header on the handshake, so trade the JWT for a single-use ticket first.
 */
export async function openSocket(): Promise<WebSocket> {
  const { ticket } = await api<{ ticket: string }>("/api/ws/ticket", { method: "POST" });
  const wsUrl = API_URL.replace(/^http/, "ws");
  return new WebSocket(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}`);
}
