# FlumeTV Cleanup Domain Map

Last updated: 2026-06-06  
Phase: 0 complete | Waves A–E complete | Phase 2 complete (knip clean)

Gortex bootstrap: **FlumeTV-API** (147 files, 4205 nodes) + **FlumeTV-UI** (239 files, 3267 nodes) indexed. No prior session notes.

---

## Seed findings (S1–S5)

| ID  | Repo | File                              | Issue                                                         | Status        | Target action                                                              | PR  |
| --- | ---- | --------------------------------- | ------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------- | --- |
| S1  | UI   | `utils/prefetchUiBand.utils.ts`   | `PrefetchUiBand`, `DerivePrefetchUiBandResult` types in utils | **CONFIRMED** | MOVE → `types/prefetchUiBand.types.ts`                                     | A1  |
| S2  | UI   | `utils/roomClosedReason.utils.ts` | `KnownRoomClosedReason` type in utils                         | **CONFIRMED** | MOVE → `types/roomClosedReason.types.ts`                                   | A1  |
| S3  | UI   | `constants/room.constants.ts`     | `isTerminalRoomStatus` function in constants                  | **CONFIRMED** | MOVE → `utils/roomStatus.utils.ts` (or DELETE — 0 UI callers)              | A1  |
| S4  | UI   | `types/restError.types.ts`        | `isRestApiFallbackCode` function in types                     | **CONFIRMED** | MOVE → `utils/restError.utils.ts`                                          | B1  |
| S5  | API  | `src/constants/room.constants.ts` | `isIdleRoomStatus`, `isTerminalRoomStatus` in constants       | **CONFIRMED** | MOVE → `src/utils/roomStatus.utils.ts`; DELETE `isIdleRoomStatus` (0 refs) | A1  |

---

## Domain: RoomPrefetchSSE

### Relation hub (callers → callee)

| Caller file:symbol                           | Callee file:symbol                                                                 | Cross-repo? |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| UI:`usePrefetchStatusStream`                 | API:`configsPrefetchStatusSseBroadcaster`                                          | yes         |
| UI:`useConfigLogStream`                      | API:`roomSseBroadcaster`                                                           | yes         |
| UI:`prefetchStatusSelectors::mergeConfigRow` | UI:`derivePrefetchUiBand`                                                          | no          |
| API:`enqueueSyncJob`                         | API:`scheduleDrain` → `runQueueJob` → `runPrefetchSyncWorkerProcess`               | no          |
| API:`broadcastRoomSse`                       | API:`buildRoomSseMessages` → `isTerminalRoomStatus`, `roomSyncProgressFromRow`     | no          |
| API:`maybeResetTerminalRoomToIdle`           | API:`isTerminalRoomStatus` → `resetRoomToIdle`                                     | no          |
| API:`configItemFactory`                      | API:`listItemBaseFromRow` → `ACTIVE_SYNC_ROOM_STATUSES`, `roomSyncProgressFromRow` | no          |
| API:`createPrefetchSectorLogEmitter`         | API:`createThrottledPrefetchSectorLogReporter`                                     | no          |
| UI:`prefetchUiBand.utils`                    | UI:`room.constants` (`IN_PROGRESS_ROOM_STATUSES`)                                  | no          |
| UI:`roomClosedReason.utils`                  | UI:`room.constants` (`ROOM_CLOSED_REASON_I18N_KEYS`)                               | no          |

### Findings

