# Convoy

Realtime chat with public rooms, 1:1 direct messages, markdown rendering, typing indicators, presence, private-message read receipts, `@mentions`, and Socket.io-powered updates — backed by **SQLite**.

The UI pairs **React + Vite** with **Express + Socket.io + JWT**. Everything routes through `/rest`-style paths (`/auth`, `/rooms`, `/messages`, …) plus Socket.io on the same origin.

## Architecture

| Layer | Responsibility |
|--------|----------------|
| `server/` | JWT auth, REST CRUD, pagination-friendly history reads, SQLite migrations |
| `server/src/socket` | Rooms (`room:id`), DMs (`conv:id`), typing, receipts, mentions ping personal channel `user:id` |
| `client/` | Auth/storage gate, dashboard shell, markdown bubbles, composer (+ Ctrl/Cmd+Enter) |

## Database schema (SQLite)

- **users** — credentials profile (`password_hash`, `display_name`, `avatar_url`, `last_seen_at`)
- **rooms** — unique `name`, `created_by`
- **room_members** — `(room_id, user_id)` membership
- **conversations** + **conversation_participants** — 1:1 DMs with `last_read_message_id` per participant for receipts
- **messages** — `body`, timestamps; belongs to **either** `room_id` **or** `conversation_id` (CHECK constraint)
- **message_reads** — optional fine-grained reads (cursor-based receipts use participant rows instead)
- **mentions** — rows per `(message_id, mentioned_user_id)` for mention targeting (`@{numericId}` in message body)

Migrations live under `server/src/db/migrations/` and run via `npm run migrate`.

## Local setup

Run **`npm run dev`** — before starting, it tries to **stop whatever is listening on `PORT`** (default **4000**) so stray Node processes don’t block startup.

*(Disable that behavior with `SKIP_FREE_PORT=1 npm run dev`.)*

### Prerequisites

- Node.js 18+

### Backend

```bash
cd server
cp .env.example .env   # edit JWT_SECRET for anything beyond local dev
npm install
npm run migrate
npm run dev            # http://localhost:4000
```

### Frontend

```bash
cd client
# Skip copying .env for local dev — Vite proxies `/api` → http://127.0.0.1:4000
npm install
npm run dev            # http://localhost:5173
```

The Vite dev server proxies `/api/*` → backend root and `/socket.io` → Socket.io. **Leave `VITE_API_URL` unset during development** so requests stay same-origin and go through `/api`.

### Troubleshooting “cannot connect” at `:5173`

1. **Backend must be running** on port **4000** (`npm run dev` in `server/`).
2. **Remove or comment `VITE_API_URL` / `VITE_SOCKET_URL` in `client/.env`** if you copied `.env.example` with empty lines — if either variable is set to a URL, the browser calls the API directly and you must match **`CLIENT_ORIGIN`** on the server (try opening the app as **`http://localhost:5173`** and **`http://127.0.0.1:5173`** consistently).
3. Server **`CLIENT_ORIGIN`** defaults to allowing **both** `http://localhost:5173` and `http://127.0.0.1:5173` when unset; override with a comma-separated list if needed.

### Tests

```bash
cd server && npm test
```

## Deployment notes

### Why Firebase **App Hosting** failed for this repo

[Firebase App Hosting](https://firebase.google.com/docs/app-hosting) uses **Cloud Buildpacks** that expect a detectable app at the **repository root** (e.g. one `package.json` + framework conventions). This project is a **`client/` + `server/` monorepo without a root Node app**, so detection fails with errors like `google.nodejs.runtime` / `google.config.entrypoint` / **No buildpack groups passed detection**.

App Hosting is also oriented toward certain **full-stack frameworks** (e.g. Next.js-style flows). Your stack is **separate Vite SPA + Express + Socket.io + SQLite files**, which belongs on **Firebase Hosting (static)** + a **real Node host** for the API (see below)—not a single App Hosting buildpack.

### Recommended Firebase piece: **Hosting (static SPA only)**

Deploy **only the built React app** (`client/dist`). Socket.io and SQLite **cannot** run on static Hosting; run **`server/` on Render, Railway, Fly.io, or Cloud Run** with WebSockets + persistent disk for SQLite.

1. Point the UI at your API (build-time env):

   ```bash
   cd client
   echo 'VITE_API_URL=https://YOUR-API.example.com' > .env.production
   npm ci && npm run build
   ```

2. From repo root (after `npm install -g firebase-tools` and `firebase login`):

   ```bash
   firebase use --add   # pick your Firebase project
   firebase deploy --only hosting
   ```

3. On **`server/`**, set **`CLIENT_ORIGIN`** to your Firebase site origin (e.g. `https://PROJECT.web.app,https://PROJECT.firebaseapp.com`).

`firebase.json` in this repo configures SPA fallback so React Router works.

---

### Generic deployment (any host)

1. **Backend** — Run `npm run migrate` once on the host, set `CLIENT_ORIGIN` to your SPA origin, provision persistent disk for `DATABASE_PATH`, enable WebSockets on your host (Render/Railway/Fly support this).
2. **Frontend** — Build `npm run build` and host `client/dist` on Netlify/Vercel/etc.
3. Point `VITE_API_URL` (and optionally `VITE_SOCKET_URL` if different) at the public API origin **without** `/api` suffix — the client talks directly to the deployed API when env vars are set.

## Mention syntax

Type `@{123}` where `123` matches another user’s numeric id (shown next to names in the rail). Mentioned online users receive a toast-style ping via Socket.io.

## Repo layout

```
server/src/
  app.js          Express wiring
  index.js        HTTP + Socket.io bootstrap
  db/             SQLite + migrations
  routes/         REST handlers
  socket/         Socket.io authorization + channels
  lib/            auth helpers, mentions parsing, DTOs
client/src/
  pages/          Landing, auth, dashboard
  context/        Auth + Socket providers
  api/client.js   Fetch helper + dev `/api` prefix
```

Licensed for coursework submission unless stated otherwise.
