import { XTREAM_FALLBACK_CATEGORY_ID } from "@/constants/stream.constants";
import { AddonStreamType, StreamWithConfig } from "@/types/stream.types";
import type { XtreamPanelField, XtreamUserInfoIngress } from "@/types/xtreamSync.types";
import _isEmpty from "lodash/isEmpty";
import _toNumber from "lodash/toNumber";
import _replace from "lodash/replace";
import _toString from "lodash/toString";
import _trim from "lodash/trim";

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
