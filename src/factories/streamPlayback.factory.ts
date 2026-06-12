import _isEmpty from "lodash/isEmpty";
import _toString from "lodash/toString";
import _trim from "lodash/trim";
import _toUpper from "lodash/toUpper";
import type { ContentType, Stream } from "stremio-addon-sdk";

import { ADDON_STREAM_TYPE, STREMIO_STREAM_TYPE } from "@/constants/stream.constants";
import type { SeriesEpisode, StreamWithConfig } from "@/types/stream.types";
import type { XtremeMoviePayload } from "@/types/xtremeMeta.types";
import { stremioPlaybackStreamFromUrl } from "@/utils/metaDetails.utils";
import {
  buildXtreamPlaybackUrl,
  resolveLiveContainerExtension,
  resolvedContainerExtension,
} from "@/utils/xtreamMeta.utils";

function directStreamLabel(
  streamWithConfig: StreamWithConfig["DirectConfig"],
  episode?: SeriesEpisode,
): string {
  if (episode) {
    const episodeName = _trim(_toString(episode.full_name)) || _trim(_toString(episode.title));

    if (!_isEmpty(episodeName)) {
      return episodeName;
    }
  }

  const nameRaw =
    _trim(_toString(streamWithConfig.name)) || _trim(_toString(streamWithConfig.full_name));

  return !_isEmpty(nameRaw) ? nameRaw : "Unknown";
}

export function directStreamPlaybackFactory(
  type: ContentType,
  streamWithConfig: StreamWithConfig["DirectConfig"],
  episode?: SeriesEpisode,
): Stream[] {
  if (type === STREMIO_STREAM_TYPE.SERIES) {
    if (!episode) {
      return [];
    }

    const urlRaw = _trim(_toString(episode.url));

    if (_isEmpty(urlRaw)) {
      return [];
    }

    const label = directStreamLabel(streamWithConfig, episode);

    return [stremioPlaybackStreamFromUrl(urlRaw, label)];
  }

  const isLiveOrMovie =
    type === STREMIO_STREAM_TYPE.TV ||
    type === STREMIO_STREAM_TYPE.CHANNEL ||
    type === STREMIO_STREAM_TYPE.MOVIE;

  if (!isLiveOrMovie) {
    return [];
  }

  const urlRaw = _trim(_toString(streamWithConfig.url));

  if (_isEmpty(urlRaw)) {
    return [];
  }

  const label = directStreamLabel(streamWithConfig);

  return [stremioPlaybackStreamFromUrl(urlRaw, label)];
}

export function xtremeStreamPlaybackFactory(
  type: ContentType,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
  playbackKey: string,
  moviePayload?: XtremeMoviePayload,
  episodeContainerExtension?: string,
): Stream[] {
  const xtremeUrl = streamWithConfig.xtreme_url;
  const { username, password } = streamWithConfig;

  if (!xtremeUrl || !username || !password) {
    return [];
  }

  const streamKey = _trim(_toString(playbackKey));

  if (_isEmpty(streamKey)) {
    return [];
  }

  const nameRaw =
    _trim(_toString(streamWithConfig.name)) || _trim(_toString(streamWithConfig.full_name));
  const displayName = !_isEmpty(nameRaw) ? nameRaw : "Unknown";

  if (type === STREMIO_STREAM_TYPE.TV || type === STREMIO_STREAM_TYPE.CHANNEL) {
    const containerExtension = resolveLiveContainerExtension(streamWithConfig.container_extension);

    const liveStreamId = _trim(_toString(streamWithConfig.stream_id));
    const playableUrl = buildXtreamPlaybackUrl(
      streamWithConfig,
      ADDON_STREAM_TYPE.LIVE,
      liveStreamId,
      containerExtension,
    );

    return [stremioPlaybackStreamFromUrl(playableUrl, displayName)];
  }

  if (type === STREMIO_STREAM_TYPE.MOVIE) {
    let containerExtension = resolvedContainerExtension(streamWithConfig.container_extension);

    const movieDataExtension = moviePayload?.movie_data?.container_extension;
    const resolvedFromPayload = resolvedContainerExtension(movieDataExtension);

    if (!_isEmpty(resolvedFromPayload)) {
      containerExtension = resolvedFromPayload;
    }

    if (_isEmpty(containerExtension)) {
      return [];
    }

    const playableUrl = buildXtreamPlaybackUrl(
      streamWithConfig,
      ADDON_STREAM_TYPE.MOVIE,
      streamKey,
      containerExtension,
    );

    return [stremioPlaybackStreamFromUrl(playableUrl, displayName)];
  }

  if (type === STREMIO_STREAM_TYPE.SERIES) {
    const containerRaw = resolvedContainerExtension(episodeContainerExtension);
    const containerExtension = !_isEmpty(_trim(containerRaw)) ? containerRaw : "mp4";
    const playableUrl = buildXtreamPlaybackUrl(
      streamWithConfig,
      ADDON_STREAM_TYPE.SERIES,
      streamKey,
      containerExtension,
    );
    const streamName = _toUpper(containerExtension);

    return [stremioPlaybackStreamFromUrl(playableUrl, streamName)];
  }

  return [];
}
