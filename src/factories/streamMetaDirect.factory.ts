import _isEmpty from "lodash/isEmpty";
import _map from "lodash/map";
import _sortBy from "lodash/sortBy";
import _toString from "lodash/toString";
import _trim from "lodash/trim";
import type { ContentType, MetaDetail, MetaVideo } from "stremio-addon-sdk";

import { ID_PREFIX, STREMIO_STREAM_TYPE } from "@/constants/stream.constants";
import type { SeriesEpisode, StreamWithConfig } from "@/types/stream.types";
import { encodeStremioIdPayload } from "@/utils/builder.utils";
import {
  firstValidImageUrl,
  normalizeImdbRatingForMeta,
  stremioPlaybackStreamFromUrl,
} from "@/utils/metaDetails.utils";

function commonDirectMetaDetailFields(
  streamWithConfig: StreamWithConfig["DirectConfig"],
): Pick<MetaDetail, "name" | "description" | "poster" | "background" | "imdbRating"> {
  const nameRaw =
    _trim(_toString(streamWithConfig.name)) || _trim(_toString(streamWithConfig.full_name));
  const displayName = !_isEmpty(nameRaw) ? nameRaw : "Unknown";

  const descriptionRaw = _trim(_toString(streamWithConfig.description));
  const descriptionText = !_isEmpty(descriptionRaw) ? descriptionRaw : undefined;

  const posterUrl = firstValidImageUrl(streamWithConfig.stream_icon);
  const backgroundUrl = firstValidImageUrl(streamWithConfig.stream_icon);

  const imdbRating = normalizeImdbRatingForMeta(streamWithConfig.rating);

  return {
    name: displayName,
    ...(descriptionText ? { description: descriptionText } : {}),
    ...(posterUrl ? { poster: posterUrl } : {}),
    ...(backgroundUrl ? { background: backgroundUrl } : {}),
    ...(imdbRating ? { imdbRating } : {}),
  };
}

function metaVideosFromEpisodeRowsFactory(
  parsedId: string,
  streamWithConfig: StreamWithConfig["DirectConfig"],
  rows: SeriesEpisode[],
): Partial<MetaVideo>[] {
  const seriesRowId = _trim(_toString(parsedId));

  if (_isEmpty(seriesRowId)) {
    return [];
  }

  const sortedRows = _sortBy(rows, [
    (row) => {
      return row.season;
    },
    (row) => {
      return row.episode;
    },
  ]);

  return _map(sortedRows, (episode) => {
    const titleRaw = _trim(_toString(episode.title));
    const titleDisplay = !_isEmpty(titleRaw) ? titleRaw : `Episode ${episode.episode}`;

    const thumbnailUrl = firstValidImageUrl(episode.thumbnail, streamWithConfig.stream_icon);

    const encodedStreamPart = encodeStremioIdPayload({
      id: _toString(parsedId),
      stream_id: _toString(streamWithConfig.stream_id),
      video_id: _toString(episode.id),
    });
    const metaVideoId = `${ID_PREFIX}${encodedStreamPart}`;

    const urlRaw = _trim(_toString(episode.url));
    const hasUrl = !_isEmpty(urlRaw);
    const name = _trim(_toString(episode.full_name)) || _trim(_toString(episode.title));

    const embeddedStreams = hasUrl ? [stremioPlaybackStreamFromUrl(urlRaw, name)] : undefined;

    return {
      id: metaVideoId,
      title: titleDisplay,
      season: episode.season,
      episode: episode.episode,
      ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
      ...(embeddedStreams ? { streams: embeddedStreams } : {}),
    };
  });
}

