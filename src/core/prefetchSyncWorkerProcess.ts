import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";

import _includes from "lodash/includes";

import { ACTIVE_SYNC_ROOM_STATUSES } from "@/constants/room.constants";
import { notifyRoomSseSubscribers } from "@/core/prefetchSyncSseNotify";
import { broadcastConfigsPrefetchStatusForHashProgress } from "@/core/configsPrefetchStatusSseBroadcaster";
import { broadcastRoomLogSse, broadcastRoomLogSseProgress } from "@/core/roomLogSseBroadcaster";
import { appendRoomLogStreamLine } from "@/database/roomLogStream.db";
import { getRoomSseSnapshot, updateRoomProgress } from "@/database/room.db";
import type {
  RoomLogKind,
  RoomLogSectorStatus,
  RoomLogSsePayload,
  RoomLogTone,
  RoomSyncProgress,
} from "@/types/room.types";
import { logError } from "@/utils/debug.utils";
import { isJsonObject } from "@/utils/json.utils";
import type { JsonObject } from "@/types/json.types";
import {
  createThrottledPrefetchProgressReporter,
  roomLogToneFromLegacyLevel,
} from "@/utils/syncProgress.utils";
import type {
  PrefetchSyncWorkerJobPayload,
  PrefetchSyncWorkerResultMessage,
} from "@/types/queue.types";

const runningChildrenByHash = new Map<string, ChildProcess>();

function parsePrefetchProgressLine(obj: JsonObject): RoomSyncProgress | null {
  const percentRaw = obj.percent;

  if (typeof percentRaw !== "number" || !Number.isFinite(percentRaw)) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, Math.floor(percentRaw)));
  const progress: RoomSyncProgress = { percent };

  if (typeof obj.phase === "string" && obj.phase.length > 0) {
    progress.phase = obj.phase;
  }

  if (typeof obj.bytesRead === "number" && Number.isFinite(obj.bytesRead)) {
    progress.bytesRead = obj.bytesRead;
  }

  if (obj.bytesTotal === null) {
    progress.bytesTotal = null;
  } else if (typeof obj.bytesTotal === "number" && Number.isFinite(obj.bytesTotal)) {
    progress.bytesTotal = obj.bytesTotal;
  }

  return progress;
}

function parseRoomLogTone(obj: JsonObject): RoomLogTone {
  if (typeof obj.tone === "string") {
    const tone = obj.tone;

    if (
      tone === "default" ||
      tone === "error" ||
      tone === "warning" ||
      tone === "success" ||
      tone === "info"
    ) {
      return tone;
    }
  }

  const level = typeof obj.level === "string" ? obj.level : undefined;

  return roomLogToneFromLegacyLevel(level);
}

function parseRoomLogKind(obj: JsonObject): RoomLogKind {
  if (obj.kind === "sector") {
    return "sector";
  }

  return "text";
}

function parseRoomLogSectorStatus(value: unknown): RoomLogSectorStatus | undefined {
  if (value === "pending" || value === "in_progress" || value === "success" || value === "error") {
    return value;
  }

  return undefined;
}

function parsePrefetchLogLinePayload(obj: JsonObject): Omit<RoomLogSsePayload, "seq"> {
  const tone = parseRoomLogTone(obj);
  const kind = parseRoomLogKind(obj);
  const line = typeof obj.line === "string" ? obj.line : "";
  const payload: Omit<RoomLogSsePayload, "seq"> = {
    line,
    tone,
  };

  if (kind !== "text") {
    payload.kind = kind;
  }

  if (typeof obj.logKey === "string" && obj.logKey.length > 0) {
    payload.logKey = obj.logKey;
  }

  if (typeof obj.sector === "string" && obj.sector.length > 0) {
    payload.sector = obj.sector;
  }

  const status = parseRoomLogSectorStatus(obj.status);

  if (status != null) {
    payload.status = status;
  }

  if (typeof obj.bytesRead === "number" && Number.isFinite(obj.bytesRead)) {
    payload.bytesRead = obj.bytesRead;
  }

  if (obj.bytesTotal === null) {
    payload.bytesTotal = null;
  } else if (typeof obj.bytesTotal === "number" && Number.isFinite(obj.bytesTotal)) {
    payload.bytesTotal = obj.bytesTotal;
  }

  if (obj.sectorPercent === null) {
    payload.sectorPercent = null;
  } else if (typeof obj.sectorPercent === "number" && Number.isFinite(obj.sectorPercent)) {
    payload.sectorPercent = obj.sectorPercent;
  }

  return payload;
}

const logPersistChainByHash = new Map<string, Promise<void>>();

