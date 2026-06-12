import type { NextFunction, Request, Response } from "express";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import { decodeToken } from "@/utils/crypto.utils";

/** Decode `:config_hash` addon token and set `req.userId` for request logging and downstream handlers. */
export function addonTokenMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const configHash = _trim(_toString(req.params.config_hash ?? ""));

  if (configHash === "") {
    next();
    return;
  }

  const payload = decodeToken<{ uuid?: string }>(configHash);
  const uuid = payload ? _trim(_toString(payload.uuid)) : "";

  if (uuid !== "") {
    req.userId = uuid;
  }

  next();
}
