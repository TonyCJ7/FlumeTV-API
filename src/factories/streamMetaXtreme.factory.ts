import _compact from "lodash/compact";
import _find from "lodash/find";
import _flatMap from "lodash/flatMap";
import _get from "lodash/get";
import _isArray from "lodash/isArray";
import _isEmpty from "lodash/isEmpty";
import _map from "lodash/map";
import _size from "lodash/size";
import _sortBy from "lodash/sortBy";
import _split from "lodash/split";
import _take from "lodash/take";
import _toNumber from "lodash/toNumber";
import _toString from "lodash/toString";
import _trim from "lodash/trim";
import _toUpper from "lodash/toUpper";
import _replace from "lodash/replace";
import _isString from "lodash/isString";
import type {
  ContentType,
  MetaDetail,
  MetaLink,
  MetaVideo,
  Stream as StremioPlaybackStream,
} from "stremio-addon-sdk";

import { ADDON_STREAM_TYPE, ID_PREFIX, STREMIO_STREAM_TYPE } from "@/constants/stream.constants";
import { StreamWithConfig } from "@/types/stream.types";
import type {
  XtremeEpisode,
  XtremeMediaInfo,
  XtremeMoviePayload,
  XtremeSeriesPayload,
} from "@/types/xtremeMeta.types";
import { encodeStremioIdPayload } from "@/utils/builder.utils";
import {
  extractYouTubeVideoId,
  firstValidImageUrl,
  isNonEmptyStringLike,
  normalizeImdbRatingForMeta,
  parseReleaseTimestampToIso,
  stremioPlaybackStreamFromUrl,
} from "@/utils/metaDetails.utils";
import {
  buildXtreamPlaybackUrl,
  resolveLiveContainerExtension,
  resolvedContainerExtension,
} from "@/utils/xtreamMeta.utils";

function metaReleasedFieldFromXtremeInfo(info: XtremeMediaInfo): string | undefined {
  const releaseRaw = _find([info.releaseDate, info.releasedate], isNonEmptyStringLike);

  if (!releaseRaw) {
    return undefined;
  }

  const releaseAsString = _toString(releaseRaw);

  return parseReleaseTimestampToIso(releaseAsString);
}

function metaRuntimeLabelFromXtremeInfo(info: XtremeMediaInfo): string | undefined {
  const durationSeconds = info.duration_secs;

  if (durationSeconds && durationSeconds > 0) {
    return `${Math.round(durationSeconds / 60)}m`;
  }

  const episodeRunAsString = _toString(info.episode_run_time);
  const episodeRunRaw = _trim(episodeRunAsString);
  const episodeMinutes = episodeRunRaw ? parseInt(episodeRunRaw, 10) : 0;

  if (Number.isFinite(episodeMinutes) && episodeMinutes > 0) {
    return `${episodeMinutes}m`;
  }

  return info.duration || undefined;
}

function metaRuntimeLabelFromXtremeEpisode(episode: XtremeEpisode): string | undefined {
  const episodeInfo = episode.info;

  if (!episodeInfo) {
    return undefined;
  }

  return metaRuntimeLabelFromXtremeInfo({
    duration_secs: episodeInfo.duration_secs,
    duration: episodeInfo.duration,
  });
}

function commaSeparatedFieldToMetaLinks(text: string | undefined, category: string): MetaLink[] {
  const textAsString = _toString(text);
  const splitTokens = _split(textAsString, /,\s*/);
  const trimmedTokens = _map(splitTokens, (token) => {
    return _trim(token);
  });
  const nonEmptyTokens = _compact(trimmedTokens);
  const labels = _take(nonEmptyTokens, 24);

  return _map(labels, (label) => {
    const encodedQuery = encodeURIComponent(label);

    return {
      name: label,
      category,
      url: `https://www.google.com/search?q=${encodedQuery}`,
    };
  });
}

function buildStremioLinksFromMediaInfo(info: XtremeMediaInfo): MetaLink[] {
  const castAsString = _toString(info.cast);
  const castTrimmed = _trim(castAsString);
  const actorsAsString = _toString(info.actors);
  const actorsTrimmed = _trim(actorsAsString);
  const actorSource = castTrimmed || actorsTrimmed;

  return [
    ...commaSeparatedFieldToMetaLinks(info.director, "director"),
    ...commaSeparatedFieldToMetaLinks(actorSource || undefined, "actor"),
    // ...commaSeparatedFieldToMetaLinks(info.genre, "genre"),
  ];
}

