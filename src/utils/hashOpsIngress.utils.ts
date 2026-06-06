import _isBoolean from "lodash/isBoolean";
import _isPlainObject from "lodash/isPlainObject";

import type { PatchHashActiveIngressBody, ValidatedPatchHashActiveBody } from "@/types/rest.types";

export function parseHashPathParam(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function parsePatchHashActiveBody(body: unknown): ValidatedPatchHashActiveBody | null {
  if (!_isPlainObject(body)) {
    return null;
  }

  const raw = (body as PatchHashActiveIngressBody).isActive;

  if (!_isBoolean(raw)) {
    return null;
  }

  return { isActive: raw };
}
