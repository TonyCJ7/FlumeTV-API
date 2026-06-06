import _includes from "lodash/includes";

import {
  ACTIVE_SYNC_ROOM_STATUSES,
  ROOM_PROCESS_RESTARTED_LOG_LINE,
  ROOM_CLOSED_REASON_PROCESS_RESTARTED,
} from "@/constants/room.constants";
import { isTerminalRoomStatus } from "@/utils/room.utils";
import {
  deleteOrphanRoomRows,
  finalizeRoomRunSuccess,
  getRoomSseSnapshot,
  listHashesWithLinkedRoomStatus,
  resetRoomToIdle,
  updateRoomClosedState,
} from "@/database/room.db";
import { updateHashConfigLastSyncedAtIfNull } from "@/database/providerConfig.db";
import { appendRoomLogStreamLine, deleteRoomLogLinesForHash } from "@/database/roomLogStream.db";
import { resetLogEventSequence } from "@/database/streamEventResume.db";
import { logInfo } from "@/utils/debug.utils";

import { broadcastRoomLogReset } from "./roomLogSseBroadcaster";
import {
  notifyConfigsPrefetchStatusSubscribers,
  notifyRoomSseSubscribers,
} from "./prefetchSyncSseNotify";

function notifyRoomAndPrefetchStatusSubscribers(hash: string): void {
  void notifyRoomSseSubscribers(hash);
  void notifyConfigsPrefetchStatusSubscribers(hash);
}

/**
 * Parent-process reconcile after a successful worker exit. The worker finalizes room/catalog in its
 * own PostgreSQL connection; if the parent still sees an active sync status, apply the same close here.
 */
export async function reconcilePrefetchRoomSuccessAfterWorker(params: {
  hash: string;
  roomId: number;
}): Promise<void> {
  const snapshot = await getRoomSseSnapshot(params.hash);

  if (!snapshot || snapshot.roomId == null) {
    return;
  }

  const status = snapshot.roomStatus;
  const stillActive = status != null && _includes(ACTIVE_SYNC_ROOM_STATUSES, status);

  if (stillActive) {
    await finalizeRoomRunSuccess(params.roomId);
  }

  await updateHashConfigLastSyncedAtIfNull({
    hash: params.hash,
    lastSyncedAtIso: new Date().toISOString(),
  });
}

/**
 * Wipe persisted log buffer and notify open log SSE clients (does not delete the `room` row).
 * Called when a new prefetch run is enqueued — the only routine log clear path.
 */
export async function preemptRoomLogsForNewRun(hash: string): Promise<void> {
  await deleteRoomLogLinesForHash(hash);
  await resetLogEventSequence(hash);
  broadcastRoomLogReset(hash);
}

/**
 * Reset a linked room from a terminal status to **`idle`** (keeps `closed_reason` when set).
 * Does not touch the log buffer.
 */
export async function resetTerminalRoomToIdleForHash(hash: string): Promise<void> {
  const snapshot = await getRoomSseSnapshot(hash);

  if (!snapshot || snapshot.roomId == null) {
    return;
  }

  if (!isTerminalRoomStatus(snapshot.roomStatus)) {
    return;
  }

  const keepClosedReason = snapshot.closedReason != null && snapshot.closedReason.length > 0;
  await resetRoomToIdle({
    clearClosedReason: !keepClosedReason,
    roomId: snapshot.roomId,
  });
  notifyRoomAndPrefetchStatusSubscribers(hash);
}

/**
 * When the linked room is terminal, reset it to **`idle`** immediately (logs are kept until the next run).
 */
export async function maybeResetTerminalRoomToIdle(hash: string): Promise<void> {
  const snapshot = await getRoomSseSnapshot(hash);

  if (!snapshot || snapshot.roomId == null) {
    return;
  }

  const status = snapshot.roomStatus;

  if (status != null && _includes(ACTIVE_SYNC_ROOM_STATUSES, status)) {
    return;
  }

  if (!isTerminalRoomStatus(status)) {
    return;
  }

  await resetTerminalRoomToIdleForHash(hash);
}

async function failOrphanedActiveRoomsOnStartup(
  linked: { hash: string; roomId: number; roomStatus: string | null }[],
): Promise<number> {
  let failedCount = 0;

  for (const row of linked) {
    if (row.roomStatus == null || !_includes(ACTIVE_SYNC_ROOM_STATUSES, row.roomStatus)) {
      continue;
    }

    await updateRoomClosedState({
      closedReason: ROOM_CLOSED_REASON_PROCESS_RESTARTED,
      roomId: row.roomId,
      status: "failed",
    });
    await appendRoomLogStreamLine({
      hash: row.hash,
      line: ROOM_PROCESS_RESTARTED_LOG_LINE,
      roomId: row.roomId,
      tone: "error",
    });
    notifyRoomAndPrefetchStatusSubscribers(row.hash);
    await maybeResetTerminalRoomToIdle(row.hash);
    failedCount += 1;
  }

  return failedCount;
}

/**
 * After process boot: fail active sync rooms left from a prior process, drop orphan `room` rows,
 * and reset any still-terminal linked rooms to `idle` (logs are preserved).
 */
export async function sweepTerminalRoomsOnStartup(): Promise<void> {
  await deleteOrphanRoomRows();

  const linked = await listHashesWithLinkedRoomStatus();
  const orphanedActiveCount = await failOrphanedActiveRoomsOnStartup(linked);
  let terminalResetCount = 0;

  for (const row of linked) {
    if (isTerminalRoomStatus(row.roomStatus)) {
      terminalResetCount += 1;
      await maybeResetTerminalRoomToIdle(row.hash);
    }
  }

  logInfo("room", "Startup sweep complete", {
    linkedRooms: linked.length,
    orphanedActiveCount,
    terminalResetCount,
  });
}
