import type { Response } from "express";

import {
  buildConfigsPrefetchStatusBody,
  buildConfigsPrefetchStatusEntry,
  buildConfigsPrefetchStatusGlobalQueue,
} from "@/core/configsPrefetchStatusSnapshot";
import { listUserConfigRows } from "@/database/providerConfig.db";
import { userHasHashLink } from "@/database/room.db";
import type {
  ConfigPrefetchStatusEntry,
  GetConfigsPrefetchStatusResponseBody,
} from "@/types/rest.types";
import { getSyncProgressMinIntervalMs } from "@/utils/syncProgress.utils";

type PrefetchStatusSseEventName = "snapshot" | "hash" | "global_queue";

type PrefetchStatusHashSseData = {
  entry: ConfigPrefetchStatusEntry | null;
  hash: string;
};

type PrefetchStatusGlobalQueueSseData = Pick<GetConfigsPrefetchStatusResponseBody, "globalQueue">;

type PrefetchStatusSsePayload =
  | GetConfigsPrefetchStatusResponseBody
  | PrefetchStatusHashSseData
  | PrefetchStatusGlobalQueueSseData;

const userIdToClients = new Map<string, Set<Response>>();
const hashToSubscribedUserIds = new Map<string, Set<string>>();
const sequenceByUserId = new Map<string, number>();
const lastProgressBroadcastMsByHash = new Map<string, number>();

function allocatePrefetchStatusSequence(userId: string): number {
  const next = (sequenceByUserId.get(userId) ?? 0) + 1;
  sequenceByUserId.set(userId, next);

  return next;
}

function writePrefetchStatusSseEvent(
  res: Response,
  sequence: number,
  event: PrefetchStatusSseEventName,
  data: PrefetchStatusSsePayload,
): boolean {
  try {
    if (res.writableEnded) {
      return false;
    }

    const payload = typeof data === "string" ? data : JSON.stringify(data);
    res.write(`id: ${String(sequence)}\nevent: ${event}\ndata: ${payload}\n\n`);

    return true;
  } catch {
    return false;
  }
}

async function writeEventToUserClients(
  userId: string,
  event: PrefetchStatusSseEventName,
  data: PrefetchStatusSsePayload,
): Promise<void> {
  const clients = userIdToClients.get(userId);

  if (!clients || clients.size === 0) {
    return;
  }

  const sequence = allocatePrefetchStatusSequence(userId);

  for (const res of Array.from(clients)) {
    if (res.writableEnded) {
      clients.delete(res);
      continue;
    }

    writePrefetchStatusSseEvent(res, sequence, event, data);
  }

  if (clients.size === 0) {
    userIdToClients.delete(userId);
  }
}

async function indexUserHashesForSubscribe(userId: string): Promise<void> {
  const rows = await listUserConfigRows(userId);

  for (const row of rows) {
    let set = hashToSubscribedUserIds.get(row.hash);

    if (!set) {
      set = new Set<string>();
      hashToSubscribedUserIds.set(row.hash, set);
    }

    set.add(userId);
  }
}

async function unindexUserHashesForSubscribe(userId: string): Promise<void> {
  const rows = await listUserConfigRows(userId);

  for (const row of rows) {
    const set = hashToSubscribedUserIds.get(row.hash);

    if (!set) {
      continue;
    }

    set.delete(userId);

    if (set.size === 0) {
      hashToSubscribedUserIds.delete(row.hash);
    }
  }
}

async function prefetchStatusEntryForUser(params: {
  hash: string;
  userId: string;
}): Promise<ConfigPrefetchStatusEntry | null> {
  if (!(await userHasHashLink(params))) {
    return null;
  }

  return buildConfigsPrefetchStatusEntry(params);
}

export function clearPrefetchStatusProgressThrottleForHash(hash: string): void {
  lastProgressBroadcastMsByHash.delete(hash);
}

/**
 * Full snapshot for one subscriber (connect or reconnect).
 */
