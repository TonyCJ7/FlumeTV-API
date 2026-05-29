import _map from "lodash/map";
import { ContentType } from "stremio-addon-sdk";

import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import { STREAM_TABLE_TYPE_MAP } from "@/constants/stream.constants";
import { StreamWithConfig } from "@/types/stream.types";
import { decryptPanelPasswordStored } from "@/utils/crypto.utils";

import { getPool } from "./pgPool.utils";

export async function getConfigType(hash: string): Promise<string | null> {
  if (!hash) {
    throw new Error("[COMMON] [DB] hash is required to get config type");
  }

  const { rows } = await getPool().query<{ config_type: string }>(
    /* sql */ `
      SELECT
        config_type
      FROM
        ${TABLE_NAMES.HASH_CONFIG}
      WHERE
        hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows[0]?.config_type ?? null;
}

export async function listActiveHashes(userId: string): Promise<string[]> {
  if (!userId) {
    throw new Error("[COMMON] [DB] userId is required to list hashes");
  }

  const { rows } = await getPool().query<{ hash: string }>(
    /* sql */ `
      SELECT
        hash
      FROM
        user_hash
      WHERE
        user_id = $1
        AND is_active = TRUE
    `,
    [userId],
  );

  return _map(rows, "hash");
}

export async function getStreamAndConfigById(
  id: string,
  type: ContentType,
  userId: string,
): Promise<StreamWithConfig[keyof StreamWithConfig]> {
  if (!id) {
    throw new Error("[COMMON] [DB] id is required to get stream");
  }

  if (!userId) {
    throw new Error("[COMMON] [DB] userId is required to get stream");
  }

  void userId;
  const streamtableName = STREAM_TABLE_TYPE_MAP[type];

  const { rows } = await getPool().query(
    /* sql */ `
      SELECT
        s.*,
        hc.config_type,
        x.url AS xtreme_url,
        x.username,
        x.password_enc AS password,
        COALESCE(x.has_custom_epg, d.has_custom_epg) AS has_custom_epg,
        x.custom_epg,
        x.epg_url,
        x.epg_offset,
        d.m3u_url,
        d.epg_url
      FROM
        ${streamtableName} s
        INNER JOIN ${TABLE_NAMES.HASH_CONFIG} hc ON s.hash = hc.hash
        LEFT JOIN ${TABLE_NAMES.XTREAM_CONFIGS} x ON hc.hash = x.hash_id
        LEFT JOIN ${TABLE_NAMES.DIRECT_CONFIGS} d ON hc.hash = d.hash_id
      WHERE
        s.id = $1
      LIMIT
        1
    `,
    [id],
  );

  const row = rows[0];

  if (!row) {
    return {} as StreamWithConfig[keyof StreamWithConfig];
  }

  const passwordStored = (row as StreamWithConfig["XtremeConfig"]).password;

  if (typeof passwordStored === "string" && passwordStored.length > 0) {
    (row as StreamWithConfig["XtremeConfig"]).password = decryptPanelPasswordStored(passwordStored);
  }

  return row as StreamWithConfig[keyof StreamWithConfig];
}
