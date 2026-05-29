import { isTerminalRoomStatus } from "@/constants/room.constants";
import { getPrefetchSyncQueueDepth, getWaitingPrefetchJob } from "@/core/prefetchSyncQueueState";
import { listUserConfigRows } from "@/database/providerConfig.db";
import { getRoomSseSnapshot } from "@/database/room.db";
import { hashHasRoomLogLines, listHashesWithRoomLogLines } from "@/database/roomLogStream.db";
import { getSchedulerSnapshot } from "@/database/scheduler.db";
import type {
  ConfigPrefetchStatusEntry,
  GetConfigsPrefetchStatusResponseBody,
} from "@/types/rest.types";

export async function buildConfigsPrefetchStatusEntry(params: {
  hash: string;
  hasLogs?: boolean;
  userId: string;
}): Promise<ConfigPrefetchStatusEntry | null> {
  const snapshot = await getRoomSseSnapshot(params.hash);

  if (!snapshot) {
    return null;
  }

  const scheduler = await getSchedulerSnapshot(params.hash);
  const waiting = getWaitingPrefetchJob(params.hash);
  const hasLogs = params.hasLogs ?? (await hashHasRoomLogLines(params.hash));

  return {
    estimatedWaitMs: waiting?.estimatedWaitMs ?? null,
    hash: params.hash,
    hasLogs,
    isTerminal: isTerminalRoomStatus(snapshot.roomStatus),
    lastSyncedAt: snapshot.lastSyncedAt,
    nextTriggerAt: scheduler?.nextTriggerAt ?? null,
    progress: snapshot.progress,
    queuePosition: waiting?.queuePosition ?? null,
    room: {
      closedReason: snapshot.closedReason,
      id: snapshot.roomId,
      lastOutcome: snapshot.lastOutcome,
      status: snapshot.roomStatus,
      triggeredBy: snapshot.triggeredBy,
      updatedAt: snapshot.roomUpdatedAt,
    },
    schedulerIntervalMinutes: scheduler?.intervalMinutes ?? null,
    triggeredBy: snapshot.triggeredBy,
    triggeredByMe: snapshot.triggeredBy != null && snapshot.triggeredBy === params.userId,
  };
}

export function buildConfigsPrefetchStatusGlobalQueue(): GetConfigsPrefetchStatusResponseBody["globalQueue"] {
  const depth = getPrefetchSyncQueueDepth();

  return {
    ...depth,
    totalQueueItems: depth.runningJobCount + depth.waitingJobCount,
  };
}

export async function buildConfigsPrefetchStatusBody(
  userId: string,
): Promise<GetConfigsPrefetchStatusResponseBody> {
  const rows = await listUserConfigRows(userId);
  const hashesWithLogs = await listHashesWithRoomLogLines(rows.map((row) => row.hash));
  const byHash: Record<string, ConfigPrefetchStatusEntry> = {};

  for (const row of rows) {
    const entry = await buildConfigsPrefetchStatusEntry({
      hash: row.hash,
      hasLogs: hashesWithLogs.has(row.hash),
      userId,
    });

    if (entry) {
      byHash[row.hash] = entry;
    }
  }

  return {
    byHash,
    globalQueue: buildConfigsPrefetchStatusGlobalQueue(),
  };
}
