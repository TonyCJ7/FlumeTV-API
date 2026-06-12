import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import {
  registerConfigsPrefetchStatusSseClient,
  sendConfigsPrefetchStatusSnapshotToResponse,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { sendKnownRestError } from "@/utils/restError.utils";

/**
 * GET `/api/configs/prefetch-status/stream` — user-scoped SSE for config list prefetch/room status.
 */
export async function handleGetConfigsPrefetchStatusStream(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
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

  const unsubscribe = await registerConfigsPrefetchStatusSseClient(userId, res);
  await sendConfigsPrefetchStatusSnapshotToResponse(userId, res);

  const cleanup = (): void => {
    unsubscribe();
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
}
