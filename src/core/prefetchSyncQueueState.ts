import type { PrefetchSyncQueueDepth, QueueJob } from "@/types/queue.types";

export const prefetchSyncQueueState = {
  fifoQueue: [] as QueueJob[],
  runningCount: 0,
};

export function getPrefetchSyncQueueDepth(): PrefetchSyncQueueDepth {
  return {
    runningJobCount: prefetchSyncQueueState.runningCount,
    waitingJobCount: prefetchSyncQueueState.fifoQueue.length,
  };
}

/**
 * Waiting-slot snapshot for `hash` if it is still in the FIFO (not yet picked up by `scheduleDrain`).
 */
export function getWaitingPrefetchJob(hash: string): {
  estimatedWaitMs: number | null;
  queuePosition: number;
} | null {
  for (const job of prefetchSyncQueueState.fifoQueue) {
    if (job.hash === hash) {
      return { estimatedWaitMs: job.estimatedWaitMs, queuePosition: job.queuePosition };
    }
  }

  return null;
}
