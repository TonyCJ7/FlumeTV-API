# FlumeTV API — agent guide

Read this file **before** changing code in this repository. It routes you to the right docs and enforces the same constraints as [`.cursor/rules/`](.cursor/rules/) (those rules apply automatically in Cursor; this file is the portable summary for any agent).

## What this repo is

**FlumeTV API** is a Node.js **Express** backend (TypeScript, ESM, Node ≥ 20.9) for a self-hostable **Stremio IPTV addon** and a **REST panel** for management UIs ([FlumeTV-UI](https://github.com/TonyCJ7/FlumeTV-UI)).

| Surface | Base | Auth |
| --- | --- | --- |
| REST panel | `/api/...` | httpOnly session JWT cookie (`SESSION_JWT_SECRET`) |
| Stremio addon | `/addon/:token/...` | Encrypted URL token (`ADDON_SECRET_KEY`) |

**Persistence:** PostgreSQL (`DATABASE_URL`). Schema in [`db/migrations/`](db/migrations/). **Entry:** [`src/index.ts`](src/index.ts) — DB init, scheduler, `/api` routes, `/addon/:config_hash` Stremio routes.

**Do not** add a `controllers/` layer or ad-hoc migration runners outside `db/migrations/`.

---

## Documentation map (read the right doc)

| When you need… | Read |
| --- | --- |
| **Where logic lives** — layers, queue, scheduler, room lifecycle, SSE, sync, file pointers | [`docs/backend-reference.md`](docs/backend-reference.md) |
| **Wire contracts** — REST/SSE JSON, Stremio URLs, PostgreSQL tables | [`docs/api-documentation.md`](docs/api-documentation.md) |
| **REST `code` values** — HTTP status, remediation | [`docs/api-error-codes.md`](docs/api-error-codes.md) + [`src/constants/errorCodes.constants.ts`](src/constants/errorCodes.constants.ts) |
| **Docker, env vars, quick start** | [`README.md`](README.md) |
| **Official UI integration** (cross-repo) | [FlumeTV-UI frontend-reference](https://github.com/TonyCJ7/FlumeTV-UI/blob/main/docs/frontend-reference.md) |
| **TypeScript request/response shapes** (in-repo) | [`src/types/rest.types.ts`](src/types/rest.types.ts) |

**Split of truth**

- `backend-reference.md` — *implementation* (what the code does and where).
- `api-documentation.md` — *contracts* (what clients can rely on at the wire).
- `README.md` — *operations* (self-hosting only; not API shapes).

---

## Architecture (import direction)

Acyclic DAG — **no upward imports** (no cycles).

```
routes → handlers → { core, services, database, factories, utils }
core → { services, database, factories, utils }
services → { database, factories, utils }
workers → { core, services, database, factories, utils }
addon → handlers
middleware → { utils, constants, types }
```

| Layer | Path | Role |
| --- | --- | --- |
| Routes | `src/routes/` | Thin Express routers |
| Handlers | `src/handlers/` | HTTP/Stremio entry — orchestrate only |
| Core | `src/core/` | Queue, scheduler, prefetch jobs, SSE, room lifecycle |
| Services | `src/services/` | Outbound HTTP (`axios`); normalize at boundary |
| Factories | `src/factories/` | Pure mappers — **no I/O**, no `pool.query` |
| Database | `src/database/` | SQL only — one `pool.query` per function; `withPgTransaction` for multi-step writes |
| Utils | `src/utils/` | Pure helpers |
| Workers | `src/workers/` | Child-process prefetch sync entry only |
| Addon | `src/addon/` | Stremio `addonBuilder` wiring |

**Hard rules**

- No `services` → `core`, no `core` → `handlers`, no `database` → `services` / `core`.
- No `axios` outside `services/` (except rare one-off in a handler).
- No `pool.query` in `factories/`; no handler orchestration that belongs in `core/`.
- Stremio handlers: `try/catch` → empty safe shapes (`{ streams: [] }`, `{ metas: [] }`).
- Logging in handlers/core: `dlog` from `@/utils/debug.utils` only.

---

## Domain essentials (before touching configs/sync)

- **User** — UUID `user_id`; Argon2 password on `user`.
- **Hash** — SHA-256 of canonical provider JSON; dedupes identical Xtream/M3U sources. Hash logic: [`src/utils/configHash.utils.ts`](src/utils/configHash.utils.ts).
- **`user_hash`** — Links user ↔ hash; holds **`configName`** (display only, not in hash) and **`is_active`** (only active hashes in Stremio).
- **Provider rows** — `xtream_configs` or `direct_configs` per hash; panel passwords stored encrypted (`password_enc`).
- **Room** — One stable `room` row per hash for its lifetime; sync status, progress, log buffer. Lifecycle: [`src/core/roomLifecycle.ts`](src/core/roomLifecycle.ts).
- **Prefetch queue** — FIFO; sources: new config, scheduler due, manual refetch. Workers are OS children: [`src/core/prefetchSyncWorkerProcess.ts`](src/core/prefetchSyncWorkerProcess.ts) → [`src/workers/prefetchSyncWorker.ts`](src/workers/prefetchSyncWorker.ts).
- **POST `/api/configs`** — `linkStatus: "linked-existing"` when hash exists but not linked to user; **`409 CONFIG_ALREADY_EXISTS`** if already linked (use PUT to rename/change provider).
- **DELETE** — Always unlink caller's `user_hash`; cascade `hash_config` only when last user.
- **SSRF** — Public `http`/`https` only on provider URLs; same guard on outbound fetches.

Two secrets must stay separate: **`SESSION_JWT_SECRET`** (REST) vs **`ADDON_SECRET_KEY`** (addon tokens + sealed panel passwords).

---

## Where to implement common tasks

| Task | Start here |
| --- | --- |
| New REST route | `src/routes/` → `src/handlers/` → lower layers |
| New Stremio behavior | `src/handlers/addon*.handler.ts`, register in `src/addon/addon.ts` |
| Queue / scheduler / cancel / backlog | `src/core/prefetchSyncQueue.ts`, `schedulerDue.ts` |
| Room status / logs / progress | `src/core/roomLifecycle.ts`, SSE broadcasters in `src/core/` |
| Xtream / Direct catalog fetch | `src/services/*Catalog.services.ts` → `src/core/*PrefetchSync.ts` → `src/database/*CatalogSync.db.ts` |
| Catalog/meta for addon | `src/database/catalog.db.ts`, `src/factories/` |
| New REST error code | `src/constants/errorCodes.constants.ts` + `docs/api-error-codes.md` |
| Schema change | `db/migrations/` (new numbered SQL file) + `docs/api-documentation.md` if tables/columns are contract-visible |

---

## Code conventions (summary)

Detailed rules: [`.cursor/rules/`](.cursor/rules/).

| Topic | Rule |
| --- | --- |
| **Design** | YAGNI > DRY > premature SOLID — see `design-principles.mdc` |
| **Files** | camelCase stems: `*.handler.ts`, `*.services.ts`, `*.db.ts`, `*.factory.ts`, `*.utils.ts`, `*.types.ts`, `*.constants.ts` |
| **Functions** | `handle*` = HTTP entry; `get*`/`fetch*` = read; `insert*`/`upsert*`/`update*`/`delete*` = write; no `ensure*` for writes/network |
| **Lodash** | `import _trim from "lodash/trim"` — one function per import, `_` prefix; not `import _ from "lodash"` |
| **Style** | Braces on all blocks; `{ spaced: true }`; avoid deep nesting; `npm run format` + `npm run lint` before commit |
| **Paths** | `@/` alias → `src/` |

---

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Docker dev — Postgres + API (`tsx watch`) |
| `npm run start` | Docker production image |
| `npm run dev:local` | Host dev — needs `DATABASE_URL` |
| `npm run build` | Compile to `dist/` |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |

Pre-commit (husky): lint-staged runs ESLint + Prettier on staged TS.

---

## Before you finish a session (doc maintenance)

If you changed **behavior visible to the UI, addon, or API clients**, update docs in the **same session** (do not defer). Bump **`Last updated:`** on edited docs.

| Update | When |
| --- | --- |
| [`docs/backend-reference.md`](docs/backend-reference.md) | Layers, queue/scheduler/room/SSE/sync behavior, domain rules, file pointers |
| [`docs/api-documentation.md`](docs/api-documentation.md) | Routes, JSON/SSE shapes, DB schema |
| [`docs/api-error-codes.md`](docs/api-error-codes.md) | New/changed REST `code` (with `errorCodes.constants.ts`) |
| [`README.md`](README.md) | Docker / env vars only |

**Skip doc updates** for internal refactors, renames, performance-only changes, or bug fixes with no contract/behavior change.

Do **not** document unimplemented or speculative behavior.

---

## Cursor rules index

| File | Applies |
| --- | --- |
| `design-principles.mdc` | Always — YAGNI, DRY, SOLID priority |
| `backend-reference-maintenance.mdc` | Always — doc update checklist |
| `code-style.mdc` | Always — formatting, module suffixes |
| `lodash-usage.mdc` | Always — import style |
| `function-operation-naming.mdc` | Always — verb prefixes |
| `general-naming-conventions.mdc` | Always — file stems |
| `backend-architecture-flow.mdc` | `src/**/*.ts` — import DAG |
| `addon-layering.mdc` | `src/handlers`, `core`, `services`, `database`, etc. |

---

## Related repositories

| Repo | Role |
| --- | --- |
| [FlumeTV-UI](https://github.com/TonyCJ7/FlumeTV-UI) | Official management frontend (`BASE_API_URL` → this API) |
| [FlumeTV-API](https://github.com/TonyCJ7/FlumeTV-API) | This repository |

When changing REST/SSE contracts, consider whether [FlumeTV-UI](https://github.com/TonyCJ7/FlumeTV-UI) types or hooks need a follow-up (separate repo).
