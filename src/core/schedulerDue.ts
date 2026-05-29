import { SCHEDULER_TRIGGER_USER_ID } from "@/constants/room.constants";
import { SCHEDULER_DUE_POLL_MS } from "@/constants/scheduler.constants";
import { listSchedulerRowsDueNow } from "@/database/scheduler.db";
import { logInfo } from "@/utils/debug.utils";

import { enqueueSyncJob } from "./prefetchSyncQueue";

let schedulerTickBusy = false;

/**
 * Loads due `scheduler` rows and enqueues prefetch jobs (no inline network fetch).
 * Used by `startSchedulerDueLoop` and callable for a single poll when needed.
 */
export async function executeSchedulerDuePoll(): Promise<void> {
  const dueRows = await listSchedulerRowsDueNow();

  if (dueRows.length === 0) {
    return;
  }

  logInfo("scheduler", `Enqueuing ${dueRows.length} due prefetch job(s)`);

  for (const row of dueRows) {
    const result = await enqueueSyncJob({
      hash: row.hashId,
      source: "scheduler-due",
      triggeredByUserId: SCHEDULER_TRIGGER_USER_ID,
    });

    if (!result.ok) {
      logInfo("scheduler", `Skipped due job for hash ${row.hashId}`, result.code);
    }
  }
}

/**
 * Periodically runs `executeSchedulerDuePoll`.
 */
export function startSchedulerDueLoop(): void {
  setInterval(() => {
    if (schedulerTickBusy) {
      return;
    }

    schedulerTickBusy = true;
    void (async (): Promise<void> => {
      try {
        await executeSchedulerDuePoll();
      } finally {
        schedulerTickBusy = false;
      }
    })();
  }, SCHEDULER_DUE_POLL_MS);
}
