<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/TonyCJ7/FlumeTV-UI/main/public/assets/flume.png">
    <img alt="FlumeTV Logo" src="https://raw.githubusercontent.com/TonyCJ7/FlumeTV-UI/main/public/assets/flumeMix.png" width="256" height="256">
  </picture>
</p>

<h1 align="center">FlumeTV API</h1>

<p align="center">
  <strong>Self-hostable Stremio IPTV backend.</strong>
  <br />
  Ingest Direct M3U playlists and Xtream Codes panels, sync catalogs into PostgreSQL, and serve a Stremio addon plus a REST API for management UIs.
</p>

<p align="center">
  <a href="https://github.com/TonyCJ7/FlumeTV-API">
    <img src="https://img.shields.io/github/stars/TonyCJ7/FlumeTV-API?style=for-the-badge&logo=github" alt="GitHub Stars">
  </a>
  <a href="https://github.com/TonyCJ7/FlumeTV-UI">
    <img src="https://img.shields.io/badge/FlumeTV-UI-frontend-6366f1?style=for-the-badge&logo=react&logoColor=white" alt="FlumeTV UI">
  </a>
  <a href="https://hub.docker.com/r/tonycj7/flumetv-api">
    <img src="https://img.shields.io/docker/pulls/tonycj7/flumetv-api?style=for-the-badge&logo=docker" alt="Docker Pulls">
  </a>
  <a href="https://github.com/TonyCJ7/FlumeTV-API/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License MIT">
  </a>
  <a href="https://github.com/sponsors/TonyCJ7">
    <img src="https://img.shields.io/github/sponsors/TonyCJ7?style=for-the-badge&logo=githubsponsors" alt="GitHub Sponsors">
  </a>
</p>

---

## Table of contents