| Symbol / file                                                         | Domain          | Issue                     | Evidence (Gortex)                                           | Action                                          | PR  |
| --------------------------------------------------------------------- | --------------- | ------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | --- |
| S1 UI `PrefetchUiBand`, `DerivePrefetchUiBandResult`                  | RoomPrefetchSSE | type in utils             | 4 import sites                                              | MOVE → `types/prefetchUiBand.types.ts`          | A1  |
| S2 UI `KnownRoomClosedReason`                                         | RoomPrefetchSSE | type in utils             | `check_references`: 0 external                              | MOVE → `types/roomClosedReason.types.ts`        | A1  |
| S3 UI `isTerminalRoomStatus`                                          | RoomPrefetchSSE | fn in constants           | `check_references`: 0 UI callers                            | MOVE → `utils/roomStatus.utils.ts` or DELETE    | A1  |
| S5 API `isIdleRoomStatus`, `isTerminalRoomStatus`                     | RoomPrefetchSSE | fn in constants           | 7 import sites for terminal; idle 0 refs                    | MOVE → `utils/roomStatus.utils.ts`; DELETE idle | A1  |
| API `PrefetchSectorLogInput` (`syncProgress.utils.ts`)                | RoomPrefetchSSE | type in utils             | grep + Gortex                                               | MOVE → `room.types.ts`                          | A1+ |
| API prefetch worker log types (`prefetchWorkerLog.utils.ts`)          | RoomPrefetchSSE | types in utils            | services import from utils                                  | MOVE → `room.types.ts`                          | A1+ |
| UI `PrefetchStatusSseEventName` (`prefetchStatusStream.constants.ts`) | RoomPrefetchSSE | type in constants         | 0 importers                                                 | MOVE → `types/prefetchStatusStream.types.ts`    | A1  |
| UI `RoomLogSsePayload` re-export (`logStream.types.ts`)               | RoomPrefetchSSE | type smuggling            | consumers use `room.types` directly                         | REMOVE re-export                                | A1  |
| UI `RoomLastOutcome`, `RoomSyncProgress` re-export (`rest.types.ts`)  | RoomPrefetchSSE | type smuggling            | `prefetchStatusSelectors` imports via rest                  | REMOVE re-export; point at `room.types`         | A1  |
| API `isIdleRoomStatus`                                                | RoomPrefetchSSE | dead export               | `check_references`: 0                                       | DELETE                                          | A2  |
| API `PrefetchWorkerLogLevel`                                          | RoomPrefetchSSE | dead + deprecated         | `check_references`: 0                                       | DELETE                                          | A2  |
| API `PrefetchSyncProgressFn`                                          | RoomPrefetchSSE | dead export               | grep: definition only                                       | DELETE                                          | A2  |
| API `emitSectorDownloadProgress`                                      | RoomPrefetchSSE | dead export               | `check_references`: 0                                       | DELETE                                          | A2  |
| API `PrefetchSectorLogContext`                                        | RoomPrefetchSSE | dead (only used by above) | coupled to dead fn                                          | DELETE                                          | A2  |
| UI `formatApproxExecuteTime`                                          | RoomPrefetchSSE | dead export               | knip + `check_references`: 0                                | DELETE                                          | A2  |
| UI `formatSyncProgressLabel`                                          | RoomPrefetchSSE | dead export               | knip + `check_references`: 0                                | DELETE                                          | A2  |
| UI `prefetchStatusStream.constants.ts` (whole file)                   | RoomPrefetchSSE | unused module             | knip; hook hardcodes event names                            | CONSOLIDATE or DELETE                           | A2  |
| UI `lastOutcomeToTagVariant`                                          | RoomPrefetchSSE | over-exported             | 1 same-file caller                                          | INLINE (unexport)                               | A2  |
| UI `roomLogToneFromLegacyLevel`                                       | RoomPrefetchSSE | over-exported             | 1 same-file caller                                          | INLINE (unexport)                               | A2  |
| UI `isConfigPrefetchStatusEntry`                                      | RoomPrefetchSSE | weak room guard           | shallow validation                                          | TIGHTEN TYPE                                    | A3  |
| UI `parseRoomSyncProgressFromSse`                                     | RoomPrefetchSSE | partial progress parse    | omits `phase`, `bytes*`                                     | TIGHTEN TYPE or DEFER                           | A3  |
| API SSE broadcasters internal `unknown`                               | RoomPrefetchSSE | internal weak types       | `configsPrefetchStatusSseBroadcaster`, `roomSseBroadcaster` | TIGHTEN TYPE                                    | A3  |
| API `prefetchSyncWorkerProcess.ts` IPC `unknown`                      | RoomPrefetchSSE | boundary parse            | documented defer                                            | DEFER narrow at boundary                        | A3  |
| API/UI `isTerminalRoomStatus` mirrors                                 | RoomPrefetchSSE | cross-repo contract       | `same_name_elsewhere`                                       | KEEP both after MOVE                            | —   |
| API/UI `roomLogToneFromLegacyLevel` mirrors                           | RoomPrefetchSSE | cross-repo contract       | same_name_elsewhere                                         | KEEP both                                       | —   |

### DELETE candidates (hold until domain wave complete)