function parseGenresListFromMediaInfo(info: XtremeMediaInfo): string[] | undefined {
  const genreAsString = _toString(info.genre);
  const splitTokens = _split(genreAsString, /,\s*/);
  const trimmedParts = _map(splitTokens, (token) => {
    return _trim(token);
  });
  const parts = _compact(trimmedParts);

  if (_isEmpty(parts)) {
    return undefined;
  }

  return parts;
}

function getEpisodeReleasedIso(episode: XtremeEpisode): string {
  const sources = [episode.info?.releasedate, episode.info?.releaseDate];

  const isoCandidates = _map(sources, (raw) => {
    return parseReleaseTimestampToIso(raw);
  });

  return _find(isoCandidates, Boolean) || "";
}

function buildMetaVideosForSeriesPayload(
  payload: XtremeSeriesPayload,
  parsedId: string | number,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): Partial<MetaVideo>[] {
  const episodeRows = _flatMap(payload.episodes, (episodeList, seasonKey) => {
    const episodes = _isArray(episodeList) ? episodeList : [];

    return _map(episodes, (episode) => {
      const seasonFromEpisode = episode.season;
      const seasonFromInfo = _get(episode, "info.season");
      const seasonFallback = seasonFromEpisode ?? seasonFromInfo ?? seasonKey;
      const seasonAsNumber = _toNumber(seasonFallback);
      const seasonNumber = seasonAsNumber || 0;

      return {
        episode,
        seasonNumber,
      };
    });
  });

  const sortedRows = _sortBy(episodeRows, [
    (row) => {
      return row.seasonNumber;
    },
    (row) => {
      const episodeNum = row.episode.episode_num;
      const num = _toNumber(episodeNum);

      return num || 0;
    },
  ]);

  return _map(sortedRows, ({ episode, seasonNumber }) => {
    const thumbnailUrl = firstValidImageUrl(
      episode.info?.movie_image,
      episode.info?.cover,
      episode.info?.cover_big,
    );
    const releasedIso = getEpisodeReleasedIso(episode);

    const titleAsString = _toString(episode.title);
    const titleTrimmed = _trim(titleAsString);
    const streamIdFromMetaEpisode = _trim(_toString(episode.id));
    const encodedStreamPart = encodeStremioIdPayload({
      id: _toString(parsedId),
      stream_id: _toString(streamWithConfig.stream_id),
      video_id: streamIdFromMetaEpisode,
    });
    const metaVideoId = `${ID_PREFIX}${encodedStreamPart}`;
    const episodePlot = episode.info?.plot || episode.info?.description || "";
    const episodeNum = _toNumber(episode.episode_num);
    const episodeRuntimeLabel = metaRuntimeLabelFromXtremeEpisode(episode);
    const seriesEpisodeRunFallback = payload.info
      ? metaRuntimeLabelFromXtremeInfo({
          episode_run_time: payload.info.episode_run_time,
        })
      : undefined;
    const runtimeLabel = episodeRuntimeLabel || seriesEpisodeRunFallback;
    const hasValidEpisodeStreamId = !_isEmpty(streamIdFromMetaEpisode);

    let embeddedStreams: StremioPlaybackStream[] | undefined;

    if (hasValidEpisodeStreamId) {
      const containerRaw = resolvedContainerExtension(episode.container_extension);
      const containerExt = !_isEmpty(_trim(containerRaw)) ? containerRaw : "mp4";
      const playableUrl = buildXtreamPlaybackUrl(
        streamWithConfig,
        ADDON_STREAM_TYPE.SERIES,
        streamIdFromMetaEpisode,
        containerExt,
      );
      const streamName = _toUpper(containerExt);
      const playbackStream = stremioPlaybackStreamFromUrl(playableUrl, streamName);

      embeddedStreams = [playbackStream];
    }

    return {
      id: metaVideoId,
      title: !_isEmpty(titleTrimmed) ? titleTrimmed : `Episode ${episode.episode_num}`,
      ...(releasedIso ? { released: releasedIso } : {}),
      season: seasonNumber,
      ...(episodeNum ? { episode: episodeNum } : {}),
      ...(episodePlot ? { overview: episodePlot } : {}),
      ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
      ...(runtimeLabel ? { runtime: runtimeLabel } : {}),
      // ...(trailerYouTubeId ? { trailer: trailerYouTubeId } : {}),
      ...(embeddedStreams ? { streams: embeddedStreams } : {}),
    };
  });
}

