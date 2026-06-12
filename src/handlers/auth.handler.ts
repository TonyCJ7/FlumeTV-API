import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import _isEmpty from "lodash/isEmpty";

import { MIN_PASSWORD_LENGTH } from "@/constants/auth.constants";
import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { getPasswordHash, insertUser, updateUserPasswordHash } from "@/database/user.db";
import type { AuthUserResponseBody, PostLogoutResponseBody } from "@/types/rest.types";
import {
  parseChangePasswordBody,
  parseLoginBody,
  parseRegisterBody,
} from "@/utils/authRequestBody.utils";
import { dlog, logError } from "@/utils/debug.utils";
import { hashPassword, verifyPassword } from "@/utils/password.utils";
import { sendKnownRestError } from "@/utils/restError.utils";
import { clearSessionCookie, setSessionCookie, signSessionToken } from "@/utils/session.utils";

function isPgUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;

  return code === "23505";
}

export async function handleRegister(req: Request, res: Response): Promise<void> {
  const validated = parseRegisterBody(req.body);

  if (!validated) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_BODY_INVALID);
    return;
  }

  const { password } = validated;

  if (_isEmpty(password) || password.length < MIN_PASSWORD_LENGTH) {
    sendKnownRestError(
      res,
      REST_ERROR_CODES.REGISTER_PASSWORD_INVALID,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    return;
  }

  const userId = randomUUID();
  let passwordHash: string;

  try {
    passwordHash = await hashPassword(password);
  } catch (e) {
    logError("auth", "register: hash failed", e);
    dlog("register: hash failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.REGISTER_FAILED);
    return;
  }

  let sessionToken: string;

  try {
    sessionToken = signSessionToken(userId);
  } catch (e) {
    logError("auth", "register: session signing failed", e);
    dlog("register: session signing failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SERVER_MISCONFIGURED);
    return;
  }

  try {
    await insertUser(userId, passwordHash);
  } catch (e) {
    if (isPgUniqueViolation(e)) {
      sendKnownRestError(res, REST_ERROR_CODES.REGISTER_USER_ID_CONFLICT);
      return;
    }

    logError("auth", "register: insert failed", e);
    dlog("register: insert failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.REGISTER_FAILED);
    return;
  }

  setSessionCookie(res, sessionToken);
  const authUser: AuthUserResponseBody = { userId };
  res.status(200).json(authUser);
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const validated = parseLoginBody(req.body);

  if (!validated) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_BODY_INVALID);
    return;
  }

  const { userId, password } = validated;

  if (_isEmpty(userId) || _isEmpty(password)) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_BODY_INVALID);
    return;
  }

  const storedHash = await getPasswordHash(userId);
  const passwordOk = storedHash ? await verifyPassword(password, storedHash) : false;

  if (!passwordOk) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    return;
  }

  try {
    const sessionToken = signSessionToken(userId);
    setSessionCookie(res, sessionToken);
  } catch (e) {
    logError("auth", "login: sign cookie failed", e);
    dlog("login: sign cookie failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SERVER_MISCONFIGURED);
    return;
  }

  const authUser: AuthUserResponseBody = { userId };
  res.status(200).json(authUser);
}

export async function handleGetMe(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const storedHash = await getPasswordHash(userId);

  if (!storedHash) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    return;
  }

  const authUser: AuthUserResponseBody = { userId };
  res.status(200).json(authUser);
}

export async function handleChangePassword(req: Request, res: Response): Promise<void> {
  const validated = parseChangePasswordBody(req.body);

  if (!validated) {
    sendKnownRestError(res, REST_ERROR_CODES.CHANGE_PASSWORD_BODY_INVALID);
    return;
  }

  const { currentPassword, newPassword } = validated;

  if (_isEmpty(currentPassword) || _isEmpty(newPassword)) {
    sendKnownRestError(res, REST_ERROR_CODES.CHANGE_PASSWORD_BODY_INVALID);
    return;
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    sendKnownRestError(
      res,
      REST_ERROR_CODES.REGISTER_PASSWORD_INVALID,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    return;
  }

  const userId = req.userId;
  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const storedHash = await getPasswordHash(userId);
  const currentOk = storedHash ? await verifyPassword(currentPassword, storedHash) : false;

  if (!currentOk) {
    sendKnownRestError(res, REST_ERROR_CODES.CHANGE_PASSWORD_CURRENT_INVALID);
    return;
  }

  let newHash: string;

  try {
    newHash = await hashPassword(newPassword);
  } catch (e) {
    logError("auth", "change-password: hash failed", e);
    dlog("change-password: hash failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.REGISTER_FAILED);
    return;
  }

  try {
    await updateUserPasswordHash(userId, newHash);
  } catch (e) {
    logError("auth", "change-password: update failed", e);
    dlog("change-password: update failed", e);
    sendKnownRestError(res, REST_ERROR_CODES.REGISTER_FAILED);
    return;
  }

  res.status(200).json({ ok: true as const });
}

export async function handleLogout(_req: Request, res: Response): Promise<void> {
  clearSessionCookie(res);
  const body: PostLogoutResponseBody = { ok: true };
  res.status(200).json(body);
}
