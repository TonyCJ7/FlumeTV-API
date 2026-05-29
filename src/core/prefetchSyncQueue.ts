import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import {
  SYNC_FETCH_MS_FALLBACK,
  FETCH_MAX_BACKLOG_MS,
  FETCH_PARALLELISM,
} from "@/constants/scheduler.constants";
import {
  notifyConfigsPrefetchStatusSubscribers,
  notifyRoomSseSubscribers,
} from "@/core/prefetchSyncSseNotify";
import { prefetchSyncQueueState } from "@/core/prefetchSyncQueueState";
import {
  killPrefetchWorker,
  clearThrottledPersistProgressForRoom,
  runPrefetchSyncWorkerProcess,
} from "@/core/prefetchSyncWorkerProcess";
import {
  maybeResetTerminalRoomToIdle,
  preemptRoomLogsForNewRun,
  reconcilePrefetchRoomSuccessAfterWorker,
} from "@/core/roomLifecycle";
import {
  tryQueueRoom,
  updateRoomClosedState,
  updateRoomStatusAndTimestamp,
} from "@/database/room.db";
import {
  getFetchTimingAvgMs,
  insertFetchTimingRow,
  upsertSchedulerAfterSync,
} from "@/database/scheduler.db";
import {
  EnqueueSyncJobParams,
  EnqueueSyncJobResult,
  PrefetchSyncWorkerJobPayload,
  QueueJob,
} from "@/types/queue.types";
import { dlog, logError, logInfo } from "@/utils/debug.utils";
import _trim from "lodash/trim";

export type { PrefetchSyncQueueDepth } from "@/core/prefetchSyncQueueState";
export { getPrefetchSyncQueueDepth, getWaitingPrefetchJob } from "@/core/prefetchSyncQueueState";

/** Set when `killPrefetchWorker` was used so terminal handling marks `cancelled` instead of `failed`. */
const pendingUserCancelHashes = new Set<string>();

function estimateBacklogMs(waitingJobCount: number, avgMs: number): number {
  return Math.ceil(waitingJobCount / FETCH_PARALLELISM) * avgMs;
}

function estimateWaitMsForNewJob(waitingPositionOneBased: number, avgMs: number): number {
  const jobsAhead = waitingPositionOneBased - 1;
  return Math.ceil(jobsAhead / FETCH_PARALLELISM) * avgMs;
}

async function runQueueJob(job: QueueJob): Promise<void> {
  clearThrottledPersistProgressForRoom(job.roomId);
  await updateRoomStatusAndTimestamp({ roomId: job.roomId, status: "running" });
  void notifyRoomSseSubscribers(job.hash);
  void notifyConfigsPrefetchStatusSubscribers(job.hash);
  logInfo("prefetch", `Job started`, { hash: job.hash, roomId: job.roomId, source: job.source });

  try {
    const payload: PrefetchSyncWorkerJobPayload = {
      hash: job.hash,
      roomId: job.roomId,
      triggeredByUserId: job.triggeredByUserId,
    };

    const result = await runPrefetchSyncWorkerProcess(payload);

    if (pendingUserCancelHashes.has(job.hash)) {
      pendingUserCancelHashes.delete(job.hash);

      if (result.ok) {
        await insertFetchTimingRow({ hashId: job.hash, durationMs: result.durationMs });
        await upsertSchedulerAfterSync(job.hash);
        await reconcilePrefetchRoomSuccessAfterWorker({ hash: job.hash, roomId: job.roomId });
      } else {
        await updateRoomClosedState({
          closedReason: "user_cancelled",
          roomId: job.roomId,
          status: "cancelled",
        });
      }
    } else if (result.ok) {
      await insertFetchTimingRow({ hashId: job.hash, durationMs: result.durationMs });
      await upsertSchedulerAfterSync(job.hash);
      await reconcilePrefetchRoomSuccessAfterWorker({ hash: job.hash, roomId: job.roomId });
      logInfo("prefetch", "Job completed", { hash: job.hash, durationMs: result.durationMs });
    } else {
      const trimmed = _trim(result.message);
      const closedReason = trimmed.length > 0 ? trimmed.slice(0, 240) : "prefetch_sync_failed";

      logError("prefetch", "Job failed", job.hash, closedReason);
      await updateRoomClosedState({
        closedReason,
        roomId: job.roomId,
        status: "failed",
      });
    }
  } catch (err) {
    logError("prefetch", "Queue job failed", job.hash, err);
    dlog("queue job failed", job.hash, err);

    if (pendingUserCancelHashes.has(job.hash)) {
      pendingUserCancelHashes.delete(job.hash);
      await updateRoomClosedState({
        closedReason: "user_cancelled",
        roomId: job.roomId,
        status: "cancelled",
      });
    } else {
      const message = err instanceof Error ? err.message : "prefetch_sync_failed";
      const trimmed = _trim(message);
      const closedReason = trimmed.length > 0 ? trimmed.slice(0, 240) : "prefetch_sync_failed";

      await updateRoomClosedState({
        closedReason,
        roomId: job.roomId,
        status: "failed",
      });
    }
  } finally {
    prefetchSyncQueueState.runningCount -= 1;
    void notifyRoomSseSubscribers(job.hash);
    void notifyConfigsPrefetchStatusSubscribers(job.hash);
    await maybeResetTerminalRoomToIdle(job.hash);
    scheduleDrain();
  }
}

