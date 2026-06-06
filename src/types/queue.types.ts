import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { QUEUE_JOB_SOURCE } from "@/constants/scheduler.constants";
import { MapToUnion } from "./common.types";

export type SyncEnqueueSource = MapToUnion<typeof QUEUE_JOB_SOURCE>;

export type EnqueueSyncJobParams = {
  hash: string;
  triggeredByUserId: string;
  source: SyncEnqueueSource;
};

export type EnqueueSyncJobResult =
  | {
      ok: true;
      estimatedWaitMs: number | null;
      queuePosition: number;
      roomId: number;
    }
  | {
      ok: false;
      code:
        | typeof REST_ERROR_CODES.QUEUE_BACKLOG_EXCEEDED
        | typeof REST_ERROR_CODES.HASH_SYNC_ALREADY_ACTIVE
        | typeof REST_ERROR_CODES.HASH_CONFIG_NOT_FOUND;
    };

export type PrefetchSyncQueueDepth = {
  runningJobCount: number;
  waitingJobCount: number;
};

export type QueueJob = {
  estimatedWaitMs: number | null;
  hash: string;
  queuePosition: number;
  roomId: number;
  source: SyncEnqueueSource;
  triggeredByUserId: string;
};

/** Serializable fields passed to the prefetch sync OS worker process (stdin JSON). */
export type PrefetchSyncWorkerJobPayload = {
  hash: string;
  roomId: number;
  triggeredByUserId: string;
};

export type PrefetchSyncWorkerResultMessage =
  | { type: "prefetch_sync_result"; ok: true; durationMs: number }
  | { type: "prefetch_sync_result"; ok: false; message: string };
