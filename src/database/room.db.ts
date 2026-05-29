import _includes from "lodash/includes";
import type { PoolClient } from "pg";

import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import { ACTIVE_SYNC_ROOM_STATUSES, isTerminalRoomStatus } from "@/constants/room.constants";
import type {
  HashConfigLinkedRoomRow,
  RoomJoinedSummaryRow,
  RoomLastOutcome,
  RoomSseSnapshot,
  RoomSseSqlRow,
  RoomSummary,
} from "@/types/room.types";
import { parseRoomLastOutcome } from "@/utils/roomOutcome.utils";
import { roomSyncProgressFromRow } from "@/utils/syncProgress.utils";

import { getPool } from "./pgPool.utils";
import { toIsoStringOrNull } from "./pgRow.utils";
import { withPgTransaction } from "./pgTransaction.utils";

function terminalStatusToLastOutcome(status: string): RoomLastOutcome | null {
  if (!isTerminalRoomStatus(status)) {
    return null;
  }

  return parseRoomLastOutcome(status);
}

export async function clearRoomProgress(roomId: number): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        sync_percent = NULL,
        sync_phase = NULL,
        sync_bytes_read = NULL,
        sync_bytes_total = NULL,
        updated_at = NOW()
      WHERE
        id = $1
    `,
    [roomId],
  );
}

export async function updateRoomProgress(params: {
  bytesRead?: number | null;
  bytesTotal?: number | null;
  percent: number;
  phase?: string | null;
  roomId: number;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        sync_percent = $1,
        sync_phase = $2,
        sync_bytes_read = $3,
        sync_bytes_total = $4,
        updated_at = NOW()
      WHERE
        id = $5
    `,
    [
      params.percent,
      params.phase ?? null,
      params.bytesRead ?? null,
      params.bytesTotal ?? null,
      params.roomId,
    ],
  );
}

export async function insertIdleRoomRowInTx(
  client: PoolClient,
  triggeredByUserId: string,
): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.ROOM} (triggered_by, status, updated_at)
      VALUES
        ($1, 'idle', NOW())
      RETURNING
        id
    `,
    [triggeredByUserId],
  );

  return Number(rows[0].id);
}

export async function linkHashConfigRoomIdInTx(
  client: PoolClient,
  params: { hash: string; roomId: number },
): Promise<void> {
  await client.query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.HASH_CONFIG}
      SET
        room_id = $1
      WHERE
        hash = $2
    `,
    [params.roomId, params.hash],
  );
}

export async function selectHashConfigLinkedRoomInTx(
  client: PoolClient,
  hash: string,
): Promise<HashConfigLinkedRoomRow | undefined> {
  const { rows } = await client.query<HashConfigLinkedRoomRow>(
    /* sql */ `
      SELECT
        r.id AS room_id,
        r.status AS room_status
      FROM
        ${TABLE_NAMES.HASH_CONFIG} hc
        LEFT JOIN ${TABLE_NAMES.ROOM} r ON r.id = hc.room_id
      WHERE
        hc.hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows[0];
}

export async function linkHashConfigRoomIdStandalone(params: {
  hash: string;
  roomId: number;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.HASH_CONFIG}
      SET
        room_id = $1
      WHERE
        hash = $2
    `,
    [params.roomId, params.hash],
  );
}

/**
 * Ensures `hash_config.room_id` points at an **`idle`** room row (insert + link when missing).
 */
export async function ensureIdleRoomForHash(params: {
  hash: string;
  triggeredByUserId: string;
}): Promise<number | null> {
  return withPgTransaction(async (client) => {
    const { rows: lockedRows } = await client.query(
      /* sql */ `
        SELECT
          hash
        FROM
          ${TABLE_NAMES.HASH_CONFIG}
        WHERE
          hash = $1
        FOR UPDATE
      `,
      [params.hash],
    );

    if (lockedRows.length === 0) {
      return null;
    }

    const row = await selectHashConfigLinkedRoomInTx(client, params.hash);

    if (!row) {
      return null;
    }

    if (row.room_id != null) {
      return row.room_id;
    }

    const roomId = await insertIdleRoomRowInTx(client, params.triggeredByUserId);
    await linkHashConfigRoomIdInTx(client, { hash: params.hash, roomId });

    return roomId;
  });
}