function buildDirectMetaWithSingleStream(
  stremioId: string,
  parsedId: string,
  streamWithConfig: StreamWithConfig["DirectConfig"],
  stremioContentType:
    | typeof STREMIO_STREAM_TYPE.MOVIE
    | typeof STREMIO_STREAM_TYPE.TV
    | typeof STREMIO_STREAM_TYPE.CHANNEL,
): MetaDetail {
  const commonMetaDetail = commonDirectMetaDetailFields(streamWithConfig);
  const urlRaw = _trim(_toString(streamWithConfig.url));
  const hasUrl = !_isEmpty(urlRaw);

  let singleStreamVideos: Partial<MetaVideo>[] | undefined;

  if (hasUrl) {
    const playbackStream = stremioPlaybackStreamFromUrl(urlRaw, commonMetaDetail.name);
    const singleStreamVideoId = encodeStremioIdPayload({
      id: _toString(parsedId),
      stream_id: _toString(streamWithConfig.stream_id),
      video_id: _toString(streamWithConfig.stream_id),
    });
    singleStreamVideos = [
      {
        id: `${ID_PREFIX}${singleStreamVideoId}`,
        title: commonMetaDetail.name,
        streams: [playbackStream],
        ...(commonMetaDetail.poster ? { thumbnail: commonMetaDetail.poster } : {}),
      },
    ];
  }

  const defaultVideoId = singleStreamVideos?.[0]?.id;

  return {
    id: stremioId,
    type: stremioContentType,
    name: commonMetaDetail.name,
    ...(commonMetaDetail.description ? { description: commonMetaDetail.description } : {}),
    ...(commonMetaDetail.poster ? { poster: commonMetaDetail.poster } : {}),
    ...(commonMetaDetail.background ? { background: commonMetaDetail.background } : {}),
    ...(commonMetaDetail.imdbRating ? { imdbRating: commonMetaDetail.imdbRating } : {}),
    ...(singleStreamVideos?.length ? { videos: singleStreamVideos as MetaVideo[] } : {}),
    ...(defaultVideoId ? { behaviourHints: { defaultVideo: defaultVideoId } } : {}),
  };
}

function directSeriesMetaDetailFactory(
  stremioId: string,
  parsedId: string,
  streamWithConfig: StreamWithConfig["DirectConfig"],
  episodes: SeriesEpisode[],
): MetaDetail {
  const commonMetaDetail = commonDirectMetaDetailFields(streamWithConfig);
  const episodeVideos = metaVideosFromEpisodeRowsFactory(parsedId, streamWithConfig, episodes);
  const defaultVideoId = episodeVideos?.[0]?.id;

  return {
    id: stremioId,
    type: STREMIO_STREAM_TYPE.SERIES,
    name: commonMetaDetail.name,
    ...(commonMetaDetail.description ? { description: commonMetaDetail.description } : {}),
    ...(commonMetaDetail.poster ? { poster: commonMetaDetail.poster } : {}),
    ...(commonMetaDetail.background ? { background: commonMetaDetail.background } : {}),
    ...(commonMetaDetail.imdbRating ? { imdbRating: commonMetaDetail.imdbRating } : {}),
    ...(episodeVideos.length ? { videos: episodeVideos as MetaVideo[] } : {}),
    ...(defaultVideoId ? { behaviourHints: { defaultVideo: defaultVideoId } } : {}),
  };
}

export function directMetaDetailFactory(
  type: ContentType,
  encodedId: string,
  parsedId: string,
  streamWithConfig: StreamWithConfig["DirectConfig"],
  seriesEpisodes?: SeriesEpisode[],
): MetaDetail {
  if (type === STREMIO_STREAM_TYPE.MOVIE) {
    return buildDirectMetaWithSingleStream(
      encodedId,
      parsedId,
      streamWithConfig,
      STREMIO_STREAM_TYPE.MOVIE,
    );
  }

  if (type === STREMIO_STREAM_TYPE.SERIES) {
    const episodes = seriesEpisodes ?? [];

    return directSeriesMetaDetailFactory(encodedId, parsedId, streamWithConfig, episodes);
  }

  if (type === STREMIO_STREAM_TYPE.TV || type === STREMIO_STREAM_TYPE.CHANNEL) {
    return buildDirectMetaWithSingleStream(encodedId, parsedId, streamWithConfig, type);
  }

  return {
    id: encodedId,
    type,
    name: streamWithConfig.name || "Unknown",
  };
}
