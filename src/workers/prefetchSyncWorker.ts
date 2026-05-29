import "dotenv/config";
import { stdin } from "node:process";

import { runDirectPrefetchSyncJob } from "@/core/directPrefetchSync";
import { runXtreamPrefetchSyncJob } from "@/core/xtreamPrefetchSync";
import { QUEUE_JOB_SOURCE } from "@/constants/queue.constants";
import { CONFIG_TYPE } from "@/constants/stream.constants";
import { getConfigType } from "@/database/common.db";
import type { PrefetchSyncWorkerJobPayload, QueueJob } from "@/types/queue.types";
import { dlog, logError } from "@/utils/debug.utils";

process.env.PREFETCH_SYNC_WORKER = "1";

async function readStdinUtf8(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

function trimFailureMessage(message: string): string {
  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return "prefetch_sync_failed";
  }

  return trimmed.length > 240 ? trimmed.slice(0, 240) : trimmed;
}

/**
 * Child-process entry only. `PREFETCH_SYNC_WORKER` selects a smaller PG pool (see `pgPool.utils`).
 * When spawned by the API, env is inherited from the parent; `dotenv/config` fills gaps for standalone runs.
 * Writes one JSON line to stdout: `{ type: "prefetch_sync_result", ... }`.
 */
async function main(): Promise<void> {
  const raw = await readStdinUtf8();

  if (raw.length === 0) {
    process.stdout.write(
      `${JSON.stringify({
        message: "prefetch_worker_empty_stdin",
        ok: false,
        type: "prefetch_sync_result",
      })}\n`,
    );
    process.exit(1);
  }

  let payload: PrefetchSyncWorkerJobPayload;

  try {
    payload = JSON.parse(raw) as PrefetchSyncWorkerJobPayload;
  } catch (err) {
    logError("prefetch worker", "bad stdin json", err);
    dlog("prefetch worker: bad stdin json", err);
    process.stdout.write(
      `${JSON.stringify({
        message: "prefetch_worker_invalid_stdin_json",
        ok: false,
        type: "prefetch_sync_result",
      })}\n`,
    );
    process.exit(1);
  }

  const job: QueueJob = {
    estimatedWaitMs: null,
    hash: payload.hash,
    queuePosition: 0,
    roomId: payload.roomId,
    source: QUEUE_JOB_SOURCE.SCHEDULER_DUE,
    triggeredByUserId: payload.triggeredByUserId,
  };

  const startedAt = Date.now();

  try {
    const configType = await getConfigType(job.hash);

    if (configType === CONFIG_TYPE.XTREME) {
      await runXtreamPrefetchSyncJob(job);
    } else {
      await runDirectPrefetchSyncJob(job);
    }

    const durationMs = Math.max(1, Date.now() - startedAt);

    process.stdout.write(
      `${JSON.stringify({
        durationMs,
        ok: true,
        type: "prefetch_sync_result",
      })}\n`,
    );
    process.exit(0);
  } catch (err) {
    logError("prefetch worker", "Job failed", job.hash, err);
    dlog("prefetch worker job failed", job.hash, err);
    const message = err instanceof Error ? err.message : "prefetch_sync_failed";

    process.stdout.write(
      `${JSON.stringify({
        message: trimFailureMessage(message),
        ok: false,
        type: "prefetch_sync_result",
      })}\n`,
    );
    process.exit(1);
  }
}

void main();
