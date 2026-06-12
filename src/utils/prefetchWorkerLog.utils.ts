import type { RoomLogTone, RoomSyncProgress } from "@/types/room.types";
import type {
  PrefetchSectorLogEmitter,
  PrefetchSectorLogInput,
} from "@/types/prefetchWorker.types";

import {
  computeSectorBytePercent,
  createThrottledPrefetchProgressReporter,
  createThrottledPrefetchSectorLogReporter,
} from "@/utils/syncProgress.utils";

const throttledStdoutProgress = createThrottledPrefetchProgressReporter((progress) => {
  process.stdout.write(
    `${JSON.stringify({
      bytesRead: progress.bytesRead,
      bytesTotal: progress.bytesTotal,
      percent: progress.percent,
      phase: progress.phase,
      type: "prefetch_progress_line",
    })}\n`,
  );
});

function writePrefetchWorkerSectorLogLineRaw(payload: PrefetchSectorLogInput): void {
  const tone = payload.tone ?? "default";

  process.stdout.write(
    `${JSON.stringify({
      bytesRead: payload.bytesRead,
      bytesTotal: payload.bytesTotal,
      kind: "sector",
      line: payload.line,
      logKey: payload.logKey,
      sector: payload.sector,
      sectorPercent: payload.sectorPercent,
      status: payload.status,
      tone,
      type: "prefetch_log_line",
    })}\n`,
  );
}

/**
 * Child prefetch worker only: emit one JSON progress line on stdout; the parent persists + broadcasts.
 */
export function writePrefetchWorkerProgressLine(progress: RoomSyncProgress): void {
  throttledStdoutProgress(progress);
}

/**
 * Child prefetch worker only: emit one plain text JSON log line on stdout.
 */
export function writePrefetchWorkerLogLine(line: string, tone: RoomLogTone = "default"): void {
  process.stdout.write(
    `${JSON.stringify({
      kind: "text",
      line,
      tone,
      type: "prefetch_log_line",
    })}\n`,
  );
}

/**
 * Child prefetch worker only: emit one structured sector log line (no throttle — use emitter helpers).
 */
export function writePrefetchWorkerSectorLogLine(payload: PrefetchSectorLogInput): void {
  writePrefetchWorkerSectorLogLineRaw(payload);
}

/**
 * Throttled sector log emitter for one prefetch worker run (stdout JSON lines).
 */
export function createPrefetchSectorLogEmitter(): PrefetchSectorLogEmitter {
  const throttled = createThrottledPrefetchSectorLogReporter(writePrefetchWorkerSectorLogLineRaw);

  const buildInProgress = (params: {
    bytesRead?: number;
    bytesTotal?: number | null;
    line: string;
    logKey: string;
    sector: string;
  }): PrefetchSectorLogInput => {
    const bytesRead = params.bytesRead ?? 0;
    const sectorPercent = computeSectorBytePercent({
      bytesRead,
      bytesTotal: params.bytesTotal,
      status: "in_progress",
    });

    return {
      bytesRead,
      bytesTotal: params.bytesTotal ?? null,
      line: params.line,
      logKey: params.logKey,
      sector: params.sector,
      sectorPercent,
      status: "in_progress",
      tone: "default",
    };
  };

  return {
    error: (params) => {
      throttled({
        bytesRead: params.bytesRead,
        bytesTotal: params.bytesTotal ?? null,
        line: params.line,
        logKey: params.logKey,
        sector: params.sector,
        sectorPercent: null,
        status: "error",
        tone: "error",
      });
    },
    inProgress: (params) => {
      throttled(buildInProgress(params));
    },
    success: (params) => {
      const bytesRead = params.bytesRead ?? 0;

      throttled({
        bytesRead,
        bytesTotal: params.bytesTotal ?? null,
        line: params.line,
        logKey: params.logKey,
        sector: params.sector,
        sectorPercent: 100,
        status: "success",
        tone: "success",
      });
    },
  };
}
