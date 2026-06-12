import _isArray from "lodash/isArray";
import _isEmpty from "lodash/isEmpty";
import _map from "lodash/map";
import _toNumber from "lodash/toNumber";
import _replace from "lodash/replace";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

import {
  LIVE_CONTAINER_EXTENSION_FALLBACK,
  XTREAM_FALLBACK_CATEGORY_ID,
} from "@/constants/stream.constants";
import { AddonStreamType, StreamWithConfig } from "@/types/stream.types";
import type { XtreamPanelField, XtreamUserInfoIngress } from "@/types/xtreamSync.types";

const LIVE_OUTPUT_FORMAT_PREFERENCE = ["ts", "m3u8"] as const;
/** Pick live playback extension from Xtream `user_info.allowed_output_formats` (prefers ts, then m3u8). */
export function resolveLiveOutputFormatFromAllowedFormats(rawFormats: unknown): string {
  if (!_isArray(rawFormats)) {
    return LIVE_CONTAINER_EXTENSION_FALLBACK;
  }

  const normalizedFormats = _map(rawFormats, (format) => {
    return resolvedContainerExtension(_toString(format));
  }).filter((format) => {
    return !_isEmpty(format);
  });

  for (const preferredFormat of LIVE_OUTPUT_FORMAT_PREFERENCE) {
    if (normalizedFormats.includes(preferredFormat)) {
      return preferredFormat;
    }
  }

  if (normalizedFormats.length > 0) {
    return normalizedFormats[0];
  }

  return LIVE_CONTAINER_EXTENSION_FALLBACK;
}

/** Ingress guard for Xtream `get_user_info` object body (rejects arrays and non-objects). */
export function parseXtreamUserInfoIngress(value: unknown): XtreamUserInfoIngress | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as XtreamUserInfoIngress;
}

/** Coerce panel `category_id` to a number, or the sync fallback sentinel. */
export function normalizeProviderCategoryId(raw: XtreamPanelField): number {
  const asNumber = _toNumber(raw);

  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  return XTREAM_FALLBACK_CATEGORY_ID;
}

export function resolvedContainerExtension(raw?: string): string {
  const trimmed = _trim(_toString(raw));

  if (!_isEmpty(trimmed)) {
    return _replace(trimmed, ".", "");
  }

  return "";
}

/** Resolved Xtream live container: synced/panel value, else LIVE_CONTAINER_EXTENSION_FALLBACK. */
export function resolveLiveContainerExtension(raw?: string): string {
  const resolved = resolvedContainerExtension(raw);

  if (!_isEmpty(resolved)) {
    return resolved;
  }

  return LIVE_CONTAINER_EXTENSION_FALLBACK;
}

function trimXtreamHost(host: string): string {
  const trimmed = _trim(host);
  const withoutTrailingSlashes = trimmed.replace(/\/+$/, "");

  return withoutTrailingSlashes;
}

export function buildXtreamPlayerApiUrl(url: string, username: string, password: string): string {
  return `${url}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
}

export function buildXtreamPlaybackUrl(
  playback: StreamWithConfig["XtremeConfig"],
  segment: AddonStreamType,
  streamId: string | number,
  containerExtension?: string,
): string {
  const host = trimXtreamHost(playback.xtreme_url ?? "");
  const extension = resolvedContainerExtension(containerExtension);
  const streamIdPart = _trim(_toString(streamId));
  const encodedUsername = encodeURIComponent(playback.username as string);
  const encodedPassword = encodeURIComponent(playback.password as string);

  return `${host}/${segment}/${encodedUsername}/${encodedPassword}/${streamIdPart}.${extension}`;
}
