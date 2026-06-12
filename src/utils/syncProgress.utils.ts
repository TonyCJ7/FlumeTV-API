import { ROOM_LOG_TONES } from "@/constants/room.constants";
import type {
  RoomLogKind,
  RoomLogSectorStatus,
  RoomLogSsePayload,
  RoomLogStreamSqlRow,
  RoomLogTone,
  RoomSyncProgress,
  RoomSyncProgressSqlColumns,
} from "@/types/room.types";
import type { PrefetchSectorLogInput } from "@/types/prefetchWorker.types";

export function roomSyncProgressFromRow(row: RoomSyncProgressSqlColumns): RoomSyncProgress | null {
  if (row.sync_percent == null) {
    return null;
  }

  const progress: RoomSyncProgress = {
    percent: row.sync_percent,
  };

  if (row.sync_phase != null && row.sync_phase.length > 0) {
    progress.phase = row.sync_phase;
  }

  if (row.sync_bytes_read != null) {
    progress.bytesRead = row.sync_bytes_read;
  }

  if (row.sync_bytes_total !== undefined) {
    progress.bytesTotal = row.sync_bytes_total;
  }

  return progress;
}

function isRoomLogTone(value: string): value is RoomLogTone {
  return (ROOM_LOG_TONES as readonly string[]).includes(value);
}

function roomLogKindFromRow(value: string): RoomLogKind {
  if (value === "sector") {
    return "sector";
  }

  return "text";
}

function roomLogSectorStatusFromRow(value: string | null): RoomLogSectorStatus | undefined {
  if (value == null || value.length === 0) {
    return undefined;
  }

  if (value === "pending" || value === "in_progress" || value === "success" || value === "error") {
    return value;
  }

  return undefined;
}

/** Maps legacy worker `level` to `tone` when `tone` is absent on stdout lines. */
export function roomLogToneFromLegacyLevel(level: string | null | undefined): RoomLogTone {
  switch (level) {
    case "success":
      return "success";
    case "warn":
      return "warning";
    case "error":
      return "error";
    case "info":
    default:
      return "default";
  }
}

export function roomLogSsePayloadFromRow(row: RoomLogStreamSqlRow): RoomLogSsePayload {
  const tone = isRoomLogTone(row.tone) ? row.tone : roomLogToneFromLegacyLevel(row.level);
  const kind = roomLogKindFromRow(row.kind);
  const payload: RoomLogSsePayload = {
    line: row.line,
    seq: row.seq,
    tone,
  };

  if (kind !== "text") {
    payload.kind = kind;
  }

  if (row.log_key != null && row.log_key.length > 0) {
    payload.logKey = row.log_key;
  }

  if (row.sector != null && row.sector.length > 0) {
    payload.sector = row.sector;
  }

  const status = roomLogSectorStatusFromRow(row.status);

  if (status != null) {
    payload.status = status;
  }

  if (row.bytes_read != null) {
    payload.bytesRead = row.bytes_read;
  }

  if (row.bytes_total !== undefined) {
    payload.bytesTotal = row.bytes_total;
  }

  if (row.sector_percent !== undefined) {
    payload.sectorPercent = row.sector_percent;
  }

  return payload;
}

/**
 * 0–99 while `in_progress` when `bytesTotal` is known; 100 on `success`; null when indeterminate.
 */
export function computeSectorBytePercent(params: {
  bytesRead: number;
  bytesTotal: number | null | undefined;
  status: RoomLogSectorStatus;
}): number | null {
  const { bytesRead, bytesTotal, status } = params;

  if (status === "success") {
    return 100;
  }

  if (status === "error" || status === "pending") {
    return null;
  }

  if (bytesTotal != null && bytesTotal > 0 && Number.isFinite(bytesTotal)) {
    return Math.min(99, Math.floor((100 * bytesRead) / bytesTotal));
  }

  return null;
}

const DEFAULT_SYNC_PROGRESS_MIN_INTERVAL_MS = 500;

function syncProgressMinIntervalMs(): number {
  const parsed = parseInt(process.env.SYNC_PROGRESS_MIN_INTERVAL_MS || "", 10);

  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return DEFAULT_SYNC_PROGRESS_MIN_INTERVAL_MS;
}

export function getSyncProgressMinIntervalMs(): number {
  return syncProgressMinIntervalMs();
}

function sectorProgressMinIntervalMs(): number {
  const parsed = parseInt(process.env.LOG_SECTOR_PROGRESS_MIN_INTERVAL_MS || "", 10);

  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return syncProgressMinIntervalMs();
}

/** In-flight cap: one point below the slice end (e.g. 5–80 → max 79 until the step completes). */
export function sliceInFlightCapPercent(phaseStart: number, phaseWeight: number): number {
  return Math.max(phaseStart, phaseStart + phaseWeight - 1);
}

/**
 * Budget milliseconds for a slice from the overall job estimate (`phaseWeight` is 0–100).
 */
export function estimatedPhaseMsFromJobEstimate(
  jobEstimateMs: number,
  phaseWeight: number,
): number {
  const weight = Math.max(1, Math.min(100, phaseWeight));

  return Math.max(1000, Math.round(jobEstimateMs * (weight / 100)));
}

/**
 * Overall percent within a phase slice using byte ratio when `bytesTotal` is known.
 */
