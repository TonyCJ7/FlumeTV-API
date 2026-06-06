import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import {
  broadcastConfigsPrefetchStatusHashToUser,
  refreshConfigsPrefetchStatusUserHashIndex,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { enqueueSyncJob } from "@/core/prefetchSyncQueue";
import { getUserHashConfigName, upsertHashConfigAndUserBridge } from "@/database/providerConfig.db";
import { getRoomSummary, userHasHashLink } from "@/database/room.db";
import type { PostConfigRequestBody } from "@/types/rest.types";
import { validateAndBuildConfigHashParams } from "@/utils/configRequestBody.utils";
import { sendKnownRestError } from "@/utils/restError.utils";

export async function handlePostConfig(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const parsed = await validateAndBuildConfigHashParams(userId, req.body as PostConfigRequestBody);

  if (!parsed.ok) {
    if (parsed.reason === "url") {
      sendKnownRestError(res, REST_ERROR_CODES.CONFIG_PROVIDER_URL_NOT_ALLOWED);
      return;
    }

    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  const { hash } = parsed.params;

  if (await userHasHashLink({ hash, userId })) {
    const existingName = await getUserHashConfigName({ hash, userId });
    const message =
      existingName !== null ? `A config already exists with name "${existingName}"` : undefined;

    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_ALREADY_EXISTS, message);
    return;
  }

  const result = await upsertHashConfigAndUserBridge(parsed.params);

  await refreshConfigsPrefetchStatusUserHashIndex(userId);
  await broadcastConfigsPrefetchStatusHashToUser(userId, result.hash);

  let enqueueErrorCode: string | null = null;
  let estimatedWaitMs: number | null = null;
  let queuePosition: number | null = null;
  let syncEnqueued = false;

  if (result.createdNewHashConfig) {
    const enqueueResult = await enqueueSyncJob({
      hash: result.hash,
      source: "new-config",
      triggeredByUserId: userId,
    });

    if (enqueueResult.ok) {
      estimatedWaitMs = enqueueResult.estimatedWaitMs;
      queuePosition = enqueueResult.queuePosition;
      syncEnqueued = true;
    } else {
      if (enqueueResult.code === REST_ERROR_CODES.HASH_CONFIG_NOT_FOUND) {
        sendKnownRestError(res, enqueueResult.code);
        return;
      }

      enqueueErrorCode = enqueueResult.code;
    }
  }

  const roomSummary = await getRoomSummary(result.hash);

  res.status(200).json({
    created: result.createdNewHashConfig,
    enqueueErrorCode,
    estimatedWaitMs,
    hash: result.hash,
    linkStatus: result.createdNewHashConfig ? "created" : "linked-existing",
    queuePosition,
    roomId: roomSummary?.roomId,
    roomStatus: roomSummary?.roomStatus,
    syncEnqueued,
  });
}
