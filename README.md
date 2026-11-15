# Grok Agent Platform v1

Backend for **Grok Build + ACP v1 (STDIO) + Vercel Sandbox**: one sandbox per site, agent clones and edits the template, preview on port **3000**.

## Credentials

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL — default `127.0.0.1:5435` (use **127.0.0.1**, not `localhost`, on Windows if Docker only binds IPv4). Host port **5435** in `docker-compose.yml`; change it if already taken |
| `XAI_API_KEY` | Grok inference (passed only to `grok` process in sandbox) |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` | Sandbox SDK when running **outside** Vercel |
| `GROK_VERSION` | npm global `@xai-official/grok` pin (optional) |
| `TEMPLATE_REPO_URL` | Public git template |

On Vercel-hosted backend, Sandbox auth uses **OIDC** automatically.

## Quick start

```powershell
cd grok-agent-platform
copy .env.example .env
# Edit .env — set DATABASE_URL, XAI_API_KEY, Vercel tokens

docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

**Prisma 7:** set `DATABASE_URL` in `.env` before generate/migrate. The URL is configured in `prisma.config.ts` (not `schema.prisma`); the client is emitted to `src/generated/prisma`.

Open http://127.0.0.1:8788 for the **mobile chat Builder** (message composer, activity feed, live preview dock at the bottom). Session id is stored in `localStorage`.

## API (product)

| Method | Path |
|--------|------|
| POST | `/sessions` `{ "userId?" }` — one sandbox per session (lazy provision on first message) |
| GET | `/sessions?userId=` — recent sessions |
| GET | `/sessions/:id` |
| POST | `/sessions/:id/messages` `{ "content" }` |
| GET | `/sessions/:id/messages` — chat history + assistant summaries |
| GET | `/messages/:id/events?view=ui` (SSE) — friendly UI events |

Raw events: `GET /runs/:id/events` (optional `?view=ui`).

## API (legacy / scripts)

| Method | Path |
|--------|------|
| POST | `/workspaces` `{ "userId" }` |
| POST | `/workspaces/:id/runs` `{ "prompt" }` |
| GET | `/runs/:id` |
| GET | `/runs/:id/events` (SSE) |

## Spikes (Vercel + xAI required)

```powershell
npm run spike:phase1
npm run spike:phase2 -- "Build the shop homepage"
npm run spike:phase3
```

## Architecture

- **Backend** orchestrates sandboxes and jobs only.
- **`site-{workspaceId}`** persistent Vercel Sandbox; workspace at `/vercel/sandbox/workspace`.
- **ACP** over Sandbox `writeStdin` / stdout NDJSON — no public agent port.
- **Horizontal scale (later):** in-process SSE subscribers; add Redis pub/sub if multiple API instances.

## Frontend assets

- `public/index.html` + `public/styles/builder.css` + `public/js/{api,app,presenter}.js` (vanilla ES modules).

## Persistence note

Sandbox snapshots are **not** permanent storage (~30 day default expiry). Back up to GitHub before customer pilot.

## Local reference

Windows ACP smoke test: `../lib/grok-acp.mjs` in parent `coding_agent1` repo.