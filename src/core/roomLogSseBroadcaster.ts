import type { Response } from "express";

import { isTerminalRoomStatus } from "@/constants/room.constants";
import { getRoomSseSnapshot } from "@/database/room.db";
import { listRoomLogStreamLinesAfter } from "@/database/roomLogStream.db";
import type { RoomLogSsePayload, RoomSyncProgress } from "@/types/room.types";
import { roomLogSsePayloadFromRow } from "@/utils/syncProgress.utils";

const hashToLogClients = new Map<string, Set<Response>>();

function writeLogSseEvent(res: Response, sequence: number, data: RoomLogSsePayload): boolean {
  try {
    if (res.writableEnded) {
      return false;
    }

    const payload = JSON.stringify(data);

    res.write(`id: ${String(sequence)}\nevent: log\ndata: ${payload}\n\n`);

    return true;
  } catch {
    return false;
  }
}

function writeProgressSseEvent(res: Response, sequence: number, data: RoomSyncProgress): boolean {
  try {
    if (res.writableEnded) {
      return false;
    }

    const payload = JSON.stringify(data);

    res.write(`id: ${String(sequence)}\nevent: progress\ndata: ${payload}\n\n`);

    return true;
  } catch {
    return false;
  }
}

/**
 * Replay persisted lines after `Last-Event-ID` (or full tail when `afterSeq === 0`).
 */
export async function sendRoomLogSseReplayToResponse(
  hash: string,
  res: Response,
  afterSeq: number,
): Promise<void> {
  const rows = await listRoomLogStreamLinesAfter(hash, afterSeq);

  for (const row of rows) {
    writeLogSseEvent(res, row.seq, roomLogSsePayloadFromRow(row));
  }
}

/**
 * Send last known sync progress when the room is still active (connect / replay).
 */
export async function sendRoomLogSseProgressReplayToResponse(
  hash: string,
  res: Response,
): Promise<void> {
  const snapshot = await getRoomSseSnapshot(hash);

  if (!snapshot || snapshot.progress == null) {
    return;
  }

  if (isTerminalRoomStatus(snapshot.roomStatus)) {
    return;
  }

  writeProgressSseEvent(res, 0, snapshot.progress);
}

/**
 * Push one log line to every open **`/logs/stream`** subscriber for the hash.
 */
export function broadcastRoomLogSse(hash: string, payload: RoomLogSsePayload): void {
  const clients = hashToLogClients.get(hash);

  if (!clients || clients.size === 0) {
    return;
  }

  for (const clientRes of Array.from(clients)) {
    if (clientRes.writableEnded) {
      clients.delete(clientRes);
      continue;
    }

    writeLogSseEvent(clientRes, payload.seq, payload);
  }

  if (clients.size === 0) {
    hashToLogClients.delete(hash);
  }
}

/**
 * Push sync progress to every open **`/logs/stream`** subscriber for the hash.
 */
export function broadcastRoomLogSseProgress(hash: string, progress: RoomSyncProgress): void {
  const clients = hashToLogClients.get(hash);

  if (!clients || clients.size === 0) {
    return;
  }

  for (const clientRes of Array.from(clients)) {
    if (clientRes.writableEnded) {
      clients.delete(clientRes);
      continue;
    }

    writeProgressSseEvent(clientRes, 0, progress);
  }

  if (clients.size === 0) {
    hashToLogClients.delete(hash);
  }
}

/**
 * Open **`/logs/stream`** subscriber count for one hash (all tabs / users on that hash).
 */
export function getLogStreamSubscriberCount(hash: string): number {
  return hashToLogClients.get(hash)?.size ?? 0;
}

/**
 * Tell log SSE clients to clear their in-memory buffer before a new prefetch run.
 * Uses fixed `id: 0` — not a deduped log line.
 */
export function broadcastRoomLogReset(hash: string): void {
  const clients = hashToLogClients.get(hash);

  if (!clients || clients.size === 0) {
    return;
  }

  const payload = JSON.stringify({ hash });

  for (const clientRes of Array.from(clients)) {
    if (clientRes.writableEnded) {
      clients.delete(clientRes);
      continue;
    }

    try {
      clientRes.write(`id: 0\nevent: log_reset\ndata: ${payload}\n\n`);
    } catch {
      clients.delete(clientRes);
    }
  }

  if (clients.size === 0) {
    hashToLogClients.delete(hash);
  }
}

/**
 * Register a long-lived log Server-Sent Events response; returns unsubscribe.
 */
export function registerRoomLogSseClient(hash: string, res: Response): () => void {
  let set = hashToLogClients.get(hash);

  if (!set) {
    set = new Set<Response>();
    hashToLogClients.set(hash, set);
  }

  set.add(res);

  return () => {
    const bucket = hashToLogClients.get(hash);

    if (!bucket) {
      return;
    }

    bucket.delete(res);

    if (bucket.size === 0) {
      hashToLogClients.delete(hash);
    }
  };
}
