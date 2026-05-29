import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { purgePrefetchSyncQueueJob } from "@/core/prefetchSyncQueue";
import {
  broadcastConfigsPrefetchStatusGlobalQueue,
  broadcastConfigsPrefetchStatusHashToUser,
  clearPrefetchStatusProgressThrottleForHash,
  refreshConfigsPrefetchStatusUserHashIndex,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { broadcastRoomSse } from "@/core/roomSseBroadcaster";
import {
  countOtherUsers,
  deleteHashConfigCascadeForLastUser,
  deleteUserHashBridgeRow,
} from "@/database/providerConfig.db";
import {
  cancelQueuedRoom,
  getRoomSummary,
  updateRoomClosedState,
  userHasHashLink,
} from "@/database/room.db";
import type { DeleteConfigResponseBody } from "@/types/rest.types";
import { sendKnownRestError } from "@/utils/restError.utils";

function parseConfigHashParam(raw: unknown): string | null {
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

export async function handleDeleteConfig(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const hash = parseConfigHashParam(req.params.hash);

  if (!hash) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const otherUsers = await countOtherUsers(hash, userId);

  if (otherUsers > 0) {
    await deleteUserHashBridgeRow({ hash, userId });

    await refreshConfigsPrefetchStatusUserHashIndex(userId);
    await broadcastConfigsPrefetchStatusHashToUser(userId, hash);

    const body: DeleteConfigResponseBody = {
      hashRemovedFromServer: false,
      hashUnlinked: true,
    };
    res.status(200).json(body);
    return;
  }

  const prefetchRoom = await getRoomSummary(hash);
  const prefetchRoomStatus = prefetchRoom?.roomStatus;

  if (prefetchRoomStatus === "running" || prefetchRoomStatus === "fetching") {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_SYNC_ALREADY_ACTIVE);
    return;
  }

  const removedWaitingJobs = purgePrefetchSyncQueueJob(hash);

  for (const job of removedWaitingJobs) {
    await updateRoomClosedState({
      closedReason: "config_deleted",
      roomId: job.roomId,
      status: "cancelled",
    });
  }

  await cancelQueuedRoom(hash);

  clearPrefetchStatusProgressThrottleForHash(hash);
  await broadcastRoomSse(hash);
  await refreshConfigsPrefetchStatusUserHashIndex(userId);
  await broadcastConfigsPrefetchStatusHashToUser(userId, hash);
  await broadcastConfigsPrefetchStatusGlobalQueue();

  await deleteHashConfigCascadeForLastUser(hash);

  const body: DeleteConfigResponseBody = {
    hashRemovedFromServer: true,
    hashUnlinked: true,
  };

  res.status(200).json(body);
}