| Symbol                                 | check_references | Blocked by                 |
| -------------------------------------- | ---------------- | -------------------------- |
| API `isIdleRoomStatus`                 | false            | A1 move phase              |
| API `emitSectorDownloadProgress`       | false            | A2                         |
| UI `formatApproxExecuteTime`           | false            | A2                         |
| UI `formatSyncProgressLabel`           | false            | A2                         |
| UI `prefetchStatusStream.constants.ts` | false (file)     | A2 wire-or-delete decision |

---

## Domain: RestErrors

### Relation hub (callers → callee)

| Caller file:symbol                                  | Callee file:symbol                                  | Cross-repo? |
| --------------------------------------------------- | --------------------------------------------------- | ----------- |
| UI:`infra/apiClient`                                | UI:`toRestApiError`                                 | no          |
| UI:`addConfigError.utils` / `editConfigError.utils` | UI:`isRestApiFallbackCode`                          | no          |
| API:`handleLogin` / `requireAuth`                   | API:`sendKnownRestError` → `REST_ERROR_DEFINITIONS` | no          |
| API:`postConfig.handler` / `hashOps.handler`        | API:`REST_ERROR_CODES.*` + `sendKnownRestError`     | no          |
| API:`enqueueSyncJob`                                | API:`REST_ERROR_CODES.QUEUE_*`                      | no          |

### Findings

| Symbol / file                                 | Domain     | Issue                           | Evidence (Gortex) | Action                            | PR  |
| --------------------------------------------- | ---------- | ------------------------------- | ----------------- | --------------------------------- | --- |
| S4 UI `isRestApiFallbackCode`                 | RestErrors | fn in types                     | 5 callers         | MOVE → `utils/restError.utils.ts` | B1  |
| UI `toRestApiError` unsafe cast               | RestErrors | `body.code as RestApiErrorCode` | no runtime guard  | TIGHTEN TYPE                      | B3  |
| API `PostConfig*RequestBody` `unknown` fields | RestErrors | ingress until parse             | documented policy | DEFER                             | C3  |
| API/UI `REST_ERROR_CODES` mirrors             | RestErrors | contract sync                   | intentional       | KEEP                              | —   |
| API `sendKnownRestError`                      | RestErrors | correct layer                   | thin mapper       | KEEP                              | —   |

### DELETE candidates

| Symbol                   | check_references | Blocked by |
| ------------------------ | ---------------- | ---------- |
| (none in scoped folders) | —                | —          |

---

## Domain: ConfigCRUD

### Relation hub (callers → callee)

| Caller file:symbol             | Callee file:symbol                                           | Cross-repo? |
| ------------------------------ | ------------------------------------------------------------ | ----------- |
| UI:`AddConfigDialogContainer`  | UI:`toPostConfigXtreamRequestBody` → API POST `/api/configs` | yes         |
| UI:`EditConfigDialogContainer` | UI:`classifyPutConfigResponse` → API PUT                     | yes         |
| API:`getConfigs.handler`       | API:`configItemFactory` → `listItemBaseFromRow`              | no          |
| API:`postConfig.handler`       | API:`computeXtreamConfigHash` / `computeDirectConfigHash`    | no          |

### Findings

| Symbol / file                                           | Domain     | Issue                  | Evidence (Gortex)                                     | Action       | PR  |
| ------------------------------------------------------- | ---------- | ---------------------- | ----------------------------------------------------- | ------------ | --- |
| API `xtremeConfigItemFactory` spelling                  | ConfigCRUD | `xtreme` vs `xtream`   | wide blast radius                                     | DEFER rename | —   |
| UI `z.infer` types in `validation/config.validation.ts` | ConfigCRUD | types in validation    | conventional Zod pairing                              | DEFER        | —   |
| API `PostConfig*RequestBody` ingress `unknown`          | ConfigCRUD | Validated\* split done | `parsePostConfigRequestBody` + `ValidatedPostConfig*` | **DONE** C3  |
| UI `config.utils.ts` exports                            | ConfigCRUD | all referenced         | grep                                                  | KEEP         | —   |
| UI `configCardDisplay.utils.ts`                         | ConfigCRUD | all referenced         | `ConfigPageContainer`                                 | KEEP         | —   |

### DELETE candidates

| Symbol                          | check_references | Blocked by |
| ------------------------------- | ---------------- | ---------- |
| (none proven in scoped folders) | —                | —          |

---

## Domain: AuthSession

### Relation hub (callers → callee)