function getCommonMetaDetail(
  stream: StreamWithConfig["XtremeConfig"],
  mediaInfo: XtremeMediaInfo,
): Omit<MetaDetail, "type" | "id"> {
  const mediaNameRaw = _toString(mediaInfo.name) || _toString(stream.name);
  const nameFromInfo = _trim(mediaNameRaw);
  const displayName = nameFromInfo || "Unknown";

  const plot =
    _trim(_toString(mediaInfo.plot)) ||
    _trim(_toString(mediaInfo.description)) ||
    _trim(_toString(stream.description));
  const descriptionText = plot || "";

  const trailerYouTubeId = extractYouTubeVideoId(mediaInfo.youtube_trailer);

  const stremioLinks = buildStremioLinksFromMediaInfo(mediaInfo);
  const posterUrl = firstValidImageUrl(
    stream.stream_icon,
    mediaInfo.cover,
    mediaInfo.cover_big,
    mediaInfo.movie_image,
  );

  const backdropPath = mediaInfo.backdrop_path;
  const isBackdropPathArray = _isArray(backdropPath);

  const backdropPaths = isBackdropPathArray
    ? backdropPath
    : _isString(backdropPath)
      ? [backdropPath]
      : [];
  const backgroundUrl = firstValidImageUrl(
    mediaInfo?.cover,
    mediaInfo.cover_big,
    mediaInfo.movie_image,
    ...backdropPaths,
  );
  const genreList = parseGenresListFromMediaInfo(mediaInfo);
  const releasedIso = metaReleasedFieldFromXtremeInfo(mediaInfo);
  const imdbRating = normalizeImdbRatingForMeta(mediaInfo.rating);

  return {
    name: displayName,
    ...(genreList ? { genres: genreList } : {}),
    ...(posterUrl ? { poster: posterUrl } : {}),
    ...(backgroundUrl ? { background: backgroundUrl } : {}),
    ...(descriptionText ? { description: descriptionText } : {}),
    ...(imdbRating ? { imdbRating } : {}),
    ...(releasedIso ? { released: releasedIso } : {}),
    ...(trailerYouTubeId ? { source: trailerYouTubeId, type: "Trailer" } : {}),
    ...(stremioLinks.length ? { links: stremioLinks } : {}),
  };
}

function getMovieMetaDetail(
  stremioId: string,
  parsedId: string,
  payload: XtremeMoviePayload,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): MetaDetail {
  const mediaInfo = _get(payload, "info");
  const commonMetaDetail = getCommonMetaDetail(streamWithConfig, mediaInfo ?? {});
  const moviePayload = payload;

  const mediaNameRaw = _toString(commonMetaDetail.name);
  const movieDataNameRaw = _get(moviePayload, "movie_data.name");
  const movieDataNameString = _toString(movieDataNameRaw);
  const nameFromMovieData = _trim(movieDataNameString);
  const displayName = mediaNameRaw || nameFromMovieData || "Unknown";

  const runtimeLabel = metaRuntimeLabelFromXtremeInfo(mediaInfo || {});

  const movieData = moviePayload?.movie_data;
  const movieStreamIdRaw =
    _trim(_toString(movieData?.stream_id)) || _trim(_toString(streamWithConfig.stream_id));
  const hasMovieStreamId = !_isEmpty(movieStreamIdRaw);

  const containerExtension =
    resolvedContainerExtension(movieData?.container_extension) ||
    resolvedContainerExtension(streamWithConfig.container_extension);

  let movieVideos: Partial<MetaVideo>[] | undefined;

  if (hasMovieStreamId && containerExtension) {
    const playableUrl = buildXtreamPlaybackUrl(
      streamWithConfig,
      "movie",
      movieStreamIdRaw,
      containerExtension,
    );
    const playbackStream = stremioPlaybackStreamFromUrl(playableUrl, commonMetaDetail.name);
    const movieVideoId = encodeStremioIdPayload({
      id: _toString(parsedId),
      stream_id: _toString(streamWithConfig.stream_id),
      video_id: _toString(movieStreamIdRaw),
    });

    const movieVideo: Partial<MetaVideo> = {
      id: `${ID_PREFIX}${movieVideoId}`,
      title: displayName,
      streams: [playbackStream],
    };

    if (commonMetaDetail.released) {
      movieVideo.released = commonMetaDetail.released;
    }

    if (commonMetaDetail.poster) {
      movieVideo.thumbnail = commonMetaDetail.poster;
    }

    movieVideos = [movieVideo];
  }

  const videosForMeta = movieVideos;
  const defaultVideoId = videosForMeta?.[0]?.id;

  return {
    ...commonMetaDetail,
    id: stremioId,
    type: STREMIO_STREAM_TYPE.MOVIE,
    name: displayName,
    ...(runtimeLabel ? { runtime: runtimeLabel } : {}),
    ...(videosForMeta?.length ? { videos: videosForMeta as MetaVideo[] } : {}),
    ...(defaultVideoId ? { behaviourHints: { defaultVideo: defaultVideoId } } : {}),
  };
}

