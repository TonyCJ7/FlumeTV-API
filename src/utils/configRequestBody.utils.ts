import _isFinite from "lodash/isFinite";
import _isPlainObject from "lodash/isPlainObject";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import { CONFIG_DISPLAY_NAME_MAX_LEN } from "@/constants/config.constants";
import type {
  HashConfigDirectParams,
  HashConfigParams,
  HashConfigXtreamParams,
} from "@/types/provider.types";
import type {
  PostConfigDirectRequestBody,
  PostConfigRequestBody,
  PostConfigXtreamRequestBody,
  ValidatedPostConfigDirect,
  ValidatedPostConfigRequestBody,
  ValidatedPostConfigXtream,
} from "@/types/rest.types";
import { computeDirectConfigHash, computeXtreamConfigHash } from "@/utils/configHash.utils";
import {
  assertOutboundProviderUrlAllowed,
  assertOutboundProviderUrlAllowedIfPresent,
} from "@/utils/outboundUrl.utils";

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

function parseNullableTrimmedString(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  return _trim(_toString(raw));
}

function parsePostConfigRequestBody(
  body: PostConfigRequestBody,
): ValidatedPostConfigRequestBody | null {
  if (!_isPlainObject(body)) {
    return null;
  }

  const nameParsed = parseRequestConfigDisplayName(body.configName);

  if (!nameParsed.ok) {
    return null;
  }

  const configName = nameParsed.value;

  if (body.type === "xtream") {
    const record = body as PostConfigXtreamRequestBody;
    const panelUrl = _trim(_toString(record.panelUrl));
    const panelUsername = _trim(_toString(record.panelUsername));
    const panelPassword = _toString(record.panelPassword);

    if (!panelUrl || !panelUsername || !panelPassword) {
      return null;
    }

    return {
      type: "xtream",
      configName,
      customEpg: parseNullableTrimmedString(record.customEpg),
      epgOffset: parseEpgOffset(record.epgOffset),
      epgUrl: parseNullableTrimmedString(record.epgUrl),
      hasCustomEpg: !!record.hasCustomEpg,
      panelPassword,
      panelUrl,
      panelUsername,
    };
  }

  if (body.type === "direct") {
    const record = body as PostConfigDirectRequestBody;
    const m3uUrl = _trim(_toString(record.m3uUrl));

    if (!m3uUrl) {
      return null;
    }

    return {
      type: "direct",
      configName,
      epgOffset: parseEpgOffset(record.epgOffset),
      epgUrl: parseNullableTrimmedString(record.epgUrl),
      hasCustomEpg: !!record.hasCustomEpg,
      m3uUrl,
    };
  }

  return null;
}

async function validateAndBuildXtreamHashParams(
  userId: string,
  validated: ValidatedPostConfigXtream,
): Promise<{ ok: true; params: HashConfigXtreamParams } | { ok: false; reason: "url" }> {
  const {
    configName,
    customEpg,
    epgOffset,
    epgUrl,
    hasCustomEpg,
    panelPassword,
    panelUrl,
    panelUsername,
  } = validated;

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
  validated: ValidatedPostConfigDirect,
): Promise<{ ok: true; params: HashConfigDirectParams } | { ok: false; reason: "url" }> {
  const { configName, epgOffset, epgUrl, hasCustomEpg, m3uUrl } = validated;

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
  const validated = parsePostConfigRequestBody(body);

  if (!validated) {
    return { ok: false, reason: "body" };
  }

  if (validated.type === "xtream") {
    return validateAndBuildXtreamHashParams(userId, validated);
  }

  return validateAndBuildDirectHashParams(userId, validated);
}
