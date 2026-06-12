import type { NextFunction, Request, Response } from "express";

import { SESSION_COOKIE_NAME } from "@/constants/common.constants";
import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { dlog, logWarn } from "@/utils/debug.utils";
import { sendKnownRestError } from "@/utils/restError.utils";
import { verifySessionToken } from "@/utils/session.utils";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token || typeof token !== "string") {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  try {
    const { sub } = verifySessionToken(token);
    req.userId = sub;
    next();
  } catch (e) {
    logWarn("auth", "requireAuth: token verification failed", e);
    dlog("requireAuth: token verification failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_INVALID);
  }
}
