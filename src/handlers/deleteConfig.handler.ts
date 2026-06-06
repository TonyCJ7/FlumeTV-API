import type { Request, Response } from "express";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import {
  broadcastConfigsPrefetchStatusHashToUser,
  refreshConfigsPrefetchStatusUserHashIndex,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { removeHashConfigForLastUser } from "@/core/lastUserHashRemoval";
import { countOtherUsers, deleteUserHashBridgeRow } from "@/database/providerConfig.db";
import { userHasHashLink } from "@/database/room.db";
import type { DeleteConfigResponseBody } from "@/types/rest.types";
import { parseHashPathParam } from "@/utils/hashOpsIngress.utils";
import { sendKnownRestError } from "@/utils/restError.utils";

export async function handleDeleteConfig(req: Request, res: Response): Promise<void> {
  const userId = req.userId;

  if (!userId) {
    sendKnownRestError(res, REST_ERROR_CODES.AUTH_SESSION_MISSING);
    return;
  }

  const hash = parseHashPathParam(req.params.hash);

  if (!hash) {
    sendKnownRestError(res, REST_ERROR_CODES.CONFIG_BODY_INVALID);
    return;
  }

  if (!(await userHasHashLink({ hash, userId }))) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_NOT_LINKED_TO_USER);
    return;
  }

  const otherUsers = await countOtherUsers(hash, userId);

  if (otherUsers > 0) {
    await deleteUserHashBridgeRow({ hash, userId });

    await refreshConfigsPrefetchStatusUserHashIndex(userId);
    await broadcastConfigsPrefetchStatusHashToUser(userId, hash);

    const body: DeleteConfigResponseBody = {
      hashRemovedFromServer: false,
      hashUnlinked: true,
    };
    res.status(200).json(body);
    return;
  }

  const removed = await removeHashConfigForLastUser(hash);

  if (!removed.ok) {
    sendKnownRestError(res, REST_ERROR_CODES.HASH_SYNC_ALREADY_ACTIVE);
    return;
  }

  await refreshConfigsPrefetchStatusUserHashIndex(userId);
  await broadcastConfigsPrefetchStatusHashToUser(userId, hash);

  const body: DeleteConfigResponseBody = {
    hashRemovedFromServer: true,
    hashUnlinked: true,
  };

  res.status(200).json(body);
}