| Caller file:symbol       | Callee file:symbol                          | Cross-repo? |
| ------------------------ | ------------------------------------------- | ----------- |
| UI:`AuthDialogContainer` | UI:`mapAuthApiFailure` → API login/register | yes         |
| API:`handleLogin`        | API:`verifyPassword` → `signSessionToken`   | no          |
| API:`requireAuth`        | API:`verifySessionToken`                    | no          |
| API:`index.ts`           | API:`assertAddonSecretConfigured`           | no          |

### Findings

| Symbol / file                                | Domain      | Issue                           | Evidence (Gortex)       | Action                                     | PR  |
| -------------------------------------------- | ----------- | ------------------------------- | ----------------------- | ------------------------------------------ | --- |
| API `encodeToken(data: Record<string, any>)` | AuthSession | sole `any` in scoped utils      | `crypto.utils.ts:40`    | TIGHTEN TYPE → `unknown` or narrow payload | D1  |
| API `assertAddonSecretConfigured`            | AuthSession | Gortex false negative           | grep: `index.ts:28`     | KEEP                                       | —   |
| UI `mapAuthApiFailure` rate-limit branch     | AuthSession | client-only `"RATE_LIMIT"` code | not in REST_ERROR_CODES | DEFER                                      | —   |
| UI auth validation `z.infer` co-location     | AuthSession | types in validation             | standard pattern        | DEFER                                      | —   |

### DELETE candidates

| Symbol | check_references | Blocked by |
| ------ | ---------------- | ---------- |
| (none) | —                | —          |

---

## Domain: HashOps

### Relation hub (callers → callee)

| Caller file:symbol       | Callee file:symbol                                        | Cross-repo? |
| ------------------------ | --------------------------------------------------------- | ----------- |
| UI:`ConfigPageContainer` | UI:`mapConfigHashOpsApiFailure` → API hash ops            | yes         |
| API:`hashOps.handler`    | API:`computeXtreamConfigHash` / `REST_ERROR_CODES`        | no          |
| API:`postConfig.handler` | API:`computeXtreamConfigHash` / `computeDirectConfigHash` | no          |

### Findings

| Symbol / file                          | Domain  | Issue                           | Evidence (Gortex)  | Action   | PR  |
| -------------------------------------- | ------- | ------------------------------- | ------------------ | -------- | --- |
| API `normalizeProviderUrl`             | HashOps | exported, file-private use only | 4 internal calls   | Unexport | D2  |
| UI `configHashOps*.utils.ts`           | HashOps | all referenced                  | containers + store | KEEP     | —   |
| API `buildXtreamCanonicalPayload` etc. | HashOps | correct pure builders           | utils layer        | KEEP     | —   |

### DELETE candidates

| Symbol                 | check_references | Blocked by |
| ---------------------- | ---------------- | ---------- |
| (none — unexport only) | —                | —          |

---

## Domain: CatalogAddon

### Relation hub (callers → callee)

| Caller file:symbol                  | Callee file:symbol                                         | Cross-repo? |
| ----------------------------------- | ---------------------------------------------------------- | ----------- |
| API:`addonCatalog.handler`          | API:`metaPreviewFactory`                                   | no          |
| API:`addonMeta.handler`             | API:`xtremeMetaDetailFactory`                              | no          |
| API:`fetchDirectM3uPlaylistEntries` | API:`parseM3uExtinfLine` → `directFormattedCatalogFactory` | no          |
| UI:`installThunks`                  | API GET manifest URL                                       | yes         |

### Findings

| Symbol / file                                           | Domain       | Issue                        | Evidence (Gortex)           | Action                       | PR  |
| ------------------------------------------------------- | ------------ | ---------------------------- | --------------------------- | ---------------------------- | --- |
| API `M3uExtinfLineParts` (`m3uPlaylist.utils.ts`)       | CatalogAddon | type in utils                | beside parser               | MOVE → `directSync.types.ts` | D3  |
| API `xtreme*` spelling inconsistency                    | CatalogAddon | `xtreme` vs `xtream`         | established domain          | DEFER                        | —   |
| API factory `Dictionary<unknown>[]` ingress             | CatalogAddon | provider rows unknown-shaped | service boundary normalizes | KEEP                         | —   |
| API `stremioAddonSdk.utils::addonBuilder`               | CatalogAddon | Gortex false negative        | grep: `addon.ts:8`          | KEEP                         | —   |
| UI `GetStremioManifestUrlResponseBody`                  | CatalogAddon | referenced                   | `installThunks`             | KEEP                         | —   |
| UI `configCardFormat.utils` / `configCardDisplay.utils` | CatalogAddon | display only                 | config page                 | KEEP (placement OK)          | —   |