export function computeByteSlicePercent(params: {
  bytesRead: number;
  bytesTotal: number | null | undefined;
  phaseStart: number;
  phaseWeight: number;
}): number {
  const { bytesRead, bytesTotal, phaseStart, phaseWeight } = params;

  if (bytesTotal != null && bytesTotal > 0 && Number.isFinite(bytesTotal)) {
    const ratio = Math.min(1, Math.max(0, bytesRead / bytesTotal));
    const raw = Math.floor(phaseStart + phaseWeight * ratio);
    const cap = sliceInFlightCapPercent(phaseStart, phaseWeight);

    return Math.min(cap, raw);
  }

  return phaseStart;
}

/**
 * When `Content-Length` is unknown: creep toward the slice cap from elapsed time vs historical avg.
 */
export function computeTimeSlicePercent(params: {
  elapsedMs: number;
  estimatedPhaseMs: number;
  phaseStart: number;
  phaseWeight: number;
}): number {
  const { elapsedMs, estimatedPhaseMs, phaseStart, phaseWeight } = params;
  const cap = sliceInFlightCapPercent(phaseStart, phaseWeight);
  const budgetMs = Math.max(1000, estimatedPhaseMs);
  const ratio = Math.min(1, Math.max(0, elapsedMs / budgetMs));
  const raw = Math.floor(phaseStart + phaseWeight * ratio);

  return Math.min(cap, Math.max(phaseStart, raw));
}

/**
 * Byte ratio when total size is known; otherwise time-based estimate from `fetch_timing` avg.
 */
export function computeHybridSlicePercent(params: {
  bytesRead: number;
  bytesTotal: number | null | undefined;
  elapsedMs: number;
  estimatedPhaseMs: number;
  phaseStart: number;
  phaseWeight: number;
}): number {
  const { bytesTotal, elapsedMs, estimatedPhaseMs, phaseStart, phaseWeight, bytesRead } = params;

  if (bytesTotal != null && bytesTotal > 0 && Number.isFinite(bytesTotal)) {
    return computeByteSlicePercent({ bytesRead, bytesTotal, phaseStart, phaseWeight });
  }

  return computeTimeSlicePercent({ elapsedMs, estimatedPhaseMs, phaseStart, phaseWeight });
}

/**
 * Clamps to 0–100 and never decreases `percent` within one prefetch run.
 */
export function createMonotonicPrefetchProgressReporter(
  emit: (progress: RoomSyncProgress) => void,
): (progress: RoomSyncProgress) => void {
  let maxPercent = 0;

  return (progress) => {
    const next = Math.min(100, Math.max(0, Math.floor(progress.percent)));

    if (next < maxPercent) {
      return;
    }

    maxPercent = next;
    emit({ ...progress, percent: next });
  };
}

/**
 * Throttles progress emissions (worker stdout or main-process handlers).
 */
export function createThrottledPrefetchProgressReporter(
  emit: (progress: RoomSyncProgress) => void,
): (progress: RoomSyncProgress) => void {
  const monotonic = createMonotonicPrefetchProgressReporter(emit);
  const minIntervalMs = syncProgressMinIntervalMs();
  let lastEmitMs = 0;
  let lastPercent = -1;

  return (progress) => {
    const percent = Math.min(100, Math.max(0, Math.floor(progress.percent)));
    const now = Date.now();
    const percentDelta = percent - lastPercent;
    const intervalElapsed = now - lastEmitMs >= minIntervalMs;

    if (percent < 100 && percentDelta < 1 && !intervalElapsed && lastPercent >= 0) {
      return;
    }

    lastPercent = percent;
    lastEmitMs = now;
    monotonic(progress);
  };
}

/**
 * Throttles sector `in_progress` emissions; `success` / `error` emit immediately.
 * Keeps `sectorPercent` monotonic per `logKey` during `in_progress`.
 */
export function createThrottledPrefetchSectorLogReporter(
  emit: (payload: PrefetchSectorLogInput) => void,
): (payload: PrefetchSectorLogInput) => void {
  const minIntervalMs = sectorProgressMinIntervalMs();
  const maxPercentByLogKey = new Map<string, number>();
  let lastEmitMs = 0;
  let lastLogKey = "";

  return (payload) => {
    if (payload.status === "success" || payload.status === "error") {
      maxPercentByLogKey.delete(payload.logKey);
      emit(payload);
      return;
    }

    if (payload.status !== "in_progress") {
      emit(payload);
      return;
    }

    let sectorPercent = payload.sectorPercent;

    if (sectorPercent != null) {
      const prev = maxPercentByLogKey.get(payload.logKey) ?? -1;

      if (sectorPercent < prev) {
        sectorPercent = prev;
      } else {
        maxPercentByLogKey.set(payload.logKey, sectorPercent);
      }
    }

    const now = Date.now();
    const sameKey = payload.logKey === lastLogKey;
    const intervalElapsed = now - lastEmitMs >= minIntervalMs;

    if (sameKey && !intervalElapsed && lastEmitMs > 0) {
      return;
    }

    lastEmitMs = now;
    lastLogKey = payload.logKey;
    emit({ ...payload, sectorPercent });
  };
}

export function parseHttpContentLength(
  header: string | string[] | number | undefined,
): number | null {
  if (header == null) {
    return null;
  }

  const raw = Array.isArray(header) ? header[0] : String(header);
  const parsed = parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
