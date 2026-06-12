import _isPlainObject from "lodash/isPlainObject";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import type {
  PostChangePasswordRequestBody,
  PostLoginRequestBody,
  PostRegisterRequestBody,
  ValidatedPostChangePasswordRequestBody,
  ValidatedPostLoginRequestBody,
  ValidatedPostRegisterRequestBody,
} from "@/types/rest.types";

export function parseRegisterBody(body: unknown): ValidatedPostRegisterRequestBody | null {
  if (!_isPlainObject(body)) {
    return null;
  }

  const record = body as PostRegisterRequestBody;

  return { password: _trim(_toString(record.password)) };
}

export function parseLoginBody(body: unknown): ValidatedPostLoginRequestBody | null {
  if (!_isPlainObject(body)) {
    return null;
  }

  const record = body as PostLoginRequestBody;

  return {
    userId: _trim(_toString(record.userId)),
    password: _trim(_toString(record.password)),
  };
}

export function parseChangePasswordBody(
  body: unknown,
): ValidatedPostChangePasswordRequestBody | null {
  if (!_isPlainObject(body)) {
    return null;
  }

  const record = body as PostChangePasswordRequestBody;

  return {
    currentPassword: _trim(_toString(record.currentPassword)),
    newPassword: _trim(_toString(record.newPassword)),
  };
}
