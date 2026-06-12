import _isArray from "lodash/isArray";
import _map from "lodash/map";
import type { MetaDetail, Stream } from "stremio-addon-sdk";

import { filenameFromPlaybackUrl, isProxiablePlaybackUrl } from "@/utils/streamProxy.utils";

export type ProxiablePlaybackUrlFromStream = {
  index: number;
  url: string;
  filename: string;
};

export type ProxiablePlaybackUrlFromMeta = {
  videoIndex: number;
  streamIndex: number;
  url: string;
  filename: string;
};

export function applyNotWebReadyToStreams(streams: Stream[]): Stream[] {
  return _map(streams, (stream) => {
    if (typeof stream?.url !== "string") {
      return stream;
    }

    return {
      ...stream,
      behaviorHints: {
        ...stream.behaviorHints,
        notWebReady: true,
      },
    };
  });
}

export function applyNotWebReadyToMeta(meta: MetaDetail): MetaDetail {
  if (!_isArray(meta.videos)) {
    return meta;
  }

  const videos = _map(meta.videos, (video) => {
    if (!_isArray(video?.streams)) {
      return video;
    }

    const streams = applyNotWebReadyToStreams(video.streams);

    return { ...video, streams };
  });

  return { ...meta, videos };
}

export function collectProxiablePlaybackUrlsFromStreams(
  streams: Stream[],
): ProxiablePlaybackUrlFromStream[] {
  const collected: ProxiablePlaybackUrlFromStream[] = [];

  for (let index = 0; index < streams.length; index += 1) {
    const stream = streams[index];
    const playbackUrl = stream?.url;

    if (typeof playbackUrl !== "string" || !isProxiablePlaybackUrl(playbackUrl)) {
      continue;
    }

    collected.push({
      index,
      url: playbackUrl,
      filename: filenameFromPlaybackUrl(playbackUrl),
    });
  }

  return collected;
}

export function applyProxiedUrlsToStreams(
  streams: Stream[],
  proxiedByIndex: Map<number, string>,
): Stream[] {
  if (proxiedByIndex.size === 0) {
    return streams;
  }

  return _map(streams, (stream, index) => {
    const proxiedUrl = proxiedByIndex.get(index);

    if (!proxiedUrl) {
      return stream;
    }

    return { ...stream, url: proxiedUrl };
  });
}

export function collectProxiablePlaybackUrlsFromMeta(
  meta: MetaDetail,
): ProxiablePlaybackUrlFromMeta[] {
  const collected: ProxiablePlaybackUrlFromMeta[] = [];
  const videos = meta.videos;

  if (!_isArray(videos)) {
    return collected;
  }

  for (let videoIndex = 0; videoIndex < videos.length; videoIndex += 1) {
    const video = videos[videoIndex];
    const videoStreams = video?.streams;

    if (!_isArray(videoStreams)) {
      continue;
    }

    for (let streamIndex = 0; streamIndex < videoStreams.length; streamIndex += 1) {
      const stream = videoStreams[streamIndex];
      const playbackUrl = stream?.url;

      if (typeof playbackUrl !== "string" || !isProxiablePlaybackUrl(playbackUrl)) {
        continue;
      }

      collected.push({
        videoIndex,
        streamIndex,
        url: playbackUrl,
        filename: filenameFromPlaybackUrl(playbackUrl),
      });
    }
  }

  return collected;
}

function metaStreamKey(videoIndex: number, streamIndex: number): string {
  return `${videoIndex}:${streamIndex}`;
}

export function applyProxiedUrlsToMeta(meta: MetaDetail, proxied: Map<string, string>): MetaDetail {
  if (proxied.size === 0 || !_isArray(meta.videos)) {
    return meta;
  }

  const videos = _map(meta.videos, (video, videoIndex) => {
    if (!_isArray(video?.streams)) {
      return video;
    }

    const streams = _map(video.streams, (stream, streamIndex) => {
      const proxiedUrl = proxied.get(metaStreamKey(videoIndex, streamIndex));

      if (!proxiedUrl) {
        return stream;
      }

      return { ...stream, url: proxiedUrl };
    });

    return { ...video, streams };
  });

  return { ...meta, videos };
}
