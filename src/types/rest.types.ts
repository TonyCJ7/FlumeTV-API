import { REST_ERROR_DEFINITIONS } from "@/constants/errorCodes.constants";
import type { RoomLastOutcome, RoomSyncProgress } from "@/types/room.types";
import type { SchedulerSnapshot } from "@/types/scheduler.types";

export type { RoomLastOutcome, RoomSyncProgress } from "@/types/room.types";

/* eslint-disable @typescript-eslint/no-namespace -- Express `Request` augmentation */
export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export type RestErrorCode = keyof typeof REST_ERROR_DEFINITIONS;

/** Raw JSON for `POST /api/configs` when `type` is `"xtream"` (fields validated at runtime). */
export type PostConfigXtreamRequestBody = {
  type: "xtream";
  configName?: unknown;
  customEpg?: unknown;
  epgOffset?: unknown;
  epgUrl?: unknown;
  hasCustomEpg?: unknown;
  panelPassword?: unknown;
  panelUrl?: unknown;
  panelUsername?: unknown;
};

/** Raw JSON for `POST /api/configs` when `type` is `"direct"`. */
export type PostConfigDirectRequestBody = {
  type: "direct";
  configName?: unknown;
  epgOffset?: unknown;
  epgUrl?: unknown;
  hasCustomEpg?: unknown;
  m3uUrl?: unknown;
};

export type PostConfigRequestBody = PostConfigXtreamRequestBody | PostConfigDirectRequestBody;

/** Parsed `POST`/`PUT /api/configs` body after field coercion (no `unknown`). */
export type ValidatedPostConfigXtream = {
  type: "xtream";
  configName: string;
  customEpg: string | null;
  epgOffset: number;
  epgUrl: string | null;
  hasCustomEpg: boolean;
  panelPassword: string;
  panelUrl: string;
  panelUsername: string;
};

/** Parsed direct config body after field coercion (no `unknown`). */
export type ValidatedPostConfigDirect = {
  type: "direct";
  configName: string;
  epgOffset: number;
  epgUrl: string | null;
  hasCustomEpg: boolean;
  m3uUrl: string;
};

export type ValidatedPostConfigRequestBody = ValidatedPostConfigXtream | ValidatedPostConfigDirect;

export type ConfigListSchedulerSnapshot = SchedulerSnapshot;

export type ConfigListItemXtream = {
  configName: string;
  customEpg: string | null;
  epgOffset: number;
  epgUrl: string | null;
  hash: string;
  hasCustomEpg: boolean;
  isActive: boolean;
  isRoomActive: boolean;
  lastSyncedAt: string | null;
  panelUrl: string;
  panelUsername: string;
  progress: RoomSyncProgress | null;
  roomId: number | null;
  roomLastOutcome: RoomLastOutcome | null;
  roomStatus: string | null;
  scheduler: ConfigListSchedulerSnapshot | null;
  triggeredBy: string | null;
  triggeredByMe: boolean;
  type: "xtream";
};

export type ConfigListItemDirect = {
  configName: string;
  epgOffset: number;
  epgUrl: string | null;
  hash: string;
  hasCustomEpg: boolean;
  isActive: boolean;
  isRoomActive: boolean;
  lastSyncedAt: string | null;
  m3uUrl: string;
  progress: RoomSyncProgress | null;
  roomId: number | null;
  roomLastOutcome: RoomLastOutcome | null;
  roomStatus: string | null;
  scheduler: ConfigListSchedulerSnapshot | null;
  triggeredBy: string | null;
  triggeredByMe: boolean;
  type: "direct";
};

export type GetConfigsResponseBody = {
  configs: Array<ConfigListItemDirect | ConfigListItemXtream>;
};

/** `DELETE /api/configs/:hash` — unlink only vs full server delete (last user). */
export type DeleteConfigResponseBody = {
  hashRemovedFromServer: boolean;
  hashUnlinked: boolean;
};

/**
 * `PUT /api/configs/:hash` — same body as `POST /api/configs` (includes **`configName`**).
 * Same computed hash + same stored name → `{ unchanged: true }`.
 * Same hash + new **`configName`** → `{ unchanged: false, configNameUpdated: true }` only (no enqueue).
 * Otherwise old hash is unlinked (or removed server-side for last user), then user is linked to the new hash.
 */
