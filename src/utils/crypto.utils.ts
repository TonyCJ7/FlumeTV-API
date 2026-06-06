import crypto from "crypto";
import _trim from "lodash/trim";

import { logWarn } from "@/utils/debug.utils";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

function getAddonSecretKey(): string {
  const secret = process.env.ADDON_SECRET_KEY;
  const trimmed = _trim(secret || "");

  if (!trimmed) {
    throw new Error("ADDON_SECRET_KEY is not set");
  }

  return trimmed;
}

/**
 * Normalizes the ENV secret key to exactly 32 characters using MD5.
 * This ensures the encryption algorithm never fails due to key length.
 */
function getSecretKey(): Buffer {
  const hash = crypto.createHash("md5").update(getAddonSecretKey()).digest("hex");
  return Buffer.from(hash);
}

/** Validates ADDON_SECRET_KEY is configured; call once at process start. */
export function assertAddonSecretConfigured(): void {
  getAddonSecretKey();
}

/**
 * Encodes any object into a URL-safe encrypted token.
 * @param data - The object to be stored in the Stremio URL.
 * @returns A Base64URL encoded encrypted string.
 */
export function encodeToken(data: Record<string, unknown>): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

function parseDecryptedJsonObject(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/**
 * Decodes a URL-safe token back into the original object.
 * @param {string} token - The encrypted string from the request path.
 * @returns The original object or null if invalid/tampered.
 */
export function decodeToken<T = Record<string, unknown>>(token: string): T | null {
  try {
    const key = getSecretKey();
    const buffer = Buffer.from(token, "base64url");

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    const parsed = parseDecryptedJsonObject(decrypted.toString("utf8"));
    return parsed as T | null;
  } catch {
    return null;
  }
}

/**
 * Encrypts a UTF-8 secret for database storage (e.g. `password_enc`); base64url blob (IV + tag + ciphertext).
 * Same key derivation as `encodeToken`, but plain UTF-8 payload (not JSON).
 */
export function encryptSecretForStorage(plainText: string): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

/**
 * Decrypts `encryptSecretForStorage` output; returns null if the payload is missing or tampered.
 */
export function decryptSecretFromStorage(payload: string): string | null {
  try {
    const key = getSecretKey();
    const buffer = Buffer.from(payload, "base64url");
    if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      return null;
    }
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** Decrypts panel passwords stored with `encryptSecretForStorage`. */
export function decryptPanelPasswordStored(stored: string): string {
  if (!stored) {
    return stored;
  }

  const decrypted = decryptSecretFromStorage(stored);

  if (decrypted === null) {
    logWarn("crypto", "password_enc decrypt failed");
    return "";
  }

  return decrypted;
}
