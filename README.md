# Study Online

- `frontend/`: Next.js app. Sign-in, sign-up, email verification, password reset, Google OAuth and sessions come from Neon Auth (Managed Better Auth) through `@neondatabase/neon-js`.
- `backend/`: Go API (pgx). Checks Neon Auth JWTs and owns all business logic: rooms, study sessions, permissions and real-time traffic.
- Database: Neon serverless Postgres. The app tables live in `public`. Neon manages the `neon_auth` schema, and our migrations never touch it.

## How auth flows

1. The browser signs in through `/api/auth/*` on the Next.js origin. `createNeonAuth` proxies those calls to `NEON_AUTH_URL` and keeps the session in signed first-party cookies.
2. The frontend calls `authClient.token()` to get a short-lived JWT (EdDSA, 15 min) and sends it as `Authorization: Bearer …` to the Go API.
3. Go verifies the token against `NEON_AUTH_URL/.well-known/jwks.json`. It checks the signature, `iss`/`aud` (the auth URL's origin) and `exp`, and requires `sub`. It never trusts a user ID sent by the client.
4. On first contact, Go creates a `users` row keyed by `auth_user_id = sub`.
5. For WebSockets, the client exchanges its JWT for a 30-second, single-use ticket (`POST /api/ws/ticket`), then connects to `GET /ws?ticket=…`.

## API

All `/api/*` routes need `Authorization: Bearer <Neon Auth JWT>`.

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/me` | any user. Name and email sync from Neon Auth on every request. |
| GET / POST | `/api/rooms` | list mine + public / create |
| POST | `/api/rooms/join` `{code}` | join with an invite code |
| GET | `/api/rooms/{id}` | members, or anyone for public rooms (preview) |
| PATCH | `/api/rooms/{id}` | owner, moderator |
| DELETE | `/api/rooms/{id}` | owner |
| POST | `/api/rooms/{id}/join` | anyone, public rooms |
| POST | `/api/rooms/{id}/leave` | members except owner |
| POST | `/api/rooms/{id}/invite` | owner, moderator (new code) |
| POST | `/api/rooms/{id}/timer` `{action, focusMinutes?, breakMinutes?}` | owner, moderator. Shared Pomodoro: `start`, `pause`, `resume`, `skip`, `reset`. |
| PATCH | `/api/rooms/{id}/members/{userId}` `{role}` | owner |
| DELETE | `/api/rooms/{id}/members/{userId}` | owner; moderator for plain members |
| GET | `/api/rooms/{id}/leaderboard?tz=Area/City` | members. Focus time in this room since Monday. |
| GET | `/api/rooms/{id}/messages?before=&limit=` | members. Saved chat, oldest first. |
| DELETE | `/api/rooms/{id}/messages/{msgId}` | the author, owner or moderators (soft delete) |
| PUT | `/api/me/goal` `{minutes}` | daily study goal, 10-1440 minutes |
| GET / POST | `/api/todos` | your open tasks plus those done today (`?tz=`) / add a task |
| PATCH / DELETE | `/api/todos/{id}` | `{title?, done?}` / delete (own tasks only) |
| POST | `/api/sessions` `{roomId?, topic?}` | start (one running session per user) |
| POST | `/api/sessions/stop` | stop |
| GET | `/api/sessions/active` | running session or `null` |
| GET | `/api/sessions/stats?tz=Area/City` | today/week/total/streak, last 7 days, recent |
| POST | `/api/ws/ticket` | single-use WebSocket ticket |

Sessions are capped at 12 hours so a forgotten timer can't skew stats.

WebSocket (`/ws?ticket=…`) client messages: `join {roomId}`, `leave`, `chat {text}`, `ping`.
The server sends `presence`, `chat`, `chat_deleted`, `timer`, `members_changed`, `room_updated`, `kicked`, `left`, `room_deleted` and `error`.
Chat messages are stored in `chat_messages`.

## Tests

```bash
cd backend && go test ./...
```

The `internal/server` integration tests need `TEST_DATABASE_URL` (or `DIRECT_URL` in `backend/.env`).
They create a throwaway `itest_*` schema, apply the migrations there, and drop it afterwards.

## Setup

1. In the Neon Console, enable Auth on your branch. Turn on email/password and "Verify at sign-up". Add Google under OAuth providers if you want it.
2. Copy `.env.example` to `backend/.env` and `frontend/.env.local` and fill in the values.
3. Run the migrations (they use `DIRECT_URL`):
   ```bash
   cd backend && go run ./cmd/migrate up
   ```
4. Start the API:
   ```bash
   cd backend && go run ./cmd/api
   ```
5. Start the web app:
   ```bash
   cd frontend && npm run dev
   ```

New migrations go in `backend/migrations/` as `NNNN_name.up.sql` and `NNNN_name.down.sql`.
`go run ./cmd/migrate status` lists which ones have been applied.

The WebSocket ticket store is in memory. Running more than one API instance needs a shared store or sticky sessions.
