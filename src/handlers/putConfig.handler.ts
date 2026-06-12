import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import { enqueueSyncJob } from "@/core/prefetchSyncQueue";
import {
  broadcastConfigsPrefetchStatusHashToUser,
  refreshConfigsPrefetchStatusUserHashIndex,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { removeHashConfigForLastUser } from "@/core/lastUserHashRemoval";
import {
  countOtherUsers,
  deleteUserHashBridgeRow,
  getUserHashConfigName,
  updateUserHashConfigName,
  upsertHashConfigAndUserBridge,
} from "@/database/providerConfig.db";
import { getRoomSummary, userHasHashLink } from "@/database/room.db";
import type { PostConfigRequestBody, PutConfigResponseBody } from "@/types/rest.types";
import { validateAndBuildConfigHashParams } from "@/utils/configRequestBody.utils";
import { parseHashPathParam } from "@/utils/hashOpsIngress.utils";
import { sendKnownRestError } from "@/utils/restError.utils";

async function removeOldHashForUser(params: {
  hash: string;
  userId: string;
}): Promise<
  { hashRemovedFromServer: boolean; ok: true } | { ok: false; reason: "HASH_SYNC_ALREADY_ACTIVE" }
> {
  const { hash, userId } = params;
  const otherUsers = await countOtherUsers(hash, userId);

  if (otherUsers > 0) {
    await deleteUserHashBridgeRow({ hash, userId });
    return { hashRemovedFromServer: false, ok: true };
  }

  const removed = await removeHashConfigForLastUser(hash);

  if (!removed.ok) {
    return { ok: false, reason: "HASH_SYNC_ALREADY_ACTIVE" };
  }

  return { hashRemovedFromServer: true, ok: true };
}

export async function handlePutConfig(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const oldHash = parseHashPathParam(req.params.hash);

  if (!oldHash) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
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

  if (!(await userHasHashLink({ hash: oldHash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const newHash = parsed.params.hash;

  if (newHash === oldHash) {
    const storedConfigName = await getUserHashConfigName({ hash: oldHash, userId });

    if (storedConfigName !== null && parsed.params.configName === storedConfigName) {
      const body: PutConfigResponseBody = {
        hash: oldHash,
        unchanged: true,
      };
      res.status(200).json(body);
      return;
    }

    if (storedConfigName !== null) {
      await updateUserHashConfigName({
        configName: parsed.params.configName,
        hash: oldHash,
        userId,
      });

      const body: PutConfigResponseBody = {
        configNameUpdated: true,
        hash: oldHash,
        unchanged: false,
      };
      res.status(200).json(body);
      return;
    }

    await upsertHashConfigAndUserBridge(parsed.params);

    const body: PutConfigResponseBody = {
      configNameUpdated: true,
      hash: oldHash,
      unchanged: false,
    };
    res.status(200).json(body);
    return;
  }

  const removedOld = await removeOldHashForUser({ hash: oldHash, userId });

  if (!removedOld.ok) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_SYNC_ALREADY_ACTIVE);
    return;
  }

  const { hashRemovedFromServer } = removedOld;

  const result = await upsertHashConfigAndUserBridge(parsed.params);

  await refreshConfigsPrefetchStatusUserHashIndex(userId);
  await broadcastConfigsPrefetchStatusHashToUser(userId, oldHash);
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

  const body: PutConfigResponseBody = {
    created: result.createdNewHashConfig,
    enqueueErrorCode,
    estimatedWaitMs,
    hash: result.hash,
    hashRemovedFromServer,
    linkStatus: result.createdNewHashConfig ? "created" : "linked-existing",
    oldHashUnlinked: true,
    queuePosition,
    roomId: roomSummary?.roomId ?? null,
    roomStatus: roomSummary?.roomStatus ?? null,
    syncEnqueued,
    unchanged: false,
  };

  res.status(200).json(body);
}
