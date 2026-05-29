import type { Response } from "express";

import { getPrefetchSyncQueueDepth } from "@/core/prefetchSyncQueueState";
import { isTerminalRoomStatus } from "@/constants/room.constants";
import { getSchedulerSnapshot } from "@/database/scheduler.db";
import { allocateEventSequence } from "@/database/streamEventResume.db";
import { getRoomSseSnapshot } from "@/database/room.db";

type RoomSseEventName = "log" | "progress" | "queue" | "status";

type RoomSseMessage = {
  data: Record<string, unknown>;
  event: RoomSseEventName;
};

const hashToClients = new Map<string, Set<Response>>();

async function buildRoomSseMessages(hash: string): Promise<RoomSseMessage[]> {
  const snapshot = await getRoomSseSnapshot(hash);
  const queueDepth = getPrefetchSyncQueueDepth();
  const scheduler = await getSchedulerSnapshot(hash);

  if (!snapshot) {
    return [
      {
        data: {
          global: queueDepth,
          hash,
          room: null,
        },
        event: "queue",
      },
      {
        data: {
          hash,
          isTerminal: false,
          lastSyncedAt: null,
          nextTriggerAt: scheduler?.nextTriggerAt ?? null,
          room: null,
          schedulerIntervalMinutes: scheduler?.intervalMinutes ?? null,
        },
        event: "status",
      },
      {
        data: {
          hash,
          progress: null,
          roomId: null,
        },
        event: "progress",
      },
      {
        data: {
          hash,
          logsTail: null,
          roomId: null,
        },
        event: "log",
      },
    ];
  }

  const terminal = isTerminalRoomStatus(snapshot.roomStatus);
  const nextTriggerAt = scheduler?.nextTriggerAt ?? null;

  return [
    {
      data: {
        global: queueDepth,
        hash,
        room: {
          closedReason: snapshot.closedReason,
          id: snapshot.roomId,
          lastOutcome: snapshot.lastOutcome,
          status: snapshot.roomStatus,
          updatedAt: snapshot.roomUpdatedAt,
        },
      },
      event: "queue",
    },
    {
      data: {
        hash,
        isTerminal: terminal,
        lastSyncedAt: snapshot.lastSyncedAt,
        nextTriggerAt,
        room: {
          closedReason: snapshot.closedReason,
          id: snapshot.roomId,
          lastOutcome: snapshot.lastOutcome,
          status: snapshot.roomStatus,
          triggeredBy: snapshot.triggeredBy,
          updatedAt: snapshot.roomUpdatedAt,
        },
        schedulerIntervalMinutes: scheduler?.intervalMinutes ?? null,
      },
      event: "status",
    },
    {
      data: {
        hash,
        progress: snapshot.progress,
        roomId: snapshot.roomId,
      },
      event: "progress",
    },
    {
      data: {
        hash,
        logsTail: snapshot.logsTail,
        roomId: snapshot.roomId,
      },
      event: "log",
    },
  ];
}

function writeSseEvent(
  res: Response,
  sequence: number,
  event: RoomSseEventName,
  data: unknown,
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

async function sendMessagesToResponse(
  hash: string,
  res: Response,
  messages: RoomSseMessage[],
): Promise<void> {
  for (const msg of messages) {
    const seq = await allocateEventSequence(hash);
    writeSseEvent(res, seq, msg.event, msg.data);
  }
}

/**
 * Full snapshot for one subscriber (connect or reconnect).
 */
export async function sendRoomSseSnapshotToResponse(hash: string, res: Response): Promise<void> {
  const messages = await buildRoomSseMessages(hash);
  await sendMessagesToResponse(hash, res, messages);
}

/**
 * Push the same snapshot to every open subscriber for the hash (queue/room/scheduler updates).
 * One `id:` sequence per logical event so all clients see identical ordering.
 */
export async function broadcastRoomSse(hash: string): Promise<void> {
  const clients = hashToClients.get(hash);

  if (!clients || clients.size === 0) {
    return;
  }

  const messages = await buildRoomSseMessages(hash);

  for (const msg of messages) {
    const seq = await allocateEventSequence(hash);

    for (const res of Array.from(clients)) {
      if (res.writableEnded) {
        clients.delete(res);
        continue;
      }

      writeSseEvent(res, seq, msg.event, msg.data);
    }
  }

  if (clients.size === 0) {
    hashToClients.delete(hash);
  }
}

/**
 * Register a long-lived Server-Sent Events response; returns unsubscribe.
 */
export function registerRoomSseClient(hash: string, res: Response): () => void {
  let set = hashToClients.get(hash);

  if (!set) {
    set = new Set<Response>();
    hashToClients.set(hash, set);
  }

  set.add(res);

  return () => {
    const bucket = hashToClients.get(hash);

    if (!bucket) {
      return;
    }

    bucket.delete(res);

    if (bucket.size === 0) {
      hashToClients.delete(hash);
    }
  };
}
