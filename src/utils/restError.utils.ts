import type { Response } from "express";

import { REST_ERROR_DEFINITIONS } from "@/constants/errorCodes.constants";
import type { RestErrorCode } from "@/types/rest.types";

export function sendKnownRestError(
  res: Response,
  code: RestErrorCode,
  messageOverride?: string,
): void {
  const definition = REST_ERROR_DEFINITIONS[code];
  const message = messageOverride ?? definition.message;

  res.status(definition.httpStatus).json({ code, message });
}
