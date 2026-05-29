import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import { SeriesEpisode } from "@/types/stream.types";

import { getPool } from "./pgPool.utils";

/** Episode row by primary key scoped to a series stream row (`series_episode.series_id` → `series_stream.id`). */
export async function getEpisodeRow(
  episodeRowId: string,
  seriesStreamRowId: string,
): Promise<SeriesEpisode> {
  const { rows } = await getPool().query<SeriesEpisode>(
    /* sql */ `
      SELECT
        *
      FROM
        ${TABLE_NAMES.SERIES_EPISODE}
      WHERE
        id = $1
        AND series_id = $2
    `,
    [episodeRowId, seriesStreamRowId],
  );

  return rows[0] as SeriesEpisode;
}

/** `series_id` column FK targets `series_stream.id` (internal row id). */
export async function listSeriesEpisodes(seriesId: string): Promise<SeriesEpisode[]> {
  const { rows } = await getPool().query<SeriesEpisode>(
    /* sql */ `
      SELECT
        *
      FROM
        series_episode
      WHERE
        series_id = $1
    `,
    [seriesId],
  );

  return rows ?? [];
}
