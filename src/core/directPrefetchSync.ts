import { getDirectSyncContext, runDirectCatalogReplace } from "@/database/directCatalogSync.db";
import { getSyncDurationEstimateMs } from "@/database/scheduler.db";
import { directFormattedCatalogFactory } from "@/factories/directCatalogSync.factory";
import { fetchDirectM3uPlaylistEntries } from "@/services/directCatalog.services";
import type { M3uParsedEntry } from "@/types/directSync.types";
import type { QueueJob } from "@/types/queue.types";
import { dlog } from "@/utils/debug.utils";
import {
  createPrefetchSectorLogEmitter,
  writePrefetchWorkerLogLine,
  writePrefetchWorkerProgressLine,
} from "@/utils/prefetchWorkerLog.utils";
import { createMonotonicPrefetchProgressReporter } from "@/utils/syncProgress.utils";
import _trim from "lodash/trim";

function directHeuristicTvMovieCounts(items: M3uParsedEntry[]): {
  approxMovies: number;
  approxTv: number;
} {
  const approxMovies = items.filter(
    (i) => /movie/i.test(i.displayTitle) || /\(\d{4}\)/.test(i.displayTitle),
  ).length;

  return { approxMovies, approxTv: items.length - approxMovies };
}

/**
 * Phase A: `fetchDirectM3uPlaylistEntries` (service: axios + parse) → factory.
 * Phase B: single PostgreSQL transaction — replace per-hash catalog, `last_synced_at`, room `idle`.
 */
export async function runDirectPrefetchSyncJob(job: QueueJob): Promise<void> {
  const contextRow = await getDirectSyncContext(job.hash);

  if (!contextRow) {
    dlog("direct sync: no direct_configs for hash", job.hash);
    throw new Error("direct_sync_context_missing");
  }

  const log = writePrefetchWorkerLogLine;
  const sectorLog = createPrefetchSectorLogEmitter();
  const onProgress = createMonotonicPrefetchProgressReporter(writePrefetchWorkerProgressLine);

  log("== DIRECT M3U CATALOG SYNC ==", "info");
  log(`M3U URL: ${_trim(contextRow.m3u_url)}`, "info");

  const hasEpg = contextRow.has_custom_epg;
  const epgUrl = _trim(contextRow.epg_url ?? "");

  if (!hasEpg) {
    log("EPG disabled by user.", "warning");
  } else if (!epgUrl) {
    log("No EPG URL supplied; continuing without EPG.", "warning");
  } else {
    log(
      "EPG URL configured (catalog sync loads M3U only; EPG is used by the addon separately).",
      "info",
    );
  }

  const estimatedSyncMs = await getSyncDurationEstimateMs(job.hash);

  const parsed = await fetchDirectM3uPlaylistEntries(contextRow.m3u_url, {
    estimatedSyncMs,
    log,
    onProgress,
    sectorLog,
  });

  onProgress({ percent: 80, phase: "m3u" });

  const { approxMovies, approxTv } = directHeuristicTvMovieCounts(parsed);

  log(
    `Heuristic: ~${approxTv.toLocaleString()} TV / ~${approxMovies.toLocaleString()} Movie`,
    "default",
  );

  onProgress({ percent: 85, phase: "db" });

  const catalog = directFormattedCatalogFactory(parsed);

  log("Writing catalog to database…", "info");
  onProgress({ percent: 90, phase: "db" });

  const lastSyncedAtIso = new Date().toISOString();

  await runDirectCatalogReplace({
    catalog,
    hash: job.hash,
    lastSyncedAtIso,
    roomId: job.roomId,
  });

  onProgress({ percent: 100, phase: "db" });
  log("✔ Direct M3U catalog sync completed.", "success");
}