export async function resetRoomToIdle(params: {
  clearClosedReason?: boolean;
  roomId: number;
}): Promise<void> {
  const clearClosedReason = params.clearClosedReason ?? true;

  if (clearClosedReason) {
    await getPool().query(
      /* sql */ `
        UPDATE ${TABLE_NAMES.ROOM}
        SET
          status = 'idle',
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

    return;
  }

  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        status = 'idle',
        sync_percent = NULL,
        sync_phase = NULL,
        sync_bytes_read = NULL,
        sync_bytes_total = NULL,
        updated_at = NOW()
      WHERE
        id = $1
    `,
    [params.roomId],
  );
}

/**
 * Marks a successful sync run complete and returns the linked room to **`idle`**.
 * Sets **`last_outcome`** to **`completed`**; clears transient progress and **`closed_reason`**.
 */
export async function finalizeRoomRunSuccess(roomId: number): Promise<void> {
  await getPool().query(
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
    [roomId],
  );
}

/**
 * Returns the room linked from `hash_config.room_id`, if any.
 */
export async function getRoomSummary(hash: string): Promise<RoomSummary | null> {
  const { rows } = await getPool().query<RoomJoinedSummaryRow>(
    /* sql */ `
      SELECT
        r.id AS room_id,
        r.status AS room_status
      FROM
        ${TABLE_NAMES.HASH_CONFIG} hc
        INNER JOIN ${TABLE_NAMES.ROOM} r ON r.id = hc.room_id
      WHERE
        hc.hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return { roomId: row.room_id, roomStatus: row.room_status };
}

async function recycleRoomRowToQueued(
  client: PoolClient,
  params: { roomId: number; triggeredByUserId: string },
): Promise<void> {
  await client.query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        status = 'queued',
        triggered_by = $1,
        closed_reason = NULL,
        sync_percent = NULL,
        sync_phase = NULL,
        sync_bytes_read = NULL,
        sync_bytes_total = NULL,
        updated_at = NOW()
      WHERE
        id = $2
    `,
    [params.triggeredByUserId, params.roomId],
  );
}

/**
 * Creates or recycles a `queued` room when no active sync exists.
 * Reuses the linked **`idle`** or terminal row; backfills **`idle`** when `room_id` is NULL (legacy).
 */
export async function tryQueueRoom(params: {
  hash: string;
  triggeredByUserId: string;
}): Promise<
  | { ok: true; roomId: number }
  | { ok: false; reason: "ACTIVE_SYNC_IN_PROGRESS" }
  | { ok: false; reason: "HASH_CONFIG_MISSING" }
> {
  return withPgTransaction(async (client) => {
    const { rows: lockedRows } = await client.query(
      /* sql */ `
        SELECT
          hash
        FROM
          ${TABLE_NAMES.HASH_CONFIG}
        WHERE
          hash = $1
        FOR UPDATE
      `,
      [params.hash],
    );

    if (lockedRows.length === 0) {
      return { ok: false as const, reason: "HASH_CONFIG_MISSING" as const };
    }

    const row = await selectHashConfigLinkedRoomInTx(client, params.hash);

    if (!row) {
      return { ok: false as const, reason: "HASH_CONFIG_MISSING" as const };
    }

    if (
      row.room_id != null &&
      row.room_status != null &&
      _includes(ACTIVE_SYNC_ROOM_STATUSES, row.room_status)
    ) {
      return { ok: false as const, reason: "ACTIVE_SYNC_IN_PROGRESS" as const };
    }

    if (row.room_id == null) {
      const roomId = await insertIdleRoomRowInTx(client, params.triggeredByUserId);
      await linkHashConfigRoomIdInTx(client, { hash: params.hash, roomId });
      await recycleRoomRowToQueued(client, {
        roomId,
        triggeredByUserId: params.triggeredByUserId,
      });

      return { ok: true as const, roomId };
    }

    await recycleRoomRowToQueued(client, {
      roomId: row.room_id,
      triggeredByUserId: params.triggeredByUserId,
    });

    return { ok: true as const, roomId: row.room_id };
  });
}

export async function updateRoomStatusAndTimestamp(params: {
  roomId: number;
  status: string;
}): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        status = $1,
        updated_at = NOW()
      WHERE
        id = $2
    `,
    [params.status, params.roomId],
  );
}

export async function updateRoomClosedState(params: {
  closedReason: string;
  roomId: number;
  status: string;
}): Promise<void> {
  const lastOutcome = terminalStatusToLastOutcome(params.status);

  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        status = $1,
        updated_at = NOW(),
        closed_reason = $2,
        last_outcome = COALESCE($3, last_outcome),
        sync_percent = NULL,
        sync_phase = NULL,
        sync_bytes_read = NULL,
        sync_bytes_total = NULL
      WHERE
        id = $4
    `,
    [params.status, params.closedReason, lastOutcome, params.roomId],
  );
}

/**
 * Whether the user has a `user_hash` bridge row for this config hash (REST authorization).
 */
