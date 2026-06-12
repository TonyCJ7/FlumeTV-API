import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { buildConfigsPrefetchStatusBody } from "@/core/configsPrefetchStatusSnapshot";
import { sendKnownRestError } from "@/utils/restError.utils";

/**
 * GET `/api/configs/prefetch-status` — same `user_hash` scope as GET `/api/configs`; aligns with room SSE snapshot fields.
 */
export async function handleGetConfigsPrefetchStatus(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const body = await buildConfigsPrefetchStatusBody(userId);
  res.status(200).json(body);
}
