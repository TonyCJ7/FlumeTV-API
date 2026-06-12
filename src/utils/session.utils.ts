import type { Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import _trim from "lodash/trim";

import { SESSION_COOKIE_NAME } from "@/constants/common.constants";

const JWT_EXPIRES_IN_SECONDS_DEFAULT = 7 * 24 * 3600;

function readSessionMaxAgeSeconds(): number {
  const parsed = parseInt(process.env.SESSION_MAX_AGE_SECONDS || "", 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return JWT_EXPIRES_IN_SECONDS_DEFAULT;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_JWT_SECRET;
  const trimmed = _trim(secret || "");

  if (!trimmed) {
    throw new Error("SESSION_JWT_SECRET is not set");
  }

  return trimmed;
}

export function setSessionCookie(res: Response, token: string): void {
  const maxAgeSeconds = readSessionMaxAgeSeconds();

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAgeSeconds * 1000,
    path: "/",
  });
}

const SESSION_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Clears the httpOnly session cookie (logout). Options must match `setSessionCookie`. */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_CLEAR_OPTIONS);
}

export function signSessionToken(userId: string): string {
  const secret = getSessionSecret();
  const expiresIn = readSessionMaxAgeSeconds();

  return jwt.sign({ sub: userId }, secret, { expiresIn });
}

export function verifySessionToken(token: string): { sub: string } {
  const secret = getSessionSecret();
  const decoded = jwt.verify(token, secret) as JwtPayload;
  const subject = decoded.sub;

  if (typeof subject !== "string" || _trim(subject) === "") {
    throw new Error("Invalid session token subject");
  }

  return { sub: subject };
}
