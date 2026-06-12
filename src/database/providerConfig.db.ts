import type { PoolClient } from "pg";

import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import { CONFIG_TYPE } from "@/constants/stream.constants";
import type {
  HashConfigParams,
  HashConfigResult,
  UserConfigListDbRow,
} from "@/types/provider.types";
import type { ConfigType } from "@/types/stream.types";
import { encryptSecretForStorage } from "@/utils/crypto.utils";

import { getPool } from "./pgPool.utils";
import { withPgTransaction } from "./pgTransaction.utils";
import {
  insertIdleRoomRowInTx,
  linkHashConfigRoomIdInTx,
  selectHashConfigLinkedRoomInTx,
} from "./room.db";

async function hashConfigRowExists(client: PoolClient, hash: string): Promise<boolean> {
  const { rows } = await client.query(
    /* sql */ `
      SELECT
        1 AS ok
      FROM
        ${TABLE_NAMES.HASH_CONFIG}
      WHERE
        hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows.length > 0;
}

async function insertHashConfigRow(
  client: PoolClient,
  hash: string,
  configType: ConfigType,
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.HASH_CONFIG} (hash, config_type, room_id, last_synced_at)
      VALUES
        ($1, $2, NULL, NULL)
    `,
    [hash, configType],
  );
}

async function insertXtreamConfigsRow(
  client: PoolClient,
  params: {
    hashId: string;
    panelUrl: string;
    customEpg: string | null;
    hasCustomEpg: boolean;
    epgUrl: string | null;
    epgOffset: number;
    panelUsername: string;
    passwordEnc: string;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.XTREAM_CONFIGS} (
          hash_id,
          url,
          custom_epg,
          has_custom_epg,
          epg_url,
          epg_offset,
          username,
          password_enc
        )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      params.hashId,
      params.panelUrl,
      params.customEpg,
      params.hasCustomEpg,
      params.epgUrl,
      params.epgOffset,
      params.panelUsername,
      params.passwordEnc,
    ],
  );
}

async function insertDirectConfigsRow(
  client: PoolClient,
  params: {
    hashId: string;
    m3uUrl: string;
    epgUrl: string | null;
    hasCustomEpg: boolean;
    epgOffset: number;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.DIRECT_CONFIGS} (
          hash_id,
          m3u_url,
          epg_url,
          has_custom_epg,
          epg_offset
        )
      VALUES
        ($1, $2, $3, $4, $5)
    `,
    [params.hashId, params.m3uUrl, params.epgUrl, params.hasCustomEpg, params.epgOffset],
  );
}

async function upsertUserHashBridge(
  client: PoolClient,
  params: {
    configName: string;
    hash: string;
    isActive: boolean;
    userId: string;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.USER_HASH_BRIDGE} (user_id, hash, is_active, config_name)
      VALUES
        ($1, $2, $3, $4) ON CONFLICT (user_id, hash) DO
      UPDATE
      SET
        is_active = excluded.is_active,
        config_name = excluded.config_name
    `,
    [params.userId, params.hash, params.isActive, params.configName],
  );
}

/**
 * Reads `user_hash.config_name` for an existing bridge row.
 */
export async function getUserHashConfigName(params: {
  hash: string;
  userId: string;
}): Promise<string | null> {
  const { rows } = await getPool().query<{ config_name: string }>(
    /* sql */ `
      SELECT
        uh.config_name AS config_name
      FROM
        ${TABLE_NAMES.USER_HASH_BRIDGE} uh
      WHERE
        uh.user_id = $1
        AND uh.hash = $2
      LIMIT
        1
    `,
    [params.userId, params.hash],
  );

  return rows[0]?.config_name ?? null;
}

/**
 * Updates display title only (`user_hash.config_name`).
 */
