import type { Request, Response } from "express";
import _isBoolean from "lodash/isBoolean";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { QUEUE_JOB_SOURCE } from "@/constants/queue.constants";
import { ACTIVE_SYNC_ROOM_STATUSES } from "@/constants/room.constants";
import {
  cancelQueuedPrefetchJob,
  enqueueSyncJob,
  requestCancelRunningPrefetch,
} from "@/core/prefetchSyncQueue";
import {
  broadcastConfigsPrefetchStatusForHash,
  broadcastConfigsPrefetchStatusGlobalQueue,
  clearPrefetchStatusProgressThrottleForHash,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { broadcastRoomSse } from "@/core/roomSseBroadcaster";
import { updateUserHashIsActive } from "@/database/providerConfig.db";
import {
  cancelQueuedRoom,
  getRoomSummary,
  getRoomSseSnapshot,
  userHasHashLink,
} from "@/database/room.db";
import type {
  PatchHashActiveResponseBody,
  PostHashCancelResponseBody,
  PostHashRefetchResponseBody,
} from "@/types/rest.types";
import { sendKnownRestError } from "@/utils/restError.utils";

const activeSyncRoomStatuses = new Set<string>(ACTIVE_SYNC_ROOM_STATUSES);

function parseHashPathParam(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * POST `/api/hashes/:hash/refetch` — enqueue prefetch if none is active for this hash (same queue as new-config / scheduler).
 */
export async function handlePostHashRefetch(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const hash = parseHashPathParam(req.params.hash);

  if (!hash) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const enqueueResult = await enqueueSyncJob({
    hash,
    source: QUEUE_JOB_SOURCE.MANUAL_REFETCH,
    triggeredByUserId: userId,
  });

  if (!enqueueResult.ok) {
    sendKnownRestError(res, enqueueResult.code);
    return;
  }

  const roomSummary = await getRoomSummary(hash);
  const body: PostHashRefetchResponseBody = {
    estimatedWaitMs: enqueueResult.estimatedWaitMs,
    queuePosition: enqueueResult.queuePosition,
    roomId: enqueueResult.roomId,
    roomStatus: roomSummary?.roomStatus ?? null,
    syncEnqueued: true,
  };

  res.status(200).json(body);
}

/**
 * POST `/api/hashes/:hash/cancel` — cancel queued job or signal a running worker; only the `room.triggered_by` user may cancel.
 */
export async function handlePostHashCancel(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const hash = parseHashPathParam(req.params.hash);

  if (!hash) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const snapshot = await getRoomSseSnapshot(hash);

  if (!snapshot) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_CONFIG_NOT_FOUND);
    return;
  }

  const roomStatus = snapshot.roomStatus;

  if (roomStatus == null || !activeSyncRoomStatuses.has(roomStatus)) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NO_ACTIVE_SYNC_TO_CANCEL);
    return;
  }

  if (snapshot.triggeredBy !== userId) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_CANCEL_NOT_AUTHORIZED);
    return;
  }

  if (roomStatus === "queued") {
    const removedFromFifo = await cancelQueuedPrefetchJob(hash);

    if (!removedFromFifo) {
      await cancelQueuedRoom(hash, "user_cancelled");
      await broadcastRoomSse(hash);

      clearPrefetchStatusProgressThrottleForHash(hash);
      await broadcastConfigsPrefetchStatusForHash(hash);
      await broadcastConfigsPrefetchStatusGlobalQueue();
    }

    const body: PostHashCancelResponseBody = { cancelled: true, kind: "queued" };
    res.status(200).json(body);
    return;
  }

  const roomId = snapshot.roomId;

  if (roomId == null) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NO_ACTIVE_SYNC_TO_CANCEL);
    return;
  }

  await requestCancelRunningPrefetch({ hash, roomId });
  await broadcastRoomSse(hash);

  clearPrefetchStatusProgressThrottleForHash(hash);
  await broadcastConfigsPrefetchStatusForHash(hash);
  await broadcastConfigsPrefetchStatusGlobalQueue();

  const body: PostHashCancelResponseBody = { cancelled: true, kind: "running" };
  res.status(200).json(body);
}

/**
 * PATCH `/api/hashes/:hash/active` — set `user_hash.is_active` for the caller.
 */
export async function handlePatchHashActive(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const hash = parseHashPathParam(req.params.hash);

  if (!hash) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const raw = (req.body as { isActive?: unknown }).isActive;

  if (!_isBoolean(raw)) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  await updateUserHashIsActive({ hash, isActive: raw, userId });

  const body: PatchHashActiveResponseBody = { hash, isActive: raw };
  res.status(200).json(body);
}
