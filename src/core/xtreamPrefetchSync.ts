import { getSyncDurationEstimateMs } from "@/database/scheduler.db";
import { getXtreamSyncContext, runXtreamCatalogReplace } from "@/database/xtreamCatalogSync.db";
import { fetchXtreamCatalogForSync } from "@/services/xtreamCatalog.services";
import type { QueueJob } from "@/types/queue.types";
import { decryptPanelPasswordStored } from "@/utils/crypto.utils";
import { dlog } from "@/utils/debug.utils";
import {
  createPrefetchSectorLogEmitter,
  writePrefetchWorkerLogLine,
  writePrefetchWorkerProgressLine,
} from "@/utils/prefetchWorkerLog.utils";
import { createMonotonicPrefetchProgressReporter } from "@/utils/syncProgress.utils";
import _trim from "lodash/trim";

/**
 * Phase A: HTTP + normalization (see `fetchXtreamCatalogForSync`).
 * Phase B: single PostgreSQL transaction — replace per-hash catalog, `last_synced_at`, room `idle`.
 */
export async function runXtreamPrefetchSyncJob(job: QueueJob): Promise<void> {
  const contextRow = await getXtreamSyncContext(job.hash);

  if (!contextRow) {
    dlog("xtream sync: no xtream_configs row for hash", job.hash);
    throw new Error("xtream_sync_context_missing");
  }

  const log = writePrefetchWorkerLogLine;
  const sectorLog = createPrefetchSectorLogEmitter();
  const onProgress = createMonotonicPrefetchProgressReporter(writePrefetchWorkerProgressLine);

  log("== XTREAM CATALOG SYNC ==", "info");
  log(`Panel URL: ${_trim(contextRow.url)}`, "info");

  const passwordPlain = decryptPanelPasswordStored(contextRow.password_enc);

  const estimatedSyncMs = await getSyncDurationEstimateMs(job.hash);

  const catalog = await fetchXtreamCatalogForSync({
    estimatedSyncMs,
    log,
    onProgress,
    panelBaseUrl: contextRow.url,
    password: passwordPlain,
    sectorLog,
    username: contextRow.username,
  });

  log("Writing catalog to database…", "info");
  onProgress({ percent: 90, phase: "db" });

  const lastSyncedAtIso = new Date().toISOString();

  await runXtreamCatalogReplace({
    catalog,
    hash: job.hash,
    lastSyncedAtIso,
    roomId: job.roomId,
  });

  onProgress({ percent: 100, phase: "db" });
  log("✔ Xtream catalog sync completed.", "success");
}
