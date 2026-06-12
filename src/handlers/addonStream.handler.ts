import _flatMap from "lodash/flatMap";
import _find from "lodash/find";
import _isArray from "lodash/isArray";
import _isEmpty from "lodash/isEmpty";
import _isPlainObject from "lodash/isPlainObject";
import _toString from "lodash/toString";
import _trim from "lodash/trim";
import type { Cache, ContentType, Stream } from "stremio-addon-sdk";

import { CONFIG_TYPE, STREMIO_STREAM_TYPE } from "@/constants/stream.constants";
import { applyProxyToStremioStreams } from "@/core/applyStreamProxy";
import { getStreamAndConfigById } from "@/database/common.db";
import { getEpisodeRow } from "@/database/meta.db";
import { getUserHasProxy } from "@/database/user.db";
import {
  directStreamPlaybackFactory,
  xtremeStreamPlaybackFactory,
} from "@/factories/streamPlayback.factory";
import { streamWithConfigFromDbRow } from "@/factories/streamWithConfig.factory";
import { fetchXtremeSeriesInfo, fetchXtremeVodInfo } from "@/services/xtreamMeta.services";
import type { StreamWithConfig } from "@/types/stream.types";
import type {
  XtremeEpisode,
  XtremeMoviePayload,
  XtremeSeriesPayload,
} from "@/types/xtremeMeta.types";
import { decodeStremioIdPayload } from "@/utils/builder.utils";
import { decodeToken } from "@/utils/crypto.utils";
import { dlog, logError, logWarn } from "@/utils/debug.utils";
import { resolvedContainerExtension } from "@/utils/xtreamMeta.utils";

function findXtremeEpisodeByVideoId(
  payload: XtremeSeriesPayload,
  videoId: string,
): XtremeEpisode | undefined {
  const episodeRows = _flatMap(payload.episodes, (episodeList) => {
    return _isArray(episodeList) ? episodeList : [];
  });

  return _find(episodeRows, (episode) => {
    return _trim(_toString(episode.id)) === videoId;
  });
}

async function handleDirectStream(
  streamWithConfig: StreamWithConfig["DirectConfig"],
  type: ContentType,
  parsedId: string,
  videoId?: string,
): Promise<{ streams: Stream[] } & Partial<Cache>> {
  if (type === STREMIO_STREAM_TYPE.SERIES) {
    const episodeVideoId = _trim(_toString(videoId));

    if (_isEmpty(episodeVideoId)) {
      return { streams: [] };
    }

    const episode = await getEpisodeRow(episodeVideoId, parsedId);

    if (!episode) {
      dlog("[STREAM] Direct series episode not found", { parsedId, episodeVideoId });
      return { streams: [] };
    }

    const streams = directStreamPlaybackFactory(type, streamWithConfig, episode);

    if (_isEmpty(streams)) {
      return { streams: [] };
    }

    return { streams, cacheMaxAge: 3600 };
  }

  const streams = directStreamPlaybackFactory(type, streamWithConfig);

  if (_isEmpty(streams)) {
    return { streams: [] };
  }

  return { streams, cacheMaxAge: 3600 };
}

async function fetchXtremeMoviePayloadForStream(
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): Promise<XtremeMoviePayload | undefined> {
  const xtremeUrl = streamWithConfig.xtreme_url;
  const { username, password } = streamWithConfig;

  if (!xtremeUrl || !username || !password) {
    return undefined;
  }

  try {
    const providerContentId = _toString(streamWithConfig.stream_id);
    const payload = await fetchXtremeVodInfo(xtremeUrl, username, password, providerContentId);

    if (!_isPlainObject(payload)) {
      return undefined;
    }

    return payload;
  } catch (error) {
    logError("addon stream", "Failed to fetch Xtream VOD info", error);
    dlog("[STREAM] Failed to fetch Xtream VOD info", error);

    return undefined;
  }
}

async function fetchXtremeSeriesPayloadForStream(
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): Promise<XtremeSeriesPayload | undefined> {
  const xtremeUrl = streamWithConfig.xtreme_url;
  const { username, password } = streamWithConfig;

  if (!xtremeUrl || !username || !password) {
    return undefined;
  }

  try {
    const providerContentId = _toString(streamWithConfig.stream_id);
    const payload = await fetchXtremeSeriesInfo(xtremeUrl, username, password, providerContentId);

    if (!_isPlainObject(payload)) {
      return undefined;
    }

    return payload;
  } catch (error) {
    logError("addon stream", "Failed to fetch Xtream series info", error);
    dlog("[STREAM] Failed to fetch Xtream series info", error);

    return undefined;
  }
}