export async function sendConfigsPrefetchStatusSnapshotToResponse(
  userId: string,
  res: Response,
): Promise<void> {
  const body = await buildConfigsPrefetchStatusBody(userId);
  const sequence = allocatePrefetchStatusSequence(userId);
  writePrefetchStatusSseEvent(res, sequence, "snapshot", body);
}

/**
 * Register a long-lived prefetch-status SSE response; returns unsubscribe.
 */
export async function registerConfigsPrefetchStatusSseClient(
  userId: string,
  res: Response,
): Promise<() => void> {
  let set = userIdToClients.get(userId);

  if (!set) {
    set = new Set<Response>();
    userIdToClients.set(userId, set);
  }

  set.add(res);
  await indexUserHashesForSubscribe(userId);

  return () => {
    const bucket = userIdToClients.get(userId);

    if (!bucket) {
      return;
    }

    bucket.delete(res);

    if (bucket.size === 0) {
      userIdToClients.delete(userId);
      void unindexUserHashesForSubscribe(userId);

      if (userIdToClients.size === 0) {
        sequenceByUserId.clear();
      }
    }
  };
}

/**
 * Push one hash update to every subscribed user linked to `hash` (not throttled).
 */
export async function broadcastConfigsPrefetchStatusForHash(hash: string): Promise<void> {
  const userIds = hashToSubscribedUserIds.get(hash);

  if (!userIds || userIds.size === 0) {
    return;
  }

  for (const userId of Array.from(userIds)) {
    if (!userIdToClients.has(userId)) {
      userIds.delete(userId);
      continue;
    }

    const entry = await prefetchStatusEntryForUser({ hash, userId });
    await writeEventToUserClients(userId, "hash", { entry, hash });
  }

  if (userIds.size === 0) {
    hashToSubscribedUserIds.delete(hash);
  }
}

/**
 * Progress-only updates — coalesce at {@link getSyncProgressMinIntervalMs} per hash.
 */
export async function broadcastConfigsPrefetchStatusForHashProgress(hash: string): Promise<void> {
  const userIds = hashToSubscribedUserIds.get(hash);

  if (!userIds || userIds.size === 0) {
    return;
  }

  const minIntervalMs = getSyncProgressMinIntervalMs();
  const now = Date.now();
  const last = lastProgressBroadcastMsByHash.get(hash) ?? 0;

  if (now - last < minIntervalMs) {
    return;
  }

  lastProgressBroadcastMsByHash.set(hash, now);
  await broadcastConfigsPrefetchStatusForHash(hash);
}

/**
 * Push global queue depth to every connected prefetch-status subscriber.
 */
export async function broadcastConfigsPrefetchStatusGlobalQueue(): Promise<void> {
  if (userIdToClients.size === 0) {
    return;
  }

  const globalQueue = buildConfigsPrefetchStatusGlobalQueue();
  const payload: Pick<GetConfigsPrefetchStatusResponseBody, "globalQueue"> = { globalQueue };

  for (const userId of Array.from(userIdToClients.keys())) {
    await writeEventToUserClients(userId, "global_queue", payload);
  }
}

/**
 * Notify one user that a hash entry changed (e.g. config unlinked) without fan-out to other users.
 */
export async function broadcastConfigsPrefetchStatusHashToUser(
  userId: string,
  hash: string,
): Promise<void> {
  if (!userIdToClients.has(userId)) {
    return;
  }

  const entry = await prefetchStatusEntryForUser({ hash, userId });
  await writeEventToUserClients(userId, "hash", { entry, hash });
}

/**
 * Refresh reverse index after config list changes while SSE stays open (PUT/DELETE unlink).
 */
export async function refreshConfigsPrefetchStatusUserHashIndex(userId: string): Promise<void> {
  if (!userIdToClients.has(userId)) {
    return;
  }

  await unindexUserHashesForSubscribe(userId);
  await indexUserHashesForSubscribe(userId);
}
