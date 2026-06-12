import axios from "axios";
import _chunk from "lodash/chunk";
import _flatMap from "lodash/flatMap";
import _map from "lodash/map";

import {
  MEDIAFLOW_BATCH_CHUNK_SIZE,
  MEDIAFLOW_GENERATE_URLS_TIMEOUT_MS,
  MEDIAFLOW_PROXY_API_PASSWORD,
  MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_ENABLED,
  MEDIAFLOW_PROXY_TRANSCODE_ENABLED,
  MEDIAFLOW_PROXY_URL,
} from "@/constants/streamProxy.constants";
import { fetchPublicPlaybackUrls } from "@/services/playbackRedirect.services";
import type {
  MediaflowGenerateUrlsRequest,
  MediaflowGenerateUrlsResponse,
} from "@/types/mediaflowProxy.types";
import { dlog, logInfo, logWarn } from "@/utils/debug.utils";
import {
  isStreamProxyConfigured,
  redactPlaybackUrlForLog,
  rewriteMediaflowPublicUrl,
  summarizeProxiedUrlForLog,
  trimMediaflowBaseUrl,
} from "@/utils/streamProxy.utils";

const mediaflowAxios = axios.create({ timeout: MEDIAFLOW_GENERATE_URLS_TIMEOUT_MS });

async function fetchMediaflowProxiedUrlChunk(
  sources: Array<{ destinationUrl: string; filename?: string }>,
): Promise<string[]> {
  const trimmedBaseUrl = trimMediaflowBaseUrl(MEDIAFLOW_PROXY_URL);
  const startedAt = Date.now();
  const requestBody: MediaflowGenerateUrlsRequest = {
    mediaflow_proxy_url: trimmedBaseUrl,
    api_password: MEDIAFLOW_PROXY_API_PASSWORD,
    urls: _map(sources, (source) => {
      const item: MediaflowGenerateUrlsRequest["urls"][number] = {
        endpoint: "/proxy/stream",
        destination_url: source.destinationUrl,
      };

      if (MEDIAFLOW_PROXY_TRANSCODE_ENABLED) {
        item.query_params = { transcode: "true" };
      }

      if (source.filename) {
        item.filename = source.filename;
      }

      return item;
    }),
  };

  logInfo("stream proxy", "MediaFlow generate_urls request", {
    baseUrl: trimmedBaseUrl,
    count: sources.length,
    endpoint: "/proxy/stream",
    transcode: MEDIAFLOW_PROXY_TRANSCODE_ENABLED,
  });

  dlog(
    "[STREAM PROXY] generate_urls destinations",
    _map(sources, (source) => {
      return {
        filename: source.filename,
        destination: redactPlaybackUrlForLog(source.destinationUrl),
      };
    }),
  );

  const { data, status } = await mediaflowAxios.post<MediaflowGenerateUrlsResponse>(
    `${trimmedBaseUrl}/generate_urls`,
    requestBody,
  );

  const elapsedMs = Date.now() - startedAt;

  if (data.error) {
    logWarn("stream proxy", "MediaFlow generate_urls returned error field", {
      status,
      elapsedMs,
      error: data.error,
    });
    throw new Error(data.error);
  }

  const proxiedUrls = data.urls;

  if (!proxiedUrls || proxiedUrls.length !== sources.length) {
    logWarn("stream proxy", "MediaFlow generate_urls unexpected urls length", {
      status,
      elapsedMs,
      expected: sources.length,
      received: proxiedUrls?.length ?? 0,
    });
    throw new Error("MediaFlow returned an unexpected urls array length");
  }

  const rewrittenUrls = _map(proxiedUrls, (proxiedUrl) => {
    return rewriteMediaflowPublicUrl(proxiedUrl);
  });

  logInfo("stream proxy", "MediaFlow generate_urls ok", {
    status,
    elapsedMs,
    count: rewrittenUrls.length,
    samples: _map(rewrittenUrls.slice(0, 3), summarizeProxiedUrlForLog),
  });

  dlog(
    "[STREAM PROXY] generate_urls response",
    _map(rewrittenUrls, (url, index) => {
      return {
        index,
        proxied: summarizeProxiedUrlForLog(url),
      };
    }),
  );

  return rewrittenUrls;
}