- [What is FlumeTV API?](#-what-is-flumetv-api)
- [Getting started](#-getting-started)
- [Pair with the frontend](#-pair-with-the-frontend)
- [Build your own frontend](#-build-your-own-frontend)
- [Environment variables](#-environment-variables)
- [Key features](#-key-features)
- [REST API](#-rest-api)
- [Stremio addon](#-stremio-addon)
- [Scripts](#-scripts)
- [Further reading](#-further-reading)
- [Support the project](#-support-the-project)
- [License](#license)

---

## ✨ What is FlumeTV API?

FlumeTV API is the backend for **[FlumeTV](https://github.com/TonyCJ7/FlumeTV-UI)** — a self-hostable **Stremio IPTV addon**. It downloads and parses **Direct M3U** playlists (with optional **XMLTV EPG**), syncs **Xtream Codes** panels, stores catalog data in **PostgreSQL**, and exposes two surfaces:

| Surface | Base | Auth |
| ------- | ---- | ---- |
| **REST panel** | `/api/...` | Session cookie (JWT) |
| **Stremio addon** | `/<token>/...` | Encrypted URL token |

Use the official **[FlumeTV UI](https://github.com/TonyCJ7/FlumeTV-UI)** to manage sources, or build your own client against the REST and SSE endpoints.

**Docker image:** [`tonycj7/flumetv-api:latest`](https://hub.docker.com/r/tonycj7/flumetv-api) on Docker Hub.

---

## 🚀 Getting started

The fastest way to self-host is **Docker Compose** with **PostgreSQL 16** and the published API image **[`tonycj7/flumetv-api:latest`](https://hub.docker.com/r/tonycj7/flumetv-api)**. Schema migrations run automatically when the API starts.

### 1. Create a directory and `.env`

```bash
mkdir flumetv-api && cd flumetv-api
```

Create a `.env` file with at least:

```env
SESSION_JWT_SECRET=change_this_to_a_long_random_secret_for_sessions
ADDON_SECRET_KEY=change_this_to_a_long_random_secret_for_addon_tokens
PORT=7001
FRONTEND_ORIGIN=http://localhost:7000
```

Use long random strings for the two secrets. See [Environment variables](#-environment-variables) for the full list. You can also clone this repo and run `cp .env.example .env`.

### 2. Save `docker-compose.yml` and start

Save the compose file below as `docker-compose.yml`, then:

```bash
docker compose pull
docker compose up -d
```

Default API URL: **http://localhost:7001** (override with `PORT` in `.env`).

PostgreSQL data persists in the **`postgres-data`** volume. Pulling a newer image does not wipe the database unless you remove the volume.

**Backup example:**

```bash
docker exec flumetv-postgres pg_dump -U flumetv flumetv > flumetv-backup.sql
```

### Compose file (copy-paste)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: flumetv-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: flumetv
      POSTGRES_PASSWORD: flumetv
      POSTGRES_DB: flumetv
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - api-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flumetv -d flumetv"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    image: tonycj7/flumetv-api:latest
    container_name: flumetv-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${PORT:-7001}:${PORT:-7001}"
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL:-postgresql://flumetv:flumetv@postgres:5432/flumetv}
    networks:
      - api-network

volumes:
  postgres-data:

networks:
  api-network:
    driver: bridge
```

> [!TIP]
> Change the default Postgres password in both `docker-compose.yml` and `DATABASE_URL`. Set **`FRONTEND_ORIGIN`** to your UI origin for CORS, and **`BASE_URL`** / **`TRUST_PROXY=1`** when running behind a reverse proxy.

To upgrade later: `docker compose pull && docker compose up -d`.

### Clone the repo (optional)

If you want the full source tree, npm scripts, or to contribute:

```bash
git clone https://github.com/TonyCJ7/FlumeTV-API.git
cd FlumeTV-API
cp .env.example .env
docker compose up -d
```

The repo [`docker-compose.yml`](docker-compose.yml) uses the same published image.

### Build from source (optional)

To build the API image locally instead of pulling from Docker Hub, replace the `api` service `image` line with:

```yaml
    build:
      context: .
      dockerfile: Dockerfile
```

Then run `docker compose up -d --build`.

### Development (contributors)

Requires Node.js ≥ 20.9.

| Command | What runs |
| -------- | --------- |
| `npm run dev` | Compose dev overlay — Postgres + API with **`tsx watch`** and source bind mount |
| `npm run start` | Production Compose — Postgres + **`tonycj7/flumetv-api:latest`** |
| `npm run dev:local` | Host Node only — requires **`DATABASE_URL`** pointing at local Postgres |
| `npm run docker:down` | Stops dev and production Compose stacks |

---

## 🌐 Pair with the frontend

FlumeTV is designed as a **two-service stack**. Run this API together with the official UI:

| Service | Repository | Default URL |
| ------- | ---------- | ----------- |
| **API** (this repo) | [FlumeTV-API](https://github.com/TonyCJ7/FlumeTV-API) | `http://localhost:7001` |
| **UI** | [FlumeTV-UI](https://github.com/TonyCJ7/FlumeTV-UI) | `http://localhost:7000` |

After the API is running:

```bash
git clone https://github.com/TonyCJ7/FlumeTV-UI.git
cd FlumeTV-UI
cp .env.example .env.local
# BASE_API_URL=http://localhost:7001
npm install
npm run dev
```

Set **`FRONTEND_ORIGIN`** on the API (comma-separated if needed) to match your UI origin so session cookies and CORS work. The Stremio **`/configure`** redirect also uses **`FRONTEND_ORIGIN`**.

---

## 🛠️ Build your own frontend

You do **not** have to use FlumeTV UI. The REST API and SSE streams are stable contracts for any management client:

- **Auth** — Register/login via `/api/auth/*`; session is an httpOnly JWT cookie (`credentials: "include"` from the browser).
- **Configs** — CRUD provider sources under `/api/configs`.
- **Live sync state** — Prefetch status SSE at `/api/configs/prefetch-status/stream`, or poll `/api/configs/prefetch-status`.
- **Per-hash ops** — Refetch, cancel, toggle active, room events, and log streaming under `/api/hashes/:hash/...`.
- **Stremio install** — `GET /api/stremio/manifest-url` returns `manifestUrl` and `stremioWebInstallUrl`.

Stremio itself talks to the **public addon** at `/<token>/...` (encrypted user token, no session cookie). Your frontend only needs the REST surface unless you embed Stremio install flows.

Detailed integration notes: [`docs/api-documentation.md`](docs/api-documentation.md).

---

## 🔑 Environment variables

Copy [`.env.example`](.env.example) to `.env` before running or deploying. Values are read at **process startup** — restart after changes.

### Required

| Variable | Description |
| -------- | ----------- |
| `SESSION_JWT_SECRET` | Signs REST session JWT. Server will not start without it. |
| `ADDON_SECRET_KEY` | Encrypts Stremio addon URL tokens and sealed panel passwords. Server will not start without it. |
| `DATABASE_URL` | PostgreSQL connection string. Compose overrides the host to `@postgres:5432` for `npm run dev` / `npm run start`. |

### HTTP, CORS, and public URLs

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `7001` | HTTP listen port. |
| `FRONTEND_ORIGIN` | `http://localhost:7000` | CORS allowed origin(s); comma-separated. |
| `BASE_URL` | request URL | Public base for `GET /api/stremio/manifest-url` when proxy headers are wrong. |
| `TRUST_PROXY` | off | Set to `1` behind one reverse-proxy hop (client IP, `Secure` cookies). |
| `NODE_ENV` | — | `production` enables `Secure` session cookies and compiled worker scripts. |

### Session and auth

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `SESSION_COOKIE_NAME` | `session` | httpOnly cookie name. |
| `SESSION_MAX_AGE_SECONDS` | `604800` (7d) | JWT / cookie max age. |
| `AUTH_RATE_LIMIT_MAX` | `60` | Max requests per window for register/login. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` (15m) | Rate-limit window. |

### Prefetch queue and scheduler

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `FETCH_PARALLELISM` | `4` | Concurrent prefetch worker slots. |
| `FETCH_MAX_BACKLOG_HOURS` | `20` | Max estimated backlog before scheduler defers work. |
| `SCHEDULER_DUE_POLL_MS` | `30000` | Due-job poll interval. |
| `DEFAULT_SCHEDULER_INTERVAL_MINUTES` | `1440` | Default per-hash sync interval. |
| `FETCH_TIMING_MAX_ROWS` | `500` | Cap on timing history rows. |
| `DEFAULT_FETCH_DURATION_MS_ESTIMATE` | `120000` | Fallback avg fetch duration. |

### Upstream fetch timeouts (ms)

| Variable | Default |
| -------- | ------- |
| `XTREAM_CATALOG_FETCH_TIMEOUT_MS` | `3600000` |
| `XTREAM_META_FETCH_TIMEOUT_MS` | `120000` |
| `DIRECT_M3U_FETCH_TIMEOUT_MS` | `3600000` |

### Proxy, database pool, progress throttling

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | Enables `global-agent` for outbound HTTP when set. |
| `PG_POOL_MAX` | `10` | Max connections in the HTTP process pool. |
| `PG_POOL_MAX_WORKER` | `2` | Max connections in prefetch worker pools. |
| `SYNC_PROGRESS_MIN_INTERVAL_MS` | `500` | Min ms between sync progress broadcasts. |
| `LOG_SECTOR_PROGRESS_MIN_INTERVAL_MS` | same as above | Throttle for sector log updates. |
| `POSTGRES_PORT` | `5432` | Host port when using Compose `postgres` service. |

### Prefetch worker tuning

| Variable | Description |
| -------- | ----------- |
| `PREFETCH_WORKER_NODE_OPTIONS` | Extra `node` flags for worker spawn (e.g. `--max-old-space-size=4096`). |
| `PREFETCH_WORKER_SCRIPT` | Override worker entry script path. |
| `PREFETCH_SYNC_WORKER` | **Internal only** — set inside the worker child. Do not set on the HTTP process. |

### Other

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DEBUG_MODE` | off | Verbose diagnostic logging when `true`. |

> [!WARNING]
> Rotating **`ADDON_SECRET_KEY`** invalidates all existing Stremio addon URLs. Users must fetch a new `manifestUrl` after rotation. Panel passwords encrypted with the old key require re-entry or migration.

---

## 🚀 Key features

### 📡 Provider ingestion

- **Direct M3U** — Download and parse playlists; optional **XMLTV EPG** for guide metadata.
- **Xtream Codes** — Full panel sync (live, VOD, series); episode meta fetched at Stremio meta time.
- **Config deduplication** — Identical provider payloads share one catalog hash; multiple users can link the same hash.
- **Named configs** — Per-user display labels (`configName`) independent of the hash.
- **Active toggle** — Only active hashes appear in Stremio catalogs.

### 📺 Catalog and playback

- **PostgreSQL-backed catalog** — Live, movie, and series categories and streams synced per hash.
- **Stremio addon** — Manifest, catalog, meta, stream, and configure routes via **stremio-addon-sdk** wiring.
- **Encrypted addon tokens** — Public URLs use UUID-only tokens (no raw user ids in paths).
- **Stream resolution** — Playback URLs from synced M3U rows or Xtream panel URLs.

### ⚙️ Sync engine

- **Background prefetch workers** — Catalog imports run in **child processes** so HTTP stays responsive.
- **FIFO queue** — New configs, scheduler due jobs, and manual refetches share one queue.
- **Scheduler** — Per-hash automatic re-sync on configurable intervals.
- **Backlog guard** — Rejects enqueue when estimated wait exceeds configured hours.
- **Cancel** — Stop queued or running sync jobs per hash.
- **Hybrid progress** — Byte-based when `Content-Length` is known; time-estimate fallback otherwise.

### 📊 Real-time updates (SSE)

- **Prefetch status stream** — User-scoped config list sync state and global queue depth.
- **Room events** — Per-hash status, progress, and queue position.
- **Log stream** — Structured prefetch log lines with sector progress, tones, and in-place row updates.

### 🛡️ Security and operations

- **Session auth** — Argon2 passwords; JWT httpOnly cookies for REST.
- **SSRF guard** — Private IPs, localhost, and metadata hostnames rejected on config URLs and outbound fetches.
- **Rate limiting** — Register and login endpoints throttled.
- **Versioned migrations** — SQL in `db/migrations/`; applied on startup or via `npm run db:migrate`.
- **Room lifecycle** — One stable room row per hash; logs retained after sync until the next run.
- **Crash recovery** — Orphaned active rooms marked failed on server restart.

---

## 📡 REST API

### Auth — `/api/auth`

| Method | Path |
| ------ | ---- |
| `POST` | `/api/auth/register` |
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/logout` |
| `GET` | `/api/auth/me` |
| `POST` | `/api/auth/change-password` |

Register and login are rate-limited.

### Configs — `/api/configs` (session required)

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/api/configs` | List user's configs |
| `GET` | `/api/configs/prefetch-status` | One-shot poll |
| `GET` | `/api/configs/prefetch-status/stream` | SSE — preferred for live updates |
| `POST` | `/api/configs` | Body requires `configName` + provider (`type: "xtream" \| "direct"`) |
| `PUT` | `/api/configs/:hash` | Update name or provider |
| `DELETE` | `/api/configs/:hash` | Unlink; cascade when last user |

**Prefetch-status SSE events:** `snapshot` (full state on connect), `hash` (single entry upsert/remove), `global_queue` (queue counts).

### Hash ops — `/api/hashes/:hash` (session required)

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/api/hashes/:hash/room/events` | Room status / progress SSE |
| `GET` | `/api/hashes/:hash/logs/stream` | Prefetch log SSE |
| `POST` | `/api/hashes/:hash/refetch` | Enqueue sync |
| `POST` | `/api/hashes/:hash/cancel` | Cancel queued/running job |
| `PATCH` | `/api/hashes/:hash/active` | Body: `{ "isActive": boolean }` |

### Stremio install — `/api/stremio` (session required)

| Method | Path |
| ------ | ---- |
| `GET` | `/api/stremio/manifest-url` |

Returns **`manifestUrl`** (copy-paste) and **`stremioWebInstallUrl`** (opens Stremio Web with addon pre-filled).

REST error codes: [`docs/api-error-codes.md`](docs/api-error-codes.md).

---

## 📺 Stremio addon

Public routes are mounted at `/:token` where `token` is the encrypted user token from `manifest-url` (not the config hash used in REST).

| Pattern | Purpose |
| ------- | ------- |
| `GET /:token/manifest.json` | Addon manifest |
| `GET /:token/configure` | **302** → `{FRONTEND_ORIGIN}/config?uuid=<userId>` |
| `GET /:token/catalog/...` | Catalogs |
| `GET /:token/stream/...` | Playback URLs |
| `GET /:token/meta/...` | Meta |

Handlers serve data for the user's **active** hashes only.

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Docker dev stack (`tsx watch`) |
| `npm run start` | Docker production stack |
| `npm run dev:local` | Host dev — set `DATABASE_URL` |
| `npm run start:local` | Host production — run `build` first |
| `npm run build` | Compile to `dist/` |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run docker:down` | Stop Compose stacks |

---

## Further reading

| Doc | Purpose |
| --- | ------- |
| [`AGENTS.md`](AGENTS.md) | Agent onboarding — docs map, layering, conventions, doc maintenance |
| [`docs/backend-reference.md`](docs/backend-reference.md) | Backend implementation — architecture, domain, runtime behavior |
| [`docs/api-documentation.md`](docs/api-documentation.md) | REST/SSE/Stremio API reference and PostgreSQL schema |
| [`docs/api-error-codes.md`](docs/api-error-codes.md) | REST error codes |
| [FlumeTV-UI](https://github.com/TonyCJ7/FlumeTV-UI) | Official management frontend |

---

## ❤️ Support the project

FlumeTV is developed and maintained for self-hosters. If you find it useful, please consider:

- ⭐ **[Star the repository](https://github.com/TonyCJ7/FlumeTV-API)** on GitHub.
- 🤝 **Contribute** — Report issues, suggest features, or submit pull requests.
- ☕ **Donate**:
  - **[Ko-fi](https://ko-fi.com/tonycj07)**
  - **[GitHub Sponsors](https://github.com/sponsors/TonyCJ7)**

<p align="center">
  <a href="https://ko-fi.com/tonycj07" target="_blank" rel="noopener noreferrer">
    <img src="https://raw.githubusercontent.com/TonyCJ7/FlumeTV-UI/main/public/assets/kofi-logomark.png" alt="Ko-fi" height="40" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/sponsors/TonyCJ7" target="_blank" rel="noopener noreferrer">
    <img src="https://raw.githubusercontent.com/TonyCJ7/FlumeTV-UI/main/public/assets/github-sponsors.svg" alt="GitHub Sponsors" height="40" />
  </a>
</p>

---

## License

MIT
