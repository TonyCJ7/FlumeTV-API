import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import {
  registerRoomLogSseClient,
  sendRoomLogSseProgressReplayToResponse,
  sendRoomLogSseReplayToResponse,
} from "@/core/roomLogSseBroadcaster";
import { registerRoomSseClient, sendRoomSseSnapshotToResponse } from "@/core/roomSseBroadcaster";
import { userHasHashLink } from "@/database/room.db";
import { sendKnownRestError } from "@/utils/restError.utils";

/**
 * Server-Sent Events stream for shared room / queue / scheduler visibility for one config hash.
 * GET `/api/hashes/:hash/room/events`
 */
export async function handleGetRoomEvents(req: Request, res: Response): Promise<void> {
  const hash = req.params.hash as string;
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const unsubscribe = registerRoomSseClient(hash, res);
  await sendRoomSseSnapshotToResponse(hash, res);

  const cleanup = (): void => {
    unsubscribe();
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
}

/**
 * Dedicated Server-Sent Events stream for prefetch log lines (`room_log_line` + `Last-Event-ID` resume).
 * GET `/api/hashes/:hash/logs/stream`
 */
export async function handleGetRoomLogStream(req: Request, res: Response): Promise<void> {
  const hash = req.params.hash as string;
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const lastIdRaw = req.headers["last-event-id"];
  const lastIdStr = Array.isArray(lastIdRaw) ? lastIdRaw[0] : lastIdRaw;
  const parsedLast = lastIdStr != null && lastIdStr.length > 0 ? parseInt(lastIdStr, 10) : 0;
  const afterSeq = Number.isFinite(parsedLast) && parsedLast > 0 ? parsedLast : 0;

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const unsubscribe = registerRoomLogSseClient(hash, res);

  await sendRoomLogSseReplayToResponse(hash, res, afterSeq);
  await sendRoomLogSseProgressReplayToResponse(hash, res);

  const cleanup = (): void => {
    unsubscribe();
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
}
