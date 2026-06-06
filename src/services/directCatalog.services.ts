import { createInterface } from "node:readline";
import { Readable } from "node:stream";

import _trim from "lodash/trim";

import { DIRECT_M3U_TIMEOUT_MS, SYNC_FETCH_MS_FALLBACK } from "@/constants/scheduler.constants";
import { outboundAxios } from "@/services/outboundAxios.config";
import type { M3uParsedEntry } from "@/types/directSync.types";
import type { RoomSyncProgress } from "@/types/room.types";
import { dlog, logError } from "@/utils/debug.utils";
import { isProbablyM3uStreamUrlLine, parseM3uExtinfLine } from "@/utils/m3uPlaylist.utils";
import type { PrefetchSectorLogEmitter, PrefetchSyncLogFn } from "@/types/prefetchWorker.types";
import {
  computeHybridSlicePercent,
  estimatedPhaseMsFromJobEstimate,
  parseHttpContentLength,
} from "@/utils/syncProgress.utils";

const DIRECT_M3U_BYTE_PHASE_START = 5;
const DIRECT_M3U_BYTE_PHASE_WEIGHT = 75;

/**
 * Consumes the M3U body while the HTTP response stream is active (same operation as `axios.get`).
 * Line-by-line — no full-playlist string buffer. Uses **`utils`** for per-line pure parse helpers.
 */
async function parseM3uEntriesFromReadable(body: Readable): Promise<M3uParsedEntry[]> {
  const entries: M3uParsedEntry[] = [];
  const rl = createInterface({ crlfDelay: Infinity, input: body });
  let pendingExtinf: string | null = null;

  for await (const rawLine of rl) {
    const line = _trim(rawLine);

    if (!line) {
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      pendingExtinf = line;
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    if (!pendingExtinf) {
      continue;
    }

    if (!isProbablyM3uStreamUrlLine(line)) {
      pendingExtinf = null;
      continue;
    }

    const meta = parseM3uExtinfLine(pendingExtinf);
    entries.push({
      displayTitle: meta.displayTitle,
      groupTitle: meta.groupTitle,
      logo: meta.logo,
      url: _trim(line),
    });
    pendingExtinf = null;
  }

  return entries;
}

/**
 * Outbound GET for a direct IPTV M3U URL: streamed body + line parse at the HTTP boundary.
 * **All axios usage for this flow stays here** — `core` calls this, not the reverse.
 */
export async function fetchDirectM3uPlaylistEntries(
  m3uUrl: string,
  options?: {
    estimatedSyncMs?: number;
    log?: PrefetchSyncLogFn;
    onProgress?: (progress: RoomSyncProgress) => void;
    sectorLog?: PrefetchSectorLogEmitter;
  },
): Promise<M3uParsedEntry[]> {
  const sectorLog = options?.sectorLog;
  const downloadLine = "Streaming playlist (M3U)…";

  try {
    const estimatedSyncMs = options?.estimatedSyncMs ?? SYNC_FETCH_MS_FALLBACK;
    const estimatedM3uPhaseMs = estimatedPhaseMsFromJobEstimate(
      estimatedSyncMs,
      DIRECT_M3U_BYTE_PHASE_WEIGHT,
    );
    const m3uPhaseStartedAt = Date.now();

    options?.onProgress?.({ percent: 0, phase: "m3u" });

    sectorLog?.inProgress({
      bytesRead: 0,
      bytesTotal: null,
      line: downloadLine,
      logKey: "m3u:download",
      sector: "m3u",
    });

    let lastBytesRead = 0;
    let lastBytesTotal: number | null = null;

    const response = await outboundAxios.get(m3uUrl, {
      onDownloadProgress: (event) => {
        const bytesRead = event.loaded;
        const contentLength = parseHttpContentLength(event.total);
        lastBytesRead = bytesRead;
        lastBytesTotal = contentLength;
        const elapsedMs = Date.now() - m3uPhaseStartedAt;
        const percent = computeHybridSlicePercent({
          bytesRead,
          bytesTotal: contentLength,
          elapsedMs,
          estimatedPhaseMs: estimatedM3uPhaseMs,
          phaseStart: DIRECT_M3U_BYTE_PHASE_START,
          phaseWeight: DIRECT_M3U_BYTE_PHASE_WEIGHT,
        });

        sectorLog?.inProgress({
          bytesRead,
          bytesTotal: contentLength,
          line: downloadLine,
          logKey: "m3u:download",
          sector: "m3u",
        });

        options?.onProgress?.({
          bytesRead,
          bytesTotal: contentLength,
          percent,
          phase: "m3u",
        });
      },
      responseType: "stream",
      timeout: DIRECT_M3U_TIMEOUT_MS,
      validateStatus: (status) => {
        return status >= 200 && status < 300;
      },
    });

    options?.onProgress?.({ percent: DIRECT_M3U_BYTE_PHASE_START, phase: "m3u" });

    const body = response.data;

    if (!Readable.isReadable(body)) {
      dlog(
        "direct M3U: response body is not a Readable stream (expected with responseType: stream)",
        m3uUrl,
        typeof body,
      );
      throw new Error("direct_m3u_response_not_readable_stream");
    }

    options?.log?.("Parsing playlist…", "default");

    const entries = await parseM3uEntriesFromReadable(body);

    options?.onProgress?.({
      percent: DIRECT_M3U_BYTE_PHASE_START + DIRECT_M3U_BYTE_PHASE_WEIGHT,
      phase: "m3u",
    });

    sectorLog?.success({
      bytesRead: lastBytesRead,
      bytesTotal: lastBytesTotal,
      line: `Playlist parsed: ${entries.length.toLocaleString()} entries`,
      logKey: "m3u:download",
      sector: "m3u",
    });

    return entries;
  } catch (err) {
    const message = err instanceof Error ? err.message : "direct_m3u_unknown_error";
    options?.log?.(`Playlist fetch or parse failed: ${message}`, "error");
    sectorLog?.error({
      line: `Playlist fetch or parse failed: ${message}`,
      logKey: "m3u:download",
      sector: "m3u",
    });
    logError("direct M3U", "fetch or parse failed", m3uUrl, message, err);
    dlog("direct M3U: fetch or parse failed", m3uUrl, err);
    throw err;
  }
}
