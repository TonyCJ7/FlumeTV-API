import { purgePrefetchSyncQueueJob } from "@/core/prefetchSyncQueue";
import {
  broadcastConfigsPrefetchStatusForHash,
  broadcastConfigsPrefetchStatusGlobalQueue,
  clearPrefetchStatusProgressThrottleForHash,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { broadcastRoomSse } from "@/core/roomSseBroadcaster";
import { deleteHashConfigCascadeForLastUser } from "@/database/providerConfig.db";
import { cancelQueuedRoom, getRoomSummary, updateRoomClosedState } from "@/database/room.db";
import type { RemoveLastUserHashResult } from "@/types/provider.types";

/**
 * Last-user hash removal: sync guard, queue purge, room close, SSE, and config cascade delete.
 */
export async function removeHashConfigForLastUser(hash: string): Promise<RemoveLastUserHashResult> {
  const prefetchRoom = await getRoomSummary(hash);
  const prefetchRoomStatus = prefetchRoom?.roomStatus;

  if (prefetchRoomStatus === "running" || prefetchRoomStatus === "fetching") {
    return { ok: false, reason: "HASH_SYNC_ALREADY_ACTIVE" };
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
  await broadcastConfigsPrefetchStatusForHash(hash);
  await broadcastConfigsPrefetchStatusGlobalQueue();

  await deleteHashConfigCascadeForLastUser(hash);

  return { ok: true };
}