function enqueuePersistAndBroadcastPrefetchLogLine(
  payload: PrefetchSyncWorkerJobPayload,
  logPayload: Omit<RoomLogSsePayload, "seq">,
): void {
  const hash = payload.hash;
  const previous = logPersistChainByHash.get(hash) ?? Promise.resolve();
  const next = previous
    .then(() => persistAndBroadcastPrefetchLogLine(payload, logPayload))
    .catch((err: unknown) => {
      logError("prefetch", "persist log line failed", hash, err);
    });

  logPersistChainByHash.set(hash, next);

  void next.finally(() => {
    if (logPersistChainByHash.get(hash) === next) {
      logPersistChainByHash.delete(hash);
    }
  });
}

async function persistAndBroadcastPrefetchLogLine(
  payload: PrefetchSyncWorkerJobPayload,
  logPayload: Omit<RoomLogSsePayload, "seq">,
): Promise<void> {
  const seq = await appendRoomLogStreamLine({
    bytesRead: logPayload.bytesRead ?? null,
    bytesTotal: logPayload.bytesTotal ?? null,
    hash: payload.hash,
    kind: logPayload.kind ?? "text",
    line: logPayload.line,
    logKey: logPayload.logKey ?? null,
    roomId: payload.roomId,
    sector: logPayload.sector ?? null,
    sectorPercent: logPayload.sectorPercent ?? null,
    status: logPayload.status ?? null,
    tone: logPayload.tone,
  });

  broadcastRoomLogSse(payload.hash, { ...logPayload, seq });
}

async function roomAcceptsPrefetchProgress(hash: string): Promise<boolean> {
  const snapshot = await getRoomSseSnapshot(hash);

  if (!snapshot || snapshot.roomStatus == null) {
    return false;
  }

  return _includes(ACTIVE_SYNC_ROOM_STATUSES, snapshot.roomStatus);
}

async function persistAndBroadcastPrefetchProgress(
  payload: PrefetchSyncWorkerJobPayload,
  progress: RoomSyncProgress,
): Promise<void> {
  const acceptsProgress = await roomAcceptsPrefetchProgress(payload.hash);

  if (acceptsProgress) {
    await updateRoomProgress({
      bytesRead: progress.bytesRead ?? null,
      bytesTotal: progress.bytesTotal ?? null,
      percent: progress.percent,
      phase: progress.phase ?? null,
      roomId: payload.roomId,
    });

    void notifyRoomSseSubscribers(payload.hash);
    void broadcastConfigsPrefetchStatusForHashProgress(payload.hash);
  }

  // Log dialog reads progress from `/logs/stream` — deliver even after room returns to idle
  // (e.g. worker emits 100% after catalog replace clears sync_percent).
  broadcastRoomLogSseProgress(payload.hash, progress);
}

const throttledPersistProgressByRoomId = new Map<
  number,
  ReturnType<typeof createThrottledPrefetchProgressReporter>
>();

export function clearThrottledPersistProgressForRoom(roomId: number): void {
  throttledPersistProgressByRoomId.delete(roomId);
}

function throttledPersistProgress(
  payload: PrefetchSyncWorkerJobPayload,
  progress: RoomSyncProgress,
): void {
  let reporter = throttledPersistProgressByRoomId.get(payload.roomId);

  if (!reporter) {
    reporter = createThrottledPrefetchProgressReporter((next) => {
      void persistAndBroadcastPrefetchProgress(payload, next).catch((err: unknown) => {
        logError("prefetch", "persist progress failed", payload.hash, err);
      });
    });
    throttledPersistProgressByRoomId.set(payload.roomId, reporter);
  }

  reporter(progress);
}

/**
 * Sends SIGTERM to the prefetch worker child for this hash, if one is running.
 * Used for cooperative cancel; the queue treats the exit as cancel when flagged.
 */
export function killPrefetchWorker(hash: string): boolean {
  const child = runningChildrenByHash.get(hash);

  if (!child) {
    return false;
  }

  child.kill("SIGTERM");
  return true;
}

/** Sends SIGTERM to every tracked prefetch worker child (process shutdown). */
export function killAllPrefetchWorkers(): void {
  for (const child of runningChildrenByHash.values()) {
    child.kill("SIGTERM");
  }

  runningChildrenByHash.clear();
}

/**
 * Resolves how to run `prefetchSyncWorker`:
 * - **Production** (`NODE_ENV === 'production'`): `node dist/workers/prefetchSyncWorker.js` (after `npm run build`).
 * - **Development**: `node --import tsx <repo>/src/workers/prefetchSyncWorker.ts` (no runtime transpile heap in prod).
 * - **Override**: `PREFETCH_WORKER_SCRIPT` → run `node <that file>` (absolute or cwd-relative).
 */
function resolveWorkerSpawn(): { execPath: string; scriptArgs: string[] } {
  const cwd = process.cwd();

  if (process.env.PREFETCH_WORKER_SCRIPT && process.env.PREFETCH_WORKER_SCRIPT.length > 0) {
    return { execPath: process.execPath, scriptArgs: [process.env.PREFETCH_WORKER_SCRIPT] };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      execPath: process.execPath,
      scriptArgs: [path.join(cwd, "dist/workers/prefetchSyncWorker.js")],
    };
  }

  return {
    execPath: process.execPath,
    scriptArgs: ["--import", "tsx", path.join(cwd, "src/workers/prefetchSyncWorker.ts")],
  };
}

