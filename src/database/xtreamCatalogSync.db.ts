import type { PoolClient } from "pg";

import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import type { FormattedXtreamCatalog, XtreamSyncContextRow } from "@/types/xtreamSync.types";

import { deleteCatalogRowsByHash } from "./catalogSyncDelete.db";
import { getPool } from "./pgPool.utils";
import { withPgTransaction } from "./pgTransaction.utils";

/** Delete order: streams (and cascaded episodes) before categories. Identifiers must stay in sync with `TABLE_NAMES`. */
const XTREAM_CATALOG_TABLES_DELETE_BY_HASH_ORDER = [
  TABLE_NAMES.LIVE_STREAM,
  TABLE_NAMES.MOVIE_STREAM,
  TABLE_NAMES.SERIES_STREAM,
  TABLE_NAMES.LIVE_CATEGORY,
  TABLE_NAMES.MOVIE_CATEGORY,
  TABLE_NAMES.SERIES_CATEGORY,
] as const;

export async function getXtreamSyncContext(
  hash: string,
): Promise<XtreamSyncContextRow | undefined> {
  const { rows } = await getPool().query<XtreamSyncContextRow>(
    /* sql */ `
      SELECT
        x.url AS url,
        x.custom_epg AS custom_epg,
        x.has_custom_epg AS has_custom_epg,
        x.epg_url AS epg_url,
        x.epg_offset AS epg_offset,
        x.username AS username,
        x.password_enc AS password_enc
      FROM
        ${TABLE_NAMES.XTREAM_CONFIGS} x
      WHERE
        x.hash_id = $1
      LIMIT
        1
    `,
    [hash],
  );

  const row = rows[0];

  if (!row) {
    return undefined;
  }

  return {
    custom_epg: row.custom_epg,
    epg_offset: row.epg_offset ?? 0,
    epg_url: row.epg_url,
    has_custom_epg: row.has_custom_epg,
    password_enc: row.password_enc,
    url: row.url,
    username: row.username,
  };
}

async function insertXtreamCategoryRow(
  client: PoolClient,
  params: {
    categoryId: number | null;
    categoryName: string;
    hash: string;
    tableName:
      | typeof TABLE_NAMES.LIVE_CATEGORY
      | typeof TABLE_NAMES.MOVIE_CATEGORY
      | typeof TABLE_NAMES.SERIES_CATEGORY;
  },
): Promise<number> {
  const tableName = params.tableName;

  const { rows } = await client.query<{ id: string }>(
    /* sql */ `
      INSERT INTO
        ${tableName} (category_id, hash, category_name)
      VALUES
        ($1, $2, $3)
      RETURNING
        id
    `,
    [params.categoryId, params.hash, params.categoryName],
  );

  return Number(rows[0].id);
}

async function insertLiveStreamRow(
  client: PoolClient,
  params: {
    categoryId: number;
    categoryInternalId: number;
    containerExtension: string | null;
    description: string | null;
    epgChannelId: string | null;
    fullName: string | null;
    hash: string;
    name: string;
    rating: string;
    streamIcon: string | null;
    streamId: number;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
      ${TABLE_NAMES.LIVE_STREAM} (
        stream_id,
        hash,
        name,
        full_name,
        stream_icon,
        rating,
        category_id,
        category_internal_id,
        container_extension,
        description,
        epg_channel_id
      )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      params.streamId,
      params.hash,
      params.name,
      params.fullName,
      params.streamIcon,
      params.rating,
      params.categoryId,
      params.categoryInternalId,
      params.containerExtension,
      params.description,
      params.epgChannelId,
    ],
  );
}

async function insertMovieStreamRow(
  client: PoolClient,
  params: {
    categoryId: number | null;
    categoryInternalId: number;
    containerExtension: string | null;
    data: string | null;
    description: string | null;
    fullName: string | null;
    hash: string;
    name: string;
    rating: string;
    streamIcon: string | null;
    streamId: number;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
      ${TABLE_NAMES.MOVIE_STREAM} (
        stream_id,
        hash,
        name,
        full_name,
        stream_icon,
        rating,
        data,
        category_id,
        category_internal_id,
        description,
        container_extension
      )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      params.streamId,
      params.hash,
      params.name,
      params.fullName,
      params.streamIcon,
      params.rating,
      params.data,
      params.categoryId,
      params.categoryInternalId,
      params.description,
      params.containerExtension,
    ],
  );
}

async function insertSeriesStreamRow(
  client: PoolClient,
  params: {
    categoryId: number | null;
    categoryInternalId: number;
    containerExtension: string | null;
    data: string | null;
    description: string | null;
    fullName: string | null;
    hash: string;
    name: string;
    rating: string;
    streamIcon: string | null;
    streamId: number;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
      ${TABLE_NAMES.SERIES_STREAM} (
        stream_id,
        hash,
        name,
        full_name,
        stream_icon,
        rating,
        data,
        category_id,
        category_internal_id,
        description,
        container_extension
      )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      params.streamId,
      params.hash,
      params.name,
      params.fullName,
      params.streamIcon,
      params.rating,
      params.data,
      params.categoryId,
      params.categoryInternalId,
      params.description,
      params.containerExtension,
    ],
  );
}

async function purgeXtreamCatalog(client: PoolClient, hash: string): Promise<void> {
  for (const tableName of XTREAM_CATALOG_TABLES_DELETE_BY_HASH_ORDER) {
    await deleteCatalogRowsByHash(client, tableName, hash);
  }
}

