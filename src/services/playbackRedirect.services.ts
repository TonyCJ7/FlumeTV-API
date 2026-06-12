import _trim from "lodash/trim";

import {
  PLAYBACK_REDIRECT_MAX_HOPS,
  PLAYBACK_REDIRECT_RESOLVE_TIMEOUT_MS,
} from "@/constants/streamProxy.constants";
import { outboundAxios } from "@/services/outboundAxios.config";
import { dlog, logInfo, logWarn } from "@/utils/debug.utils";
import { assertOutboundProviderUrlAllowed } from "@/utils/outboundUrl.utils";
import { redactPlaybackUrlForLog } from "@/utils/streamProxy.utils";

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function destroyResponseBody(data: unknown): void {
  if (data && typeof data === "object" && "destroy" in data) {
    const destroy = (data as { destroy?: () => void }).destroy;

    if (typeof destroy === "function") {
      destroy.call(data);
    }
  }
}

/**
 * Resolve Xtream-style panel playback URLs to their public CDN target when the
 * panel answers with an HTTP redirect (common for Range / transcode probes).
 * Falls back to the original URL on error or when no redirect is returned.
 */
export async function fetchPublicPlaybackUrl(sourceUrl: string): Promise<string> {
  const trimmed = _trim(sourceUrl);

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  let currentUrl = trimmed;

  try {
    for (let hop = 0; hop < PLAYBACK_REDIRECT_MAX_HOPS; hop += 1) {
      await assertOutboundProviderUrlAllowed(currentUrl);

      const response = await outboundAxios.get(currentUrl, {
        maxRedirects: 0,
        timeout: PLAYBACK_REDIRECT_RESOLVE_TIMEOUT_MS,
        responseType: "stream",
        headers: { Range: "bytes=0-0" },
        validateStatus: () => {
          return true;
        },
      });

      destroyResponseBody(response.data);

      if (!REDIRECT_STATUS_CODES.has(response.status)) {
        if (hop === 0) {
          return trimmed;
        }

        return currentUrl;
      }

      const locationHeader = response.headers.location;

      if (!locationHeader || typeof locationHeader !== "string") {
        if (hop === 0) {
          return trimmed;
        }

        return currentUrl;
      }

      const nextUrl = new URL(locationHeader, currentUrl).toString();
      await assertOutboundProviderUrlAllowed(nextUrl);
      currentUrl = nextUrl;
    }

    return currentUrl;
  } catch (error) {
    logWarn("stream proxy", "playback redirect resolve failed — using panel URL", {
      url: redactPlaybackUrlForLog(trimmed),
      error: error instanceof Error ? error.message : String(error),
    });

    return trimmed;
  }
}

export async function fetchPublicPlaybackUrls(sourceUrls: string[]): Promise<string[]> {
  const resolvedUrls = await Promise.all(
    sourceUrls.map((sourceUrl) => {
      return fetchPublicPlaybackUrl(sourceUrl);
    }),
  );

  let resolvedCount = 0;

  for (let index = 0; index < sourceUrls.length; index += 1) {
    if (resolvedUrls[index] !== sourceUrls[index]) {
      resolvedCount += 1;
    }
  }

  if (resolvedCount > 0) {
    logInfo("stream proxy", "resolved playback redirects for MediaFlow", {
      total: sourceUrls.length,
      resolvedCount,
    });

    dlog(
      "[STREAM PROXY] resolved playback redirects",
      sourceUrls.map((sourceUrl, index) => {
        return {
          panel: redactPlaybackUrlForLog(sourceUrl),
          public: redactPlaybackUrlForLog(resolvedUrls[index]),
          changed: resolvedUrls[index] !== sourceUrl,
        };
      }),
    );
  }

  return resolvedUrls;
}
