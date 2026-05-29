import type { Request, Response } from "express";
import _isFinite from "lodash/isFinite";
import _isPlainObject from "lodash/isPlainObject";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import { REST_ERROR_CODES } from "@/constants/errorCodes.constants";
import {
  broadcastConfigsPrefetchStatusHashToUser,
  refreshConfigsPrefetchStatusUserHashIndex,
} from "@/core/configsPrefetchStatusSseBroadcaster";
import { enqueueSyncJob } from "@/core/prefetchSyncQueue";
import { getUserHashConfigName, upsertHashConfigAndUserBridge } from "@/database/providerConfig.db";
import { getRoomSummary, userHasHashLink } from "@/database/room.db";
import type {
  HashConfigDirectParams,
  HashConfigParams,
  HashConfigXtreamParams,
} from "@/types/provider.types";
import type {
  PostConfigDirectRequestBody,
  PostConfigRequestBody,
  PostConfigXtreamRequestBody,
} from "@/types/rest.types";
import { computeDirectConfigHash, computeXtreamConfigHash } from "@/utils/configHash.utils";
import {
  assertOutboundProviderUrlAllowed,
  assertOutboundProviderUrlAllowedIfPresent,
} from "@/utils/outboundUrl.utils";
import { sendKnownRestError } from "@/utils/restError.utils";

const CONFIG_DISPLAY_NAME_MAX_LEN = 200;

function parseEpgOffset(raw: unknown): number {
  const parsed = Number.parseInt(_toString(raw), 10);
  return _isFinite(parsed) ? parsed : 0;
}

function parseRequestConfigDisplayName(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: false };
  }

  const trimmed = _trim(_toString(raw));

  if (!trimmed || trimmed.length > CONFIG_DISPLAY_NAME_MAX_LEN) {
    return { ok: false };
  }

  return { ok: true, value: trimmed };
}

async function validateAndBuildXtreamHashParams(
  userId: string,
  record: PostConfigXtreamRequestBody,
  configName: string,
): Promise<{ ok: true; params: HashConfigXtreamParams } | { ok: false; reason: "body" | "url" }> {
  const hasCustomEpg = !!record.hasCustomEpg;
  const panelUrl = _trim(_toString(record.panelUrl));
  const panelUsername = _trim(_toString(record.panelUsername));
  const panelPassword = _toString(record.panelPassword);

  const customEpgRaw = record.customEpg;
  const customEpg =
    customEpgRaw === undefined || customEpgRaw === null ? null : _trim(_toString(customEpgRaw));
  const epgUrlRaw = record.epgUrl;
  const epgUrl = epgUrlRaw === undefined || epgUrlRaw === null ? null : _trim(_toString(epgUrlRaw));
  const epgOffset = parseEpgOffset(record.epgOffset);

  if (!panelUrl || !panelUsername || !panelPassword) {
    return { ok: false, reason: "body" };
  }

  try {
    await assertOutboundProviderUrlAllowed(panelUrl);
    await assertOutboundProviderUrlAllowedIfPresent(epgUrl);
  } catch {
    return { ok: false, reason: "url" };
  }

  const hashInput = {
    panelUrl,
    hasCustomEpg,
    customEpg,
    epgUrl,
    epgOffset,
    panelUsername,
    panelPassword,
  };
  const hash = computeXtreamConfigHash(hashInput);

  const params: HashConfigXtreamParams = {
    kind: "xtream",
    userId,
    hash,
    configName,
    ...hashInput,
  };

  return { ok: true, params };
}

async function validateAndBuildDirectHashParams(
  userId: string,
  record: PostConfigDirectRequestBody,
  configName: string,
): Promise<{ ok: true; params: HashConfigDirectParams } | { ok: false; reason: "body" | "url" }> {
  const hasCustomEpg = !!record.hasCustomEpg;
  const m3uUrl = _trim(_toString(record.m3uUrl));
  const epgUrlRaw = record.epgUrl;
  const epgUrl = epgUrlRaw === undefined || epgUrlRaw === null ? null : _trim(_toString(epgUrlRaw));
  const epgOffset = parseEpgOffset(record.epgOffset);

  if (!m3uUrl) {
    return { ok: false, reason: "body" };
  }

  try {
    await assertOutboundProviderUrlAllowed(m3uUrl);
    await assertOutboundProviderUrlAllowedIfPresent(epgUrl);
  } catch {
    return { ok: false, reason: "url" };
  }

  const hashInput = {
    m3uUrl,
    hasCustomEpg,
    epgUrl,
    epgOffset,
  };
  const hash = computeDirectConfigHash(hashInput);

  const params: HashConfigDirectParams = {
    kind: "direct",
    userId,
    hash,
    configName,
    ...hashInput,
  };

  return { ok: true, params };
}

export async function validateAndBuildConfigHashParams(
  userId: string,
  body: PostConfigRequestBody,
): Promise<{ ok: true; params: HashConfigParams } | { ok: false; reason: "body" | "url" }> {
  if (!_isPlainObject(body)) {
    return { ok: false, reason: "body" };
  }

  const nameParsed = parseRequestConfigDisplayName(body.configName);

  if (!nameParsed.ok) {
    return { ok: false, reason: "body" };
  }

  const configName = nameParsed.value;
  const typeRaw = body.type;

  if (typeRaw === "xtream") {
    return validateAndBuildXtreamHashParams(
      userId,
      body as PostConfigXtreamRequestBody,
      configName,
    );
  }

  if (typeRaw === "direct") {
    return validateAndBuildDirectHashParams(
      userId,
      body as PostConfigDirectRequestBody,
      configName,
    );
  }

  return { ok: false, reason: "body" };
}

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
