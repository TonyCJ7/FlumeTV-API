import { ContentType } from "stremio-addon-sdk";
import _isNumber from "lodash/isNumber";

import {
  CATALOG_SEARCH_FUZZY_MIN_LENGTH,
  CATALOG_SEARCH_SIMILARITY_THRESHOLD,
  STREAM_LIMIT_PER_PAGE,
} from "@/constants/common.constants";
import { CATEGORY_TABLE_TYPE_MAP, STREAM_TABLE_TYPE_MAP } from "@/constants/stream.constants";
import { Args } from "@/types/stremio.types";
import { Stream } from "@/types/stream.types";

import { getPool } from "./pgPool.utils";

function escapeLikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function getCatalogs(
  hashes: string[],
  type: ContentType,
  extra: Args["extra"],
): Promise<Stream[]> {
  if (!hashes.length) {
    throw new Error("[CATALOG] [DB] hashes are required to get streams");
  }

  const streamtableName = STREAM_TABLE_TYPE_MAP[type];
  const categorytableName = CATEGORY_TABLE_TYPE_MAP[type];
  const { genre, search, skip } = extra;
  const genreTable = genre
    ? `LEFT JOIN ${categorytableName} c ON s.category_internal_id = c.id`
    : "";

  let paramIndex = 1;
  const hashPlaceholders = hashes.map(() => `$${paramIndex++}`).join(", ");
  let query = `s.hash IN (${hashPlaceholders})`;
  const payload: (string | number)[] = [...hashes];
  let orderClause = "";

  if (genre && genre !== "All Channels") {
    query += ` AND c.category_name = $${paramIndex++}`;
    payload.push(genre);
  }

  if (search) {
    const escaped = escapeLikePattern(search);
    const likeParamIndex = paramIndex++;
    payload.push(`%${escaped}%`);

    if (search.length >= CATALOG_SEARCH_FUZZY_MIN_LENGTH) {
      const termParamIndex = paramIndex++;
      const thresholdParamIndex = paramIndex++;
      payload.push(search);
      payload.push(CATALOG_SEARCH_SIMILARITY_THRESHOLD);

      query += ` AND (
        s.name ILIKE $${likeParamIndex} ESCAPE '\\'
        OR similarity(s.name, $${termParamIndex}) >= $${thresholdParamIndex}
        OR word_similarity($${termParamIndex}, s.name) >= $${thresholdParamIndex}
      )`;

      orderClause = `
      ORDER BY
        CASE WHEN s.name ILIKE $${likeParamIndex} ESCAPE '\\' THEN 0 ELSE 1 END,
        GREATEST(
          similarity(s.name, $${termParamIndex}),
          word_similarity($${termParamIndex}, s.name)
        ) DESC,
        s.name ASC`;
    } else {
      query += ` AND s.name ILIKE $${likeParamIndex} ESCAPE '\\'`;
    }
  }

  let limitClause = "";

  if (_isNumber(skip)) {
    limitClause = ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    payload.push(STREAM_LIMIT_PER_PAGE, skip);
  } else if (search) {
    limitClause = ` LIMIT $${paramIndex++}`;
    payload.push(STREAM_LIMIT_PER_PAGE);
  }

  const { rows } = await getPool().query<Stream>(
    /* sql */ `
      SELECT
        s.*
      FROM
        ${streamtableName} s ${genreTable}
      WHERE
        ${query}${orderClause}${limitClause}
    `,
    payload,
  );

  return rows;
}
