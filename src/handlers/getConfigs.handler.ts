import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { listUserConfigRows } from "@/database/providerConfig.db";
import { configItemFactory } from "@/factories/configList.factory";
import type { GetConfigsResponseBody } from "@/types/rest.types";
import { sendKnownRestError } from "@/utils/restError.utils";

export async function handleGetConfigs(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const rows = await listUserConfigRows(userId);
  const configs = rows.map((row) => configItemFactory(row, userId));
  const body: GetConfigsResponseBody = { configs };

  res.status(200).json(body);
}
