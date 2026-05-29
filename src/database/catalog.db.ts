import _isNumber from "lodash/isNumber";
import { ContentType } from "stremio-addon-sdk";

import { STREAM_LIMIT_PER_PAGE } from "@/constants/common.constants";
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

  if (genre && genre !== "All Channels") {
    query += ` AND c.category_name = $${paramIndex++}`;
    payload.push(genre);
  }

  if (search) {
    const escaped = escapeLikePattern(search);
    query += ` AND s.name ILIKE $${paramIndex++} ESCAPE '\\'`;
    payload.push(`${escaped}%`);
  }

  let limitClause = "";

  if (_isNumber(skip)) {
    limitClause = ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    payload.push(STREAM_LIMIT_PER_PAGE, skip);
  }

  const { rows } = await getPool().query<Stream>(
    /* sql */ `
      SELECT
        s.*
      FROM
        ${streamtableName} s ${genreTable}
      WHERE
        ${query}${limitClause}
    `,
    payload,
  );

  return rows;
}