export type PutConfigResponseBody =
  | {
      hash: string;
      unchanged: true;
    }
  | {
      configNameUpdated: true;
      hash: string;
      unchanged: false;
    }
  | {
      created: boolean;
      enqueueErrorCode: string | null;
      estimatedWaitMs: number | null;
      hash: string;
      hashRemovedFromServer: boolean;
      linkStatus: "created" | "linked-existing";
      oldHashUnlinked: true;
      queuePosition: number | null;
      roomId: number | null;
      roomStatus: string | null;
      syncEnqueued: boolean;
      unchanged: false;
    };

/** POST `/api/hashes/:hash/refetch` */
export type PostHashRefetchResponseBody = {
  estimatedWaitMs: number | null;
  queuePosition: number;
  roomId: number;
  roomStatus: string | null;
  syncEnqueued: true;
};

/** POST `/api/hashes/:hash/cancel` */
export type PostHashCancelResponseBody =
  | { cancelled: true; kind: "queued" }
  | { cancelled: true; kind: "running" };

/** Raw JSON for `PATCH /api/hashes/:hash/active`. */
export type PatchHashActiveIngressBody = {
  isActive?: unknown;
};

/** Parsed PATCH hash-active body after field coercion (no `unknown`). */
export type ValidatedPatchHashActiveBody = {
  isActive: boolean;
};

/** PATCH `/api/hashes/:hash/active` */
export type PatchHashActiveResponseBody = {
  hash: string;
  isActive: boolean;
};

/** POST `/api/auth/register`, POST `/api/auth/login`, GET `/api/auth/me` — success body */
export type AuthUserResponseBody = {
  userId: string;
};

/** Raw JSON for `POST /api/auth/register`. */
export type PostRegisterRequestBody = {
  password?: unknown;
};

/** Parsed register body after field coercion (no `unknown`). */
export type ValidatedPostRegisterRequestBody = {
  password: string;
};

/** Raw JSON for `POST /api/auth/login`. */
export type PostLoginRequestBody = {
  password?: unknown;
  userId?: unknown;
};

/** Parsed login body after field coercion (no `unknown`). */
export type ValidatedPostLoginRequestBody = {
  password: string;
  userId: string;
};

/** Raw JSON for `POST /api/auth/change-password`. */
export type PostChangePasswordRequestBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

/** Parsed change-password body after field coercion (no `unknown`). */
export type ValidatedPostChangePasswordRequestBody = {
  currentPassword: string;
  newPassword: string;
};

export type PostChangePasswordResponseBody = {
  ok: true;
};

/** POST `/api/auth/logout` */
export type PostLogoutResponseBody = {
  ok: true;
};

/** GET `/api/stremio/manifest-url` */
export type GetStremioManifestUrlResponseBody = {
  manifestUrl: string;
  stremioWebInstallUrl: string;
};

/** GET `/api/configs/prefetch-status` — room/scheduler/progress snapshot per hash (poll-friendly). */
export type ConfigPrefetchStatusEntry = {
  estimatedWaitMs: number | null;
  hash: string;
  /** True when `room_log_line` has persisted lines for this hash (last run log buffer). */
  hasLogs: boolean;
  isTerminal: boolean;
  lastSyncedAt: string | null;
  nextTriggerAt: string | null;
  progress: RoomSyncProgress | null;
  queuePosition: number | null;
  room: {
    closedReason: string | null;
    id: number | null;
    lastOutcome: RoomLastOutcome | null;
    status: string | null;
    triggeredBy: string | null;
    updatedAt: string | null;
  };
  schedulerIntervalMinutes: number | null;
  triggeredBy: string | null;
  triggeredByMe: boolean;
};

/** GET `/api/configs/prefetch-status` — `byHash` keys are config hash strings (same set as GET `/api/configs`). */
export type GetConfigsPrefetchStatusResponseBody = {
  byHash: Record<string, ConfigPrefetchStatusEntry>;
  globalQueue: {
    runningJobCount: number;
    totalQueueItems: number;
    waitingJobCount: number;
  };
};