async function handleXtremeStream(
  streamWithConfig: StreamWithConfig["XtremeConfig"],
  type: ContentType,
  playbackKey: string,
  videoId?: string,
): Promise<{ streams: Stream[] } & Partial<Cache>> {
  const xtremeUrl = streamWithConfig.xtreme_url;
  const { username, password } = streamWithConfig;

  if (!xtremeUrl || !username || !password) {
    dlog("[STREAM] Invalid xtream playback. Missing credentials or host");
    return { streams: [] };
  }

  const isLiveStremioType = type === STREMIO_STREAM_TYPE.TV || type === STREMIO_STREAM_TYPE.CHANNEL;

  if (isLiveStremioType) {
    const streams = xtremeStreamPlaybackFactory(type, streamWithConfig, playbackKey);

    if (_isEmpty(streams)) {
      return { streams: [] };
    }

    return { streams, cacheMaxAge: 3600 };
  }

  if (type === STREMIO_STREAM_TYPE.MOVIE) {
    const rowExtension = resolvedContainerExtension(streamWithConfig.container_extension);
    let moviePayload: XtremeMoviePayload | undefined;

    if (_isEmpty(rowExtension)) {
      moviePayload = await fetchXtremeMoviePayloadForStream(streamWithConfig);
    }

    const streams = xtremeStreamPlaybackFactory(type, streamWithConfig, playbackKey, moviePayload);

    if (_isEmpty(streams)) {
      return { streams: [] };
    }

    return { streams, cacheMaxAge: 3600 };
  }

  if (type === STREMIO_STREAM_TYPE.SERIES) {
    const episodeVideoId = _trim(_toString(videoId));

    if (_isEmpty(episodeVideoId)) {
      return { streams: [] };
    }

    const seriesPayload = await fetchXtremeSeriesPayloadForStream(streamWithConfig);
    const episode = seriesPayload
      ? findXtremeEpisodeByVideoId(seriesPayload, episodeVideoId)
      : undefined;
    const episodeContainerExtension = episode?.container_extension;

    const streams = xtremeStreamPlaybackFactory(
      type,
      streamWithConfig,
      playbackKey,
      undefined,
      episodeContainerExtension,
    );

    if (_isEmpty(streams)) {
      return { streams: [] };
    }

    return { streams, cacheMaxAge: 3600 };
  }

  return { streams: [] };
}

async function wrapStreamResponseWithProxy(
  userId: string,
  result: { streams: Stream[] } & Partial<Cache>,
): Promise<{ streams: Stream[] } & Partial<Cache>> {
  const hasProxy = await getUserHasProxy(userId);

  dlog("[STREAM PROXY] wrapStreamResponseWithProxy", {
    userId,
    hasProxy,
    streamCount: result.streams?.length ?? 0,
  });

  const proxiedStreams = await applyProxyToStremioStreams(result.streams ?? [], { hasProxy });

  return { ...result, streams: proxiedStreams };
}

export async function addonStreamHandler(args: {
  type: ContentType;
  id: string;
  config?: string;
}): Promise<{ streams: Stream[] } & Partial<Cache>> {
  try {
    const config_hash = args.config ?? "";
    const { type, id: encodedId } = args;
    const parsedStremioId = decodeStremioIdPayload(encodedId);
    const { id, stream_id, video_id } = parsedStremioId;

    if (_isEmpty(config_hash)) {
      logWarn("addon stream", "Invalid config token");
      dlog("[STREAM] Invalid config token");
      return { streams: [] };
    }

    const sessionPayload = decodeToken(config_hash);
    const userId =
      sessionPayload && typeof sessionPayload.uuid === "string" ? sessionPayload.uuid : "";

    if (!userId) {
      logWarn("addon stream", "Invalid config token, missing uuid");
      dlog("[STREAM] Invalid config token, missing uuid");
      return { streams: [] };
    }

    if (!id || !stream_id) {
      logWarn("addon stream", "Invalid id payload", { id, stream_id, video_id });
      dlog(`[STREAM] Invalid id or stream_id, ${id}, ${stream_id}`);
      return { streams: [] };
    }

    const isSeriesType = type === STREMIO_STREAM_TYPE.SERIES;
    const videoIdTrimmed = _trim(_toString(video_id));

    if (isSeriesType && _isEmpty(videoIdTrimmed)) {
      logWarn("addon stream", "Series stream requires video_id", { id, stream_id, video_id });
      dlog("[STREAM] Series stream requires video_id");
      return { streams: [] };
    }

    const playbackKey = videoIdTrimmed || _trim(_toString(stream_id));
    const parsedId = _toString(id);
    const streamWithConfig = streamWithConfigFromDbRow(
      await getStreamAndConfigById(parsedId, type, userId),
    );
    const configType = streamWithConfig.config_type;

    if (configType === CONFIG_TYPE.DIRECT) {
      dlog("[STREAM] Building direct playback");
      return wrapStreamResponseWithProxy(
        userId,
        await handleDirectStream(
          streamWithConfig as StreamWithConfig["DirectConfig"],
          type,
          parsedId,
          video_id,
        ),
      );
    }

    if (configType === CONFIG_TYPE.XTREME) {
      dlog("[STREAM] Building xtreme playback");
      return wrapStreamResponseWithProxy(
        userId,
        await handleXtremeStream(
          streamWithConfig as StreamWithConfig["XtremeConfig"],
          type,
          playbackKey,
          video_id,
        ),
      );
    }

    dlog("[STREAM] No playback branch for config_type", {
      parsedId,
      configType,
      stremioType: type,
    });

    return { streams: [] };
  } catch (error) {
    logError("addon stream", "Handler error", error);
    dlog("[STREAM] Error", error);

    return { streams: [] };
  }
}