### DELETE candidates

| Symbol                                             | check_references | Blocked by |
| -------------------------------------------------- | ---------------- | ---------- |
| (none in factories — all 7 entrypoints referenced) | —                | —          |

---

## Domain: SharedInfra

### Relation hub (callers → callee)

| Caller file:symbol              | Callee file:symbol                  | Cross-repo? |
| ------------------------------- | ----------------------------------- | ----------- |
| API:`requestLog.middleware`     | API:`logInfo`, `colorizeHttpMethod` | no          |
| API:`prefetchSyncQueue`         | API:`dlog`, `logInfo`               | no          |
| UI:`prefetchStatusStream.utils` | UI:`parseJsonObject` (`json.utils`) | no          |
| UI:30+ `*.styled.tsx`           | UI:`styled.utils` default export    | no          |

### Findings

| Symbol / file                                     | Domain      | Issue                        | Evidence (Gortex)                    | Action            | PR      |
| ------------------------------------------------- | ----------- | ---------------------------- | ------------------------------------ | ----------------- | ------- |
| API `TABLE_NAMES`                                 | SharedInfra | Gortex false negative        | grep: 20+ db files                   | KEEP              | —       |
| API `DEFAULT_FRONTEND_ORIGIN`                     | SharedInfra | Gortex: 0 external           | internal to `frontendOriginsFromEnv` | Unexport optional | D4      |
| API `dlog` / `logInfo`                            | SharedInfra | handler rule vs core logging | operational infra                    | DEFER             | —       |
| UI `json.utils`, `styled.utils`, `dateTime.utils` | SharedInfra | cross-domain infra           | SSE + styled consumers               | KEEP; DELETE last | Phase 2 |
| UI `emotion.types.ts`                             | SharedInfra | MUI augmentation             | standard pattern                     | KEEP              | —       |

### DELETE candidates (Phase 2 only)

| Symbol                           | check_references       | Blocked by         |
| -------------------------------- | ---------------------- | ------------------ |
| SharedInfra unreferenced exports | TBD full-repo re-audit | Waves A–D complete |

---

## Defer list (never auto-delete)

| Item                                                  | Reason                                  |
| ----------------------------------------------------- | --------------------------------------- |
| API `rest.types.ts` PostConfig\* `unknown` fields     | Ingress until `parse*` — fix in C3 only |
| Stremio `{ streams: [] }` / `{ metas: [] }` fallbacks | Addon contract                          |
| `debug.utils.ts` / `dlog`                             | Logging infrastructure                  |
| Mirrored room/error constants API↔UI                  | Wire contract sync                      |
| `styled.utils.ts`, `json.utils.ts`                    | UI infrastructure                       |
| `prefetchSyncWorkerProcess.ts` IPC `unknown`          | Narrow at boundary in A3, don't delete  |
| API `xtreme` spelling                                 | Wide blast radius                       |
| UI `z.infer` co-location in validation                | Conventional Zod pairing                |

---

## Phase 0 exit criteria

- [x] `graph_stats` shows both repos indexed
- [x] `CLEANUP_DOMAIN_MAP.md` complete for all 7 domains
- [x] Every seed finding S1–S5 confirmed or updated
- [x] No source files modified
- [ ] User reviewed map (optional) before Phase 1

---

## Recommended wave order

| Wave                                                  | PRs                                                | Priority actions                 |
| ----------------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| **A** RoomPrefetchSSE                                 | A1 placement → A2 dead-code → A3 types → A4 verify | S1, S2, S3, S5                   |
| **B** RestErrors                                      | B1 placement → B2 dead-code → B3 types → B4 verify | S4                               |
| **C** ConfigCRUD                                      | C1–C4                                              | ValidatedPostConfig\* split (C3) |
| **D** AuthSession, HashOps, CatalogAddon, SharedInfra | D1–D4                                              | SharedInfra last                 |
| **E** UI style                                        | optional                                           | design-system placement          |
| **Phase 2**                                           | final unused purge                                 | knip + full-repo auditor         |
