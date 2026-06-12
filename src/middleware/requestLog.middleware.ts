import type { NextFunction, Request, Response } from "express";
import _isPlainObject from "lodash/isPlainObject";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import {
  colorizeHttpMethod,
  colorizeHttpStatus,
  isDebug,
  logError,
  logInfo,
  logWarn,
} from "@/utils/debug.utils";

function restErrorHintFromBody(body: unknown): string | undefined {
  if (!_isPlainObject(body)) {
    return undefined;
  }

  const record = body as Record<string, string | number | boolean | null | undefined>;
  const code = record.code != null ? _trim(_toString(record.code)) : "";
  const message = record.message != null ? _trim(_toString(record.message)) : "";

  if (code && message) {
    return `${code}: ${message}`;
  }

  if (code) {
    return code;
  }

  if (message) {
    return message;
  }

  return undefined;
}

function logHttpRequest(params: {
  durationMs: number;
  errorHint: string | undefined;
  method: string;
  path: string;
  status: number;
  userId: string | undefined;
}): void {
  const { durationMs, errorHint, method, path, status, userId } = params;
  const base = `${colorizeHttpMethod(method)} ${path} ${colorizeHttpStatus(status)} ${durationMs}ms`;

  if (isDebug()) {
    const detail = { error: errorHint, userId };

    if (status >= 500) {
      logError("HTTP", base, detail);
      return;
    }

    if (status >= 400) {
      logWarn("HTTP", base, detail);
      return;
    }

    logInfo("HTTP", base, detail);
    return;
  }

  const errSuffix = errorHint ? ` — ${errorHint}` : "";
  const line = `${base}${errSuffix}`;

  if (status >= 500) {
    logError("HTTP", line);
    return;
  }

  if (status >= 400) {
    logWarn("HTTP", line);
    return;
  }

  logInfo("HTTP", line);
}

/**
 * Logs every HTTP request when the response finishes (status, duration, REST error hint when present).
 */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();
  let errorHint: string | undefined;

  const originalJson = res.json.bind(res);

  res.json = function jsonWithCapture(body: unknown) {
    if (res.statusCode >= 400) {
      const hint = restErrorHintFromBody(body);

      if (hint) {
        errorHint = hint;
      }
    }

    return originalJson(body);
  };

  res.on("finish", () => {
    const durationMs = Date.now() - startMs;

    logHttpRequest({
      durationMs,
      errorHint,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      userId: req.userId,
    });
  });

  next();
}