async function resolveSourcesForMediaflow(
  sources: Array<{ destinationUrl: string; filename?: string }>,
): Promise<Array<{ destinationUrl: string; filename?: string }>> {
  if (!MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_ENABLED) {
    return sources;
  }

  const resolvedUrls = await fetchPublicPlaybackUrls(
    _map(sources, (source) => {
      return source.destinationUrl;
    }),
  );

  return _map(sources, (source, index) => {
    return {
      destinationUrl: resolvedUrls[index],
      filename: source.filename,
    };
  });
}

export async function fetchMediaflowProxiedUrls(
  sources: Array<{ destinationUrl: string; filename?: string }>,
): Promise<string[]> {
  if (!isStreamProxyConfigured() || sources.length === 0) {
    dlog("[STREAM PROXY] fetchMediaflowProxiedUrls skipped", {
      configured: isStreamProxyConfigured(),
      sourceCount: sources.length,
    });

    return _map(sources, (source) => {
      return source.destinationUrl;
    });
  }

  try {
    const resolvedSources = await resolveSourcesForMediaflow(sources);
    const chunks = _chunk(resolvedSources, MEDIAFLOW_BATCH_CHUNK_SIZE);

    logInfo("stream proxy", "fetchMediaflowProxiedUrls start", {
      sourceCount: sources.length,
      chunkCount: chunks.length,
      resolveRedirects: MEDIAFLOW_PROXY_RESOLVE_REDIRECTS_ENABLED,
    });

    const proxiedChunks = await Promise.all(
      _map(chunks, (chunk) => {
        return fetchMediaflowProxiedUrlChunk(chunk);
      }),
    );

    const flattened = _flatMap(proxiedChunks, (chunkUrls) => {
      return chunkUrls;
    });

    logInfo("stream proxy", "fetchMediaflowProxiedUrls complete", {
      sourceCount: sources.length,
      resultCount: flattened.length,
    });

    return flattened;
  } catch (error) {
    logWarn("stream proxy", "fetchMediaflowProxiedUrls failed — returning original URLs", error);
    dlog("[STREAM PROXY] generate_urls failure details", error);

    return _map(sources, (source) => {
      return source.destinationUrl;
    });
  }
}

/** Smoke/diagnostic: GET MediaFlow /health when proxy env is configured. */
export async function fetchMediaflowHealth(): Promise<{
  ok: boolean;
  status?: number;
  body?: string;
  elapsedMs: number;
  error?: string;
}> {
  if (!isStreamProxyConfigured()) {
    return { ok: false, elapsedMs: 0, error: "MediaFlow env not configured" };
  }

  const trimmedBaseUrl = trimMediaflowBaseUrl(MEDIAFLOW_PROXY_URL);
  const startedAt = Date.now();

  try {
    const { data, status } = await mediaflowAxios.get(`${trimmedBaseUrl}/health`);

    return {
      ok: status >= 200 && status < 300,
      status,
      body: typeof data === "string" ? data : JSON.stringify(data),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Smoke/diagnostic: probe first bytes from a proxied playback URL. */
export async function probeProxiedPlaybackBytes(
  proxiedUrl: string,
  params?: { timeoutMs?: number; rangeBytes?: number; apiPassword?: string },
): Promise<{
  ok: boolean;
  status?: number;
  bytesReceived: number;
  contentType?: string;
  elapsedMs: number;
  error?: string;
}> {
  const timeoutMs = params?.timeoutMs ?? 30_000;
  const rangeEnd = params?.rangeBytes ?? 65_535;
  const apiPassword = params?.apiPassword ?? MEDIAFLOW_PROXY_API_PASSWORD;
  const startedAt = Date.now();
  const requestHeaders: Record<string, string> = {
    Range: `bytes=0-${rangeEnd}`,
  };

  if (apiPassword !== "") {
    requestHeaders["x-authorization"] = `Bearer ${apiPassword}`;
  }

  try {
    const response = await mediaflowAxios.get(proxiedUrl, {
      timeout: timeoutMs,
      responseType: "arraybuffer",
      headers: requestHeaders,
      validateStatus: () => {
        return true;
      },
    });

    const bytesReceived = response.data instanceof ArrayBuffer ? response.data.byteLength : 0;
    const contentType =
      typeof response.headers["content-type"] === "string"
        ? response.headers["content-type"]
        : undefined;

    return {
      ok: response.status >= 200 && response.status < 400 && bytesReceived > 0,
      status: response.status,
      bytesReceived,
      contentType,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      bytesReceived: 0,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