function getSeriesMetaDetail(
  stremioId: string,
  parsedId: string,
  payload: XtremeSeriesPayload,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): MetaDetail {
  const mediaInfo = (_get(payload, "info") ?? {}) as XtremeMediaInfo;
  const commonMetaDetail = getCommonMetaDetail(streamWithConfig, mediaInfo);

  const movieDataNameRaw = _get(payload, "movie_data.name");
  const nameFromMovieData = _trim(_toString(movieDataNameRaw));
  const displayName = _trim(_toString(commonMetaDetail.name)) || nameFromMovieData || "Unknown";

  const hasEpisodes = payload.episodes && _size(payload.episodes) > 0;

  const episodeVideos = hasEpisodes
    ? buildMetaVideosForSeriesPayload(payload, parsedId, streamWithConfig)
    : undefined;

  const defaultVideoId = episodeVideos?.[0]?.id;

  return {
    ...commonMetaDetail,
    id: stremioId,
    type: STREMIO_STREAM_TYPE.SERIES,
    name: displayName,
    ...(episodeVideos?.length ? { videos: episodeVideos as MetaVideo[] } : {}),
    ...(defaultVideoId ? { behaviourHints: { defaultVideo: defaultVideoId } } : {}),
  };
}

function getLiveMetaDetail(
  stremioId: string,
  parsedId: string,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
  stremioContentType: typeof STREMIO_STREAM_TYPE.TV | typeof STREMIO_STREAM_TYPE.CHANNEL,
): MetaDetail {
  const commonMetaDetail = getCommonMetaDetail(streamWithConfig, {});

  const displayName = _trim(_toString(commonMetaDetail.name)) || "Unknown";

  const streamIdRaw = _trim(_toString(streamWithConfig.stream_id));
  const hasStreamId = !_isEmpty(streamIdRaw);

  const containerExtension = resolveLiveContainerExtension(streamWithConfig.container_extension);

  let liveVideos: Partial<MetaVideo>[] | undefined;

  if (hasStreamId) {
    const playableUrl = buildXtreamPlaybackUrl(
      streamWithConfig,
      ADDON_STREAM_TYPE.LIVE,
      streamIdRaw,
      containerExtension,
    );
    const playbackStream = stremioPlaybackStreamFromUrl(playableUrl, commonMetaDetail.name);
    const liveVideoId = encodeStremioIdPayload({
      id: _toString(parsedId),
      stream_id: _toString(streamWithConfig.stream_id),
      video_id: _toString(streamIdRaw),
    });
    liveVideos = [
      {
        id: `${ID_PREFIX}${liveVideoId}`,
        title: displayName,
        streams: [playbackStream],
        ...(commonMetaDetail.poster ? { thumbnail: commonMetaDetail.poster } : {}),
      },
    ];
  }

  const defaultVideoId = liveVideos?.[0]?.id;

  return {
    ...commonMetaDetail,
    id: stremioId,
    type: stremioContentType,
    name: displayName,
    ...(liveVideos?.length ? { videos: liveVideos as MetaVideo[] } : {}),
    ...(defaultVideoId ? { behaviourHints: { defaultVideo: defaultVideoId } } : {}),
  };
}

export function xtremeMetaDetailFactory(
  type: ContentType,
  encodedId: string,
  parsedId: string,
  streamMetaPayload: XtremeMoviePayload | XtremeSeriesPayload,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): MetaDetail {
  if (type === STREMIO_STREAM_TYPE.MOVIE) {
    return getMovieMetaDetail(encodedId, parsedId, streamMetaPayload, streamWithConfig);
  }
  if (type === STREMIO_STREAM_TYPE.SERIES) {
    return getSeriesMetaDetail(encodedId, parsedId, streamMetaPayload, streamWithConfig);
  }
  if (type === STREMIO_STREAM_TYPE.TV || type === STREMIO_STREAM_TYPE.CHANNEL) {
    return getLiveMetaDetail(encodedId, parsedId, streamWithConfig, type);
  }
  return {
    id: encodedId,
    type,
    name: streamWithConfig.name || "Unknown",
  };
}