export async function userHasHashLink(params: { hash: string; userId: string }): Promise<boolean> {
  const { rows } = await getPool().query(
    /* sql */ `
      SELECT
        1 AS ok
      FROM
        ${TABLE_NAMES.USER_HASH_BRIDGE}
      WHERE
        user_id = $1
        AND hash = $2
      LIMIT
        1
    `,
    [params.userId, params.hash],
  );

  return rows.length > 0;
}

/**
 * Marks the `queued` prefetch room linked to this hash as cancelled (e.g. after purging the in-memory FIFO).
 */
export async function cancelQueuedRoom(
  hash: string,
  closedReason = "config_deleted",
): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.ROOM}
      SET
        status = 'cancelled',
        updated_at = NOW(),
        closed_reason = $1,
        last_outcome = 'cancelled',
        sync_percent = NULL,
        sync_phase = NULL,
        sync_bytes_read = NULL,
        sync_bytes_total = NULL
      WHERE
        id IN (
          SELECT
            hc.room_id
          FROM
            ${TABLE_NAMES.HASH_CONFIG} hc
          WHERE
            hc.hash = $2
            AND hc.room_id IS NOT NULL
        )
        AND status = 'queued'
    `,
    [closedReason, hash],
  );
}

/**
 * Deletes the `room` row referenced by `hash_config.room_id` (if any). `ON DELETE SET NULL` clears `hash_config.room_id`.
 */
export async function deleteLinkedRoom(hash: string): Promise<void> {
  const { rows } = await getPool().query<{ room_id: number | null }>(
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

  if (roomId == null) {
    return;
  }

  await getPool().query(
    /* sql */ `
      DELETE FROM ${TABLE_NAMES.ROOM}
      WHERE
        id = $1
    `,
    [roomId],
  );
}

/**
 * Removes `room` rows not referenced by any `hash_config.room_id` (orphan prevention).
 */
export async function deleteOrphanRoomRows(): Promise<number> {
  const result = await getPool().query(/* sql */ `
    DELETE FROM ${TABLE_NAMES.ROOM}
    WHERE
      id NOT IN (
        SELECT
          hc.room_id
        FROM
          ${TABLE_NAMES.HASH_CONFIG} hc
        WHERE
          hc.room_id IS NOT NULL
      )
  `);

  return result.rowCount ?? 0;
}

type LinkedRoomStatusRow = {
  hash: string;
  room_id: number;
  room_status: string | null;
};

/**
 * All config hashes with a linked `room` row (for startup reconcile + terminal dispose sweep).
 */
export async function listHashesWithLinkedRoomStatus(): Promise<
  { hash: string; roomId: number; roomStatus: string | null }[]
> {
  const { rows } = await getPool().query<LinkedRoomStatusRow>(/* sql */ `
    SELECT
      hc.hash AS hash,
      r.id AS room_id,
      r.status AS room_status
    FROM
      ${TABLE_NAMES.HASH_CONFIG} hc
      INNER JOIN ${TABLE_NAMES.ROOM} r ON r.id = hc.room_id
  `);

  return rows.map((row) => ({
    hash: row.hash,
    roomId: row.room_id,
    roomStatus: row.room_status,
  }));
}

/**
 * Current room + `hash_config` snapshot for Server-Sent Events (read-only).
 */
export async function getRoomSseSnapshot(hash: string): Promise<RoomSseSnapshot | null> {
  const { rows } = await getPool().query<RoomSseSqlRow>(
    /* sql */ `
      SELECT
        hc.hash AS hash,
        hc.last_synced_at AS last_synced_at,
        r.id AS room_id,
        r.status AS room_status,
        r.sync_percent AS sync_percent,
        r.sync_phase AS sync_phase,
        r.sync_bytes_read AS sync_bytes_read,
        r.sync_bytes_total AS sync_bytes_total,
        r.logs_tail AS logs_tail,
        r.closed_reason AS closed_reason,
        r.last_outcome AS last_outcome,
        r.updated_at AS room_updated_at,
        r.triggered_by AS triggered_by
      FROM
        ${TABLE_NAMES.HASH_CONFIG} hc
        LEFT JOIN ${TABLE_NAMES.ROOM} r ON r.id = hc.room_id
      WHERE
        hc.hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const progress = roomSyncProgressFromRow(row);

  return {
    closedReason: row.closed_reason,
    hash: row.hash,
    lastOutcome: parseRoomLastOutcome(row.last_outcome),
    lastSyncedAt: toIsoStringOrNull(row.last_synced_at),
    logsTail: row.logs_tail,
    progress,
    roomId: row.room_id,
    roomStatus: row.room_status,
    roomUpdatedAt: toIsoStringOrNull(row.room_updated_at),
    triggeredBy: row.triggered_by,
  };
}
