import {
  broadcastConfigsPrefetchStatusForHash,
  broadcastConfigsPrefetchStatusForHashProgress,
  broadcastConfigsPrefetchStatusGlobalQueue,
  clearPrefetchStatusProgressThrottleForHash,
} from "./configsPrefetchStatusSseBroadcaster";
import { broadcastRoomSse } from "./roomSseBroadcaster";

export async function notifyRoomSseSubscribers(hash: string): Promise<void> {
  await broadcastRoomSse(hash);
}

export async function notifyConfigsPrefetchStatusSubscribers(
  hash: string,
  options?: { progress?: boolean },
): Promise<void> {
  if (options?.progress) {
    await broadcastConfigsPrefetchStatusForHashProgress(hash);
  } else {
    clearPrefetchStatusProgressThrottleForHash(hash);
    await broadcastConfigsPrefetchStatusForHash(hash);
  }

  await broadcastConfigsPrefetchStatusGlobalQueue();
}
