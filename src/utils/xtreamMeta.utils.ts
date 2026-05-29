import { XTREAM_FALLBACK_CATEGORY_ID } from "@/constants/xtreamSync.constants";
import { AddonStreamType, StreamWithConfig } from "@/types/stream.types";
import _isEmpty from "lodash/isEmpty";
import _toNumber from "lodash/toNumber";
import _replace from "lodash/replace";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

/** Coerce panel `category_id` to a number, or the sync fallback sentinel. */
export function normalizeProviderCategoryId(raw: unknown): number {
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

function trimXtreamHost(host: string): string {
  const trimmed = _trim(host);
  const withoutTrailingSlashes = trimmed.replace(/\/+$/, "");

  return withoutTrailingSlashes;
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
