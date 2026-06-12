import _forEach from "lodash/forEach";
import _map from "lodash/map";
import {
  applyNotWebReadyToMeta,
  applyNotWebReadyToStreams,
  applyProxiedUrlsToMeta,
  applyProxiedUrlsToStreams,
  collectProxiablePlaybackUrlsFromMeta,
  collectProxiablePlaybackUrlsFromStreams,
} from "@/factories/streamProxy.factory";
import { fetchMediaflowProxiedUrls } from "@/services/mediaflowProxy.services";
import { dlog, logInfo } from "@/utils/debug.utils";
import {
  isStreamProxyActive,
  isStreamProxyConfigured,
  redactPlaybackUrlForLog,
  summarizeProxiedUrlForLog,
} from "@/utils/streamProxy.utils";
import type { MetaDetail, Stream } from "stremio-addon-sdk";

export async function applyProxyToStremioStreams(
  streams: Stream[],
  params: { hasProxy: boolean },
): Promise<Stream[]> {
  const streamCount = streams.length;
  const proxyActive = isStreamProxyActive(params.hasProxy);

  logInfo("stream proxy", "applyProxyToStremioStreams", {
    streamCount,
    hasProxy: params.hasProxy,
    configured: isStreamProxyConfigured(),
    active: proxyActive,
  });

  if (!proxyActive) {
    dlog("[STREAM PROXY] inactive — applying notWebReady", { streamCount });
    return applyNotWebReadyToStreams(streams);
  }

  const proxiableUrls = collectProxiablePlaybackUrlsFromStreams(streams);

  logInfo("stream proxy", "collected proxiable stream URLs", {
    proxiableCount: proxiableUrls.length,
    streamCount,
  });

  dlog(
    "[STREAM PROXY] proxiable destinations",
    _map(proxiableUrls, (entry) => {
      return {
        index: entry.index,
        filename: entry.filename,
        url: redactPlaybackUrlForLog(entry.url),
      };
    }),
  );

  if (proxiableUrls.length === 0) {
    return streams;
  }

  const proxiedUrls = await fetchMediaflowProxiedUrls(
    proxiableUrls.map((entry) => {
      return {
        destinationUrl: entry.url,
        filename: entry.filename,
      };
    }),
  );

  const proxiedByIndex = new Map<number, string>();

  _forEach(proxiableUrls, (entry, index) => {
    proxiedByIndex.set(entry.index, proxiedUrls[index]);
  });

  const rewrittenCount = proxiedByIndex.size;

  logInfo("stream proxy", "rewrote stream playback URLs", {
    rewrittenCount,
    samples: _map([...proxiedByIndex.entries()].slice(0, 3), ([index, url]) => {
      return { index, proxied: summarizeProxiedUrlForLog(url) };
    }),
  });

  return applyProxiedUrlsToStreams(streams, proxiedByIndex);
}

export async function applyProxyToMetaDetail(
  meta: MetaDetail,
  params: { hasProxy: boolean },
): Promise<MetaDetail> {
  const videoCount = meta.videos?.length ?? 0;
  const proxyActive = isStreamProxyActive(params.hasProxy);

  logInfo("stream proxy", "applyProxyToMetaDetail", {
    metaId: meta.id,
    videoCount,
    hasProxy: params.hasProxy,
    configured: isStreamProxyConfigured(),
    active: proxyActive,
  });

  if (!proxyActive) {
    dlog("[STREAM PROXY] inactive meta — applying notWebReady", { metaId: meta.id, videoCount });
    return applyNotWebReadyToMeta(meta);
  }

  const proxiableUrls = collectProxiablePlaybackUrlsFromMeta(meta);

  logInfo("stream proxy", "collected proxiable meta stream URLs", {
    metaId: meta.id,
    proxiableCount: proxiableUrls.length,
    videoCount,
  });

  dlog(
    "[STREAM PROXY] meta proxiable destinations",
    _map(proxiableUrls, (entry) => {
      return {
        videoIndex: entry.videoIndex,
        streamIndex: entry.streamIndex,
        filename: entry.filename,
        url: redactPlaybackUrlForLog(entry.url),
      };
    }),
  );

  if (proxiableUrls.length === 0) {
    return meta;
  }

  const proxiedUrls = await fetchMediaflowProxiedUrls(
    proxiableUrls.map((entry) => {
      return {
        destinationUrl: entry.url,
        filename: entry.filename,
      };
    }),
  );

  const proxiedByKey = new Map<string, string>();

  _forEach(proxiableUrls, (entry, index) => {
    const key = `${entry.videoIndex}:${entry.streamIndex}`;
    proxiedByKey.set(key, proxiedUrls[index]);
  });

  logInfo("stream proxy", "rewrote meta embedded stream URLs", {
    metaId: meta.id,
    rewrittenCount: proxiedByKey.size,
  });

  return applyProxiedUrlsToMeta(meta, proxiedByKey);
}