export async function updateUserHashConfigName(params: {
  configName: string;
  hash: string;
  userId: string;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.USER_HASH_BRIDGE}
      SET
        config_name = $1
      WHERE
        user_id = $2
        AND hash = $3
    `,
    [params.configName, params.userId, params.hash],
  );
}

/**
 * Updates `user_hash.is_active` for an existing bridge row (caller should verify link).
 */
export async function updateUserHashIsActive(params: {
  hash: string;
  isActive: boolean;
  userId: string;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.USER_HASH_BRIDGE}
      SET
        is_active = $1
      WHERE
        user_id = $2
        AND hash = $3
    `,
    [params.isActive, params.userId, params.hash],
  );
}

async function insertNewHashAndProviderRow(
  client: PoolClient,
  params: HashConfigParams,
): Promise<void> {
  const epgOffsetInt = Math.trunc(Number(params.epgOffset)) || 0;

  await insertHashConfigRow(
    client,
    params.hash,
    params.kind === "xtream" ? CONFIG_TYPE.XTREME : CONFIG_TYPE.DIRECT,
  );

  if (params.kind === "xtream") {
    await insertXtreamConfigsRow(client, {
      hashId: params.hash,
      panelUrl: params.panelUrl,
      customEpg: params.customEpg,
      hasCustomEpg: params.hasCustomEpg,
      epgUrl: params.epgUrl,
      epgOffset: epgOffsetInt,
      panelUsername: params.panelUsername,
      passwordEnc: encryptSecretForStorage(params.panelPassword),
    });
    return;
  }

  await insertDirectConfigsRow(client, {
    hashId: params.hash,
    m3uUrl: params.m3uUrl,
    epgUrl: params.epgUrl,
    hasCustomEpg: params.hasCustomEpg,
    epgOffset: epgOffsetInt,
  });
}

/**
 * Counts other users linked to the same config hash (excludes `excludeUserId`).
 */