function scheduleDrain(): void {
  while (
    prefetchSyncQueueState.runningCount < FETCH_PARALLELISM &&
    prefetchSyncQueueState.fifoQueue.length > 0
  ) {
    const nextJob = prefetchSyncQueueState.fifoQueue.shift();

    if (!nextJob) {
      break;
    }

    prefetchSyncQueueState.runningCount += 1;
    void runQueueJob(nextJob);
  }
}

/**
 * Single entrypoint for prefetch enqueue (new config, scheduler due, future manual refetch).
 */
export async function enqueueSyncJob(params: EnqueueSyncJobParams): Promise<EnqueueSyncJobResult> {
  const avgMsFromDb = await getFetchTimingAvgMs();
  const avgMsForBacklog =
    avgMsFromDb != null && avgMsFromDb > 0 ? avgMsFromDb : SYNC_FETCH_MS_FALLBACK;
  const nextWaitingTotal = prefetchSyncQueueState.fifoQueue.length + 1;
  const backlogMs = estimateBacklogMs(nextWaitingTotal, avgMsForBacklog);

  if (backlogMs > FETCH_MAX_BACKLOG_MS) {
    return { code: REST_ERROR_CODES.QUEUE_BACKLOG_EXCEEDED, ok: false };
  }

  const roomOutcome = await tryQueueRoom({
    hash: params.hash,
    triggeredByUserId: params.triggeredByUserId,
  });

  if (!roomOutcome.ok) {
    if (roomOutcome.reason === "ACTIVE_SYNC_IN_PROGRESS") {
      return { code: REST_ERROR_CODES.HASH_SYNC_ALREADY_ACTIVE, ok: false };
    }

    dlog("enqueueSyncJob: hash_config missing for hash", params.hash);
    return { code: REST_ERROR_CODES.HASH_CONFIG_NOT_FOUND, ok: false };
  }

  const queuePosition = prefetchSyncQueueState.fifoQueue.length + 1;
  const estimatedWaitMs =
    avgMsFromDb != null && avgMsFromDb > 0
      ? estimateWaitMsForNewJob(queuePosition, avgMsFromDb)
      : null;

  prefetchSyncQueueState.fifoQueue.push({
    estimatedWaitMs,
    hash: params.hash,
    queuePosition,
    roomId: roomOutcome.roomId,
    source: params.source,
    triggeredByUserId: params.triggeredByUserId,
  });

  logInfo("prefetch", "Job enqueued", {
    hash: params.hash,
    queuePosition,
    source: params.source,
  });

  clearThrottledPersistProgressForRoom(roomOutcome.roomId);
  await preemptRoomLogsForNewRun(params.hash);
  scheduleDrain();
  void notifyRoomSseSubscribers(params.hash);
  void notifyConfigsPrefetchStatusSubscribers(params.hash);

  return {
    estimatedWaitMs,
    ok: true,
    queuePosition,
    roomId: roomOutcome.roomId,
  };
}

export function purgePrefetchSyncQueueJob(hash: string): QueueJob[] {
  const removed: QueueJob[] = [];
  const kept: QueueJob[] = [];
  const { fifoQueue } = prefetchSyncQueueState;

  for (const job of fifoQueue) {
    if (job.hash === hash) {
      removed.push(job);
    } else {
      kept.push(job);
    }
  }

  fifoQueue.length = 0;
  fifoQueue.push(...kept);

  let position = 1;

  for (const job of fifoQueue) {
    job.queuePosition = position;
    position += 1;
  }

  return removed;
}

/**
 * Cancels a **queued** (not yet running) job: removes it from the FIFO and marks the room cancelled.
 * Returns whether a waiting job was removed.
 */
export async function cancelQueuedPrefetchJob(hash: string): Promise<boolean> {
  const removed = purgePrefetchSyncQueueJob(hash);

  for (const job of removed) {
    await updateRoomClosedState({
      closedReason: "user_cancelled",
      roomId: job.roomId,
      status: "cancelled",
    });
  }

  if (removed.length > 0) {
    void notifyRoomSseSubscribers(hash);
    void notifyConfigsPrefetchStatusSubscribers(hash);
    await maybeResetTerminalRoomToIdle(hash);
  }

  return removed.length > 0;
}

/**
 * If a worker is running for `hash`, send SIGTERM and mark pending cancel for terminal state.
 * When no worker is tracked (orphaned `running` room), closes the room in PostgreSQL as cancelled.
 */
export async function requestCancelRunningPrefetch(params: {
  hash: string;
  roomId: number;
}): Promise<boolean> {
  const killed = killPrefetchWorker(params.hash);

  if (killed) {
    pendingUserCancelHashes.add(params.hash);
    return true;
  }

  await updateRoomClosedState({
    closedReason: "user_cancelled",
    roomId: params.roomId,
    status: "cancelled",
  });
  void notifyRoomSseSubscribers(params.hash);
  void notifyConfigsPrefetchStatusSubscribers(params.hash);
  await maybeResetTerminalRoomToIdle(params.hash);

  return true;
}