function parsePrefetchWorkerNodeOptions(): string[] {
  const raw = process.env.PREFETCH_WORKER_NODE_OPTIONS;

  if (!raw || raw.trim().length === 0) {
    return [];
  }

  return raw
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

function parseWorkerStdoutJsonLine(trimmed: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (isJsonObject(parsed)) {
      return parsed;
    }
  } catch {
    // ignore non-JSON lines
  }

  return null;
}

function isPrefetchSyncWorkerResultMessage(
  obj: JsonObject,
): obj is PrefetchSyncWorkerResultMessage {
  if (obj.type !== "prefetch_sync_result" || typeof obj.ok !== "boolean") {
    return false;
  }

  if (obj.ok) {
    return typeof obj.durationMs === "number" && Number.isFinite(obj.durationMs);
  }

  return typeof obj.message === "string";
}

function parseWorkerStdoutForResult(stdout: string): PrefetchSyncWorkerResultMessage | null {
  const lines = stdout.split("\n");

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();

    if (!line) {
      continue;
    }

    const obj = parseWorkerStdoutJsonLine(line);

    if (obj && isPrefetchSyncWorkerResultMessage(obj)) {
      return obj;
    }
  }

  return null;
}

function handleWorkerStdoutLine(
  payload: PrefetchSyncWorkerJobPayload,
  trimmed: string,
): PrefetchSyncWorkerResultMessage | null {
  const obj = parseWorkerStdoutJsonLine(trimmed);

  if (!obj || typeof obj.type !== "string") {
    return null;
  }

  if (obj.type === "prefetch_progress_line") {
    const progress = parsePrefetchProgressLine(obj);

    if (progress) {
      throttledPersistProgress(payload, progress);
    }

    return null;
  }

  if (obj.type === "prefetch_log_line" && typeof obj.line === "string") {
    const logPayload = parsePrefetchLogLinePayload(obj);
    enqueuePersistAndBroadcastPrefetchLogLine(payload, logPayload);

    return null;
  }

  if (isPrefetchSyncWorkerResultMessage(obj)) {
    return obj;
  }

  return null;
}

/**
 * Spawns an OS child process, passes the job on stdin (one JSON line), and awaits a structured
 * `prefetch_sync_result` line on stdout (last matching line wins). Interleaved `prefetch_log_line`
 * JSON lines are persisted and broadcast to **`/logs/stream`** subscribers.
 */
export async function runPrefetchSyncWorkerProcess(
  payload: PrefetchSyncWorkerJobPayload,
): Promise<PrefetchSyncWorkerResultMessage> {
  const { execPath, scriptArgs } = resolveWorkerSpawn();
  const nodeOpts = parsePrefetchWorkerNodeOptions();
  const argv = [...nodeOpts, ...scriptArgs];

  return await new Promise<PrefetchSyncWorkerResultMessage>((resolve, reject) => {
    const child = spawn(execPath, argv, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    runningChildrenByHash.set(payload.hash, child);
    child.on("close", () => {
      runningChildrenByHash.delete(payload.hash);
      throttledPersistProgressByRoomId.delete(payload.roomId);
    });

    let stdoutTail = "";
    let stderr = "";
    let lastResult: PrefetchSyncWorkerResultMessage | null = null;

    const stdout = child.stdout;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const stdin = child.stdin;

    if (!stdin) {
      reject(new Error("prefetch_worker_stdin_missing"));
      return;
    }

    if (!stdout) {
      reject(new Error("prefetch_worker_stdout_missing"));
      return;
    }

    stdout.setEncoding("utf8");

    const rl = createInterface({ crlfDelay: Infinity, input: stdout });

    rl.on("line", (line) => {
      const trimmed = line.trim();

      stdoutTail = `${stdoutTail}${line}\n`;

      if (stdoutTail.length > 65536) {
        stdoutTail = stdoutTail.slice(-65536);
      }

      if (trimmed.length === 0) {
        return;
      }

      const asResult = handleWorkerStdoutLine(payload, trimmed);

      if (asResult) {
        lastResult = asResult;
      }
    });

    stdin.write(`${JSON.stringify(payload)}\n`);
    stdin.end();

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      void rl.close();

      if (lastResult) {
        resolve(lastResult);
        return;
      }

      const parsed = parseWorkerStdoutForResult(stdoutTail);

      if (parsed) {
        resolve(parsed);
        return;
      }

      const stderrTail = stderr.trim().slice(-500);
      const hint = stderrTail.length > 0 ? stderrTail : `exit_code=${code ?? "unknown"}`;

      resolve({
        message: `prefetch_worker_no_result:${hint}`,
        ok: false,
        type: "prefetch_sync_result",
      });
    });
  });
}