export async function countOtherUsers(hash: string, excludeUserId: string): Promise<number> {
  const { rows } = await getPool().query<{ cnt: string }>(
    /* sql */ `
      SELECT
        COUNT(*) AS cnt
      FROM
        ${TABLE_NAMES.USER_HASH_BRIDGE}
      WHERE
        hash = $1
        AND user_id != $2
    `,
    [hash, excludeUserId],
  );

  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Removes this user’s `user_hash` row only (shared hash row and catalog stay for other accounts).
 */
export async function deleteUserHashBridgeRow(params: {
  hash: string;
  userId: string;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      DELETE FROM ${TABLE_NAMES.USER_HASH_BRIDGE}
      WHERE
        user_id = $1
        AND hash = $2
    `,
    [params.userId, params.hash],
  );
}

/**
 * Last linked user removed: delete `room` (if any), then `hash_config` (CASCADE cleans provider + catalog rows).
 */
export async function deleteHashConfigCascadeForLastUser(hash: string): Promise<void> {
  await withPgTransaction(async (client) => {
    const { rows } = await client.query<{ room_id: number | null }>(
      /* sql */ `
        SELECT
          hc.room_id AS room_id
        FROM
          ${TABLE_NAMES.HASH_CONFIG} hc
        WHERE
          hc.hash = $1
        LIMIT
          1
      `,
      [hash],
    );

    const roomId = rows[0]?.room_id;

    if (roomId != null) {
      await client.query(
        /* sql */ `
          DELETE FROM ${TABLE_NAMES.ROOM}
          WHERE
            id = $1
        `,
        [roomId],
      );
    }

    await client.query(
      /* sql */ `
        DELETE FROM ${TABLE_NAMES.HASH_CONFIG}
        WHERE
          hash = $1
      `,
      [hash],
    );
  });
}

/**
 * In one transaction: create `hash_config` + shared provider row when missing (Xtream creds on `xtream_configs`);
 * always upsert `user_hash`. Creates a linked **`idle`** `room` row for new hashes.
 */
export async function upsertHashConfigAndUserBridge(
  params: HashConfigParams,
): Promise<HashConfigResult> {
  return withPgTransaction(async (client) => {
    const { hash, userId } = params;
    const existedBefore = await hashConfigRowExists(client, hash);

    if (!existedBefore) {
      await insertNewHashAndProviderRow(client, params);
      const roomId = await insertIdleRoomRowInTx(client, userId);
      await linkHashConfigRoomIdInTx(client, { hash, roomId });
    } else {
      await client.query(
        /* sql */ `
          SELECT
            hash
          FROM
            ${TABLE_NAMES.HASH_CONFIG}
          WHERE
            hash = $1
          FOR UPDATE
        `,
        [hash],
      );

      const row = await selectHashConfigLinkedRoomInTx(client, hash);

      if (row && row.room_id == null) {
        const roomId = await insertIdleRoomRowInTx(client, userId);
        await linkHashConfigRoomIdInTx(client, { hash, roomId });
      }
    }

    await upsertUserHashBridge(client, {
      configName: params.configName,
      hash,
      isActive: true,
      userId,
    });

    const createdNewHashConfig = !existedBefore;

    return { hash, createdNewHashConfig };
  });
}

/**
 * All `user_hash` rows for the user with `hash_config`, linked `room`, provider row, and scheduler (read-only).
 */
export async function listUserConfigRows(userId: string): Promise<UserConfigListDbRow[]> {
  const { rows } = await getPool().query<UserConfigListDbRow>(
    /* sql */ `
      SELECT
        uh.config_name AS config_name,
        uh.hash AS hash,
        uh.is_active AS user_is_active,
        hc.config_type AS config_type,
        hc.last_synced_at AS last_synced_at,
        r.id AS room_id,
        r.status AS room_status,
        r.last_outcome AS room_last_outcome,
        r.sync_percent AS sync_percent,
        r.sync_phase AS sync_phase,
        r.sync_bytes_read AS sync_bytes_read,
        r.sync_bytes_total AS sync_bytes_total,
        r.triggered_by AS triggered_by,
        xc.url AS xtream_url,
        xc.username AS xtream_username,
        xc.custom_epg AS xtream_custom_epg,
        xc.has_custom_epg AS xtream_has_custom_epg,
        xc.epg_url AS xtream_epg_url,
        xc.epg_offset AS xtream_epg_offset,
        dc.m3u_url AS direct_m3u_url,
        dc.has_custom_epg AS direct_has_custom_epg,
        dc.epg_url AS direct_epg_url,
        dc.epg_offset AS direct_epg_offset,
        s.next_trigger_at AS scheduler_next_trigger_at,
        s.interval_minutes AS scheduler_interval_minutes
      FROM
        ${TABLE_NAMES.USER_HASH_BRIDGE} uh
        INNER JOIN ${TABLE_NAMES.HASH_CONFIG} hc ON hc.hash = uh.hash
        LEFT JOIN ${TABLE_NAMES.ROOM} r ON r.id = hc.room_id
        LEFT JOIN ${TABLE_NAMES.XTREAM_CONFIGS} xc ON xc.hash_id = hc.hash
        AND hc.config_type = 'xtreme'
        LEFT JOIN ${TABLE_NAMES.DIRECT_CONFIGS} dc ON dc.hash_id = hc.hash
        AND hc.config_type = 'direct'
        LEFT JOIN ${TABLE_NAMES.SCHEDULER} s ON s.hash_id = hc.hash
      WHERE
        uh.user_id = $1
      ORDER BY
        uh.hash ASC
    `,
    [userId],
  );

  return rows;
}

/** Sets `last_synced_at` only when still null (parent reconcile after worker child process). */
export async function updateHashConfigLastSyncedAtIfNull(params: {
  hash: string;
  lastSyncedAtIso: string;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.HASH_CONFIG}
      SET
        last_synced_at = $1
      WHERE
        hash = $2
        AND last_synced_at IS NULL
    `,
    [params.lastSyncedAtIso, params.hash],
  );
}
