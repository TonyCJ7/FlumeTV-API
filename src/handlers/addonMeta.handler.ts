import _isPlainObject from "lodash/isPlainObject";
import _toString from "lodash/toString";
import { Cache, ContentType, MetaDetail } from "stremio-addon-sdk";

import { CONFIG_TYPE, STREMIO_STREAM_TYPE } from "@/constants/stream.constants";
import { getStreamAndConfigById } from "@/database/common.db";
import { listSeriesEpisodes } from "@/database/meta.db";
import { directMetaDetailFactory } from "@/factories/streamMetaDirect.factory";
import { xtremeMetaDetailFactory } from "@/factories/streamMetaXtreme.factory";
import { streamWithConfigFromDbRow } from "@/factories/streamWithConfig.factory";
import type { SeriesEpisode, StreamWithConfig } from "@/types/stream.types";
import { decodeStremioIdPayload } from "@/utils/builder.utils";
import { decodeToken } from "@/utils/crypto.utils";
import { dlog, logError } from "@/utils/debug.utils";
import { fetchXtremeSeriesInfo, fetchXtremeVodInfo } from "@/services/xtreamMeta.services";
import type { XtremeMoviePayload, XtremeSeriesPayload } from "@/types/xtremeMeta.types";

async function fetchXtremeMetaPayloadForStream(
  type: ContentType,
  streamWithConfig: StreamWithConfig["XtremeConfig"],
): Promise<XtremeMoviePayload | XtremeSeriesPayload | Record<string, never>> {
  try {
    const xtremeUrl = streamWithConfig.xtreme_url;
    const { username, password } = streamWithConfig;

    if (!xtremeUrl || !username || !password) {
      dlog("[META FETCH] Not able to fetch meta. xtreme_url, username, password are required");

      return {};
    }

    if (type === STREMIO_STREAM_TYPE.TV || type === STREMIO_STREAM_TYPE.CHANNEL) {
      dlog("[META FETCH] Meta not available for stream type: TV or CHANNEL");

      return {};
    }

    const isMovie = type === STREMIO_STREAM_TYPE.MOVIE;
    const providerContentId = _toString(streamWithConfig.stream_id);

    return isMovie
      ? fetchXtremeVodInfo(xtremeUrl, username, password, providerContentId)
      : fetchXtremeSeriesInfo(xtremeUrl, username, password, providerContentId);
  } catch (error) {
    logError("addon meta", "Failed to get meta for stream", error);
    dlog("[META] Failed to get meta for stream", error);

    return {};
  }
}

export async function buildDirectMeta(
  streamWithConfig: StreamWithConfig["DirectConfig"],
  type: ContentType,
  encodedId: string,
  parsedId: string,
): Promise<{ meta: MetaDetail } & Cache> {
  let seriesEpisodes: SeriesEpisode[] | undefined;

  if (type === STREMIO_STREAM_TYPE.SERIES) {
    seriesEpisodes = await listSeriesEpisodes(parsedId);
  }

  const metaDetail = directMetaDetailFactory(
    type,
    encodedId,
    parsedId,
    streamWithConfig,
    seriesEpisodes,
  );

  return {
    meta: metaDetail,
    cacheMaxAge: 3600,
  };
}

export async function buildXtremeMeta(
  streamWithConfig: StreamWithConfig["XtremeConfig"],
  encodedId: string,
  parsedId: string,
  type: ContentType,
  fallback: MetaDetail,
): Promise<{ meta: MetaDetail } & Cache> {
  const isLiveStremioType = type === STREMIO_STREAM_TYPE.TV || type === STREMIO_STREAM_TYPE.CHANNEL;

  if (isLiveStremioType) {
    if (!streamWithConfig.xtreme_url || !streamWithConfig.username || !streamWithConfig.password) {
      dlog("[META] Invalid xtream playback. Missing credentials or host");
      return { meta: fallback, cacheMaxAge: 60 };
    }

    return {
      meta: xtremeMetaDetailFactory(
        type,
        encodedId,
        parsedId,
        {} as XtremeMoviePayload,
        streamWithConfig,
      ),
      cacheMaxAge: 3600,
    };
  }

  const streamMetaPayload = await fetchXtremeMetaPayloadForStream(type, streamWithConfig);

  const hasInfo = _isPlainObject(streamMetaPayload) && _isPlainObject(streamMetaPayload.info);
  if (!hasInfo) {
    dlog("[META] Invalid stream meta payload", streamMetaPayload);
    return { meta: fallback, cacheMaxAge: 60 };
  }

  if (!streamWithConfig.xtreme_url || !streamWithConfig.username || !streamWithConfig.password) {
    dlog("[META] Invalid xtream playback. Missing credentials or host");
    return { meta: fallback, cacheMaxAge: 60 };
  }

  return {
    meta: xtremeMetaDetailFactory(type, encodedId, parsedId, streamMetaPayload, streamWithConfig),
    cacheMaxAge: 3600,
  };
}

export async function addonMetaHandler(args: {
  type: ContentType;
  id: string;
  config?: string;
}): Promise<{ meta: MetaDetail } & Cache> {
  try {
    const config_hash = args.config ?? "";
    const { type, id: _id } = args;
    const { id, stream_id } = decodeStremioIdPayload(_id);

    if (!config_hash) {
      throw new Error("[META] Invalid config token");
    }

    const sessionPayload = decodeToken(config_hash);
    const userId =
      sessionPayload && typeof sessionPayload.uuid === "string" ? sessionPayload.uuid : "";

    if (!userId) {
      throw new Error(`[META] Invalid config token, missing uuid`);
    }

    if (!id || !stream_id) {
      throw new Error(`[META] Invalid id or stream_id, ${id}, ${stream_id}`);
    }

    const streamWithConfig = streamWithConfigFromDbRow(
      await getStreamAndConfigById(id, type, userId),
    );
    const fallback: MetaDetail = {
      id,
      type,
      name: streamWithConfig.name || "Unknown",
    };

    if (streamWithConfig.config_type === CONFIG_TYPE.DIRECT) {
      dlog("[META] Building direct catalog meta");
      return await buildDirectMeta(
        streamWithConfig as StreamWithConfig["DirectConfig"],
        type,
        _id,
        String(id),
      );
    }

    if (streamWithConfig.config_type === CONFIG_TYPE.XTREME) {
      dlog("[META] Building xtreme catalog meta");
      return buildXtremeMeta(
        streamWithConfig as StreamWithConfig["XtremeConfig"],
        _id,
        String(id),
        type,
        fallback,
      );
    }

    return { meta: fallback, cacheMaxAge: 60 };
  } catch (error) {
    logError("addon meta", "Handler error", error);
    dlog("[META] Error", error);
    return {
      meta: {} as MetaDetail,
    };
  }
}