async function insertLiveSection(
  client: PoolClient,
  params: {
    hash: string;
    liveCategories: FormattedXtreamCatalog["liveCategories"];
    liveStreams: FormattedXtreamCatalog["liveStreams"];
  },
): Promise<void> {
  const hash = params.hash;
  const liveCategoryInternalByProviderId = new Map<number, number>();

  for (const category of params.liveCategories) {
    const providerId = category.providerCategoryId;
    const providerCategoryIdStored = providerId == null ? null : providerId;
    const internalId = await insertXtreamCategoryRow(client, {
      categoryId: providerCategoryIdStored,
      categoryName: category.name,
      hash,
      tableName: TABLE_NAMES.LIVE_CATEGORY,
    });

    if (providerId != null) {
      liveCategoryInternalByProviderId.set(providerId, internalId);
    }
  }

  for (const stream of params.liveStreams) {
    const internalCategoryId = liveCategoryInternalByProviderId.get(stream.providerCategoryId);

    if (internalCategoryId == null) {
      continue;
    }

    await insertLiveStreamRow(client, {
      categoryId: stream.providerCategoryId,
      categoryInternalId: internalCategoryId,
      containerExtension: stream.containerExtension,
      description: stream.description,
      epgChannelId: stream.epgChannelId,
      fullName: stream.fullName,
      hash,
      name: stream.name,
      rating: stream.rating,
      streamIcon: stream.streamIcon,
      streamId: stream.streamId,
    });
  }
}

async function insertVodSection(
  client: PoolClient,
  params: {
    hash: string;
    movieCategories: FormattedXtreamCatalog["movieCategories"];
    movieStreams: FormattedXtreamCatalog["movieStreams"];
  },
): Promise<void> {
  const hash = params.hash;
  const movieCategoryInternalByProviderId = new Map<number, number>();

  for (const category of params.movieCategories) {
    const providerId = category.providerCategoryId;
    const providerCategoryIdStored = providerId == null ? null : providerId;
    const internalId = await insertXtreamCategoryRow(client, {
      categoryId: providerCategoryIdStored,
      categoryName: category.name,
      hash,
      tableName: TABLE_NAMES.MOVIE_CATEGORY,
    });

    if (providerId != null) {
      movieCategoryInternalByProviderId.set(providerId, internalId);
    }
  }

  for (const stream of params.movieStreams) {
    const internalCategoryId = movieCategoryInternalByProviderId.get(stream.providerCategoryId);

    if (internalCategoryId == null) {
      continue;
    }

    await insertMovieStreamRow(client, {
      categoryId: stream.providerCategoryId,
      categoryInternalId: internalCategoryId,
      containerExtension: stream.containerExtension,
      data: stream.data,
      description: stream.description,
      fullName: stream.fullName,
      hash,
      name: stream.name,
      rating: stream.rating,
      streamIcon: stream.streamIcon,
      streamId: stream.streamId,
    });
  }
}

async function insertSeriesSection(
  client: PoolClient,
  params: {
    hash: string;
    seriesCategories: FormattedXtreamCatalog["seriesCategories"];
    seriesStreams: FormattedXtreamCatalog["seriesStreams"];
  },
): Promise<void> {
  const hash = params.hash;
  const seriesCategoryInternalByProviderId = new Map<number, number>();

  for (const category of params.seriesCategories) {
    const providerId = category.providerCategoryId;
    const providerCategoryIdStored = providerId == null ? null : providerId;
    const internalId = await insertXtreamCategoryRow(client, {
      categoryId: providerCategoryIdStored,
      categoryName: category.name,
      hash,
      tableName: TABLE_NAMES.SERIES_CATEGORY,
    });

    if (providerId != null) {
      seriesCategoryInternalByProviderId.set(providerId, internalId);
    }
  }

  for (const stream of params.seriesStreams) {
    const internalCategoryId = seriesCategoryInternalByProviderId.get(stream.providerCategoryId);

    if (internalCategoryId == null) {
      continue;
    }

    await insertSeriesStreamRow(client, {
      categoryId: stream.providerCategoryId,
      categoryInternalId: internalCategoryId,
      containerExtension: stream.containerExtension,
      data: stream.data,
      description: stream.description,
      fullName: stream.fullName,
      hash,
      name: stream.name,
      rating: stream.rating,
      streamIcon: stream.streamIcon,
      streamId: stream.streamId,
    });
  }
}

/**
 * Deletes all catalog rows for `hash`, inserts the formatted tree, sets `last_synced_at`, resets room to `idle`.
 * One atomic PostgreSQL transaction per successful Xtream sync.
 */
export async function runXtreamCatalogReplace(params: {
  catalog: FormattedXtreamCatalog;
  hash: string;
  lastSyncedAtIso: string;
  roomId: number;
}): Promise<void> {
  await withPgTransaction(async (client) => {
    const hash = params.hash;
    const catalog = params.catalog;

    await purgeXtreamCatalog(client, hash);

    await insertLiveSection(client, {
      hash,
      liveCategories: catalog.liveCategories,
      liveStreams: catalog.liveStreams,
    });

    await insertVodSection(client, {
      hash,
      movieCategories: catalog.movieCategories,
      movieStreams: catalog.movieStreams,
    });

    await insertSeriesSection(client, {
      hash,
      seriesCategories: catalog.seriesCategories,
      seriesStreams: catalog.seriesStreams,
    });

    await client.query(
      /* sql */ `
      UPDATE ${TABLE_NAMES.HASH_CONFIG}
      SET
        last_synced_at = $1::timestamptz
      WHERE
        hash = $2
    `,
      [params.lastSyncedAtIso, hash],
    );

    await client.query(
      /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        status = 'idle',
        last_outcome = 'completed',
        sync_percent = NULL,
        sync_phase = NULL,
        sync_bytes_read = NULL,
        sync_bytes_total = NULL,
        closed_reason = NULL,
        updated_at = NOW()
      WHERE
        id = $1
    `,
      [params.roomId],
    );
  });
}
