import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import {
  FETCH_TIMING_MAX_ROWS,
  SCHEDULER_INTERVAL_DEFAULT_MIN,
  SYNC_FETCH_MS_FALLBACK,
} from "@/constants/scheduler.constants";
import type {
  SchedulerRowDue,
  SchedulerSnapshot,
  SchedulerSnapshotSqlRow,
} from "@/types/scheduler.types";

import { getPool } from "./pgPool.utils";
import { toIsoStringOrNull } from "./pgRow.utils";
import { withPgTransaction } from "./pgTransaction.utils";

/**
 * Scheduler rows whose `next_trigger_at` is due.
 */
export async function listSchedulerRowsDueNow(): Promise<SchedulerRowDue[]> {
  const { rows } = await getPool().query<SchedulerRowDue>(/* sql */ `
    SELECT
      hash_id AS "hashId",
      interval_minutes AS "intervalMinutes"
    FROM
      ${TABLE_NAMES.SCHEDULER}
    WHERE
      next_trigger_at <= NOW ()
  `);

  return rows;
}

/**
 * Mean `duration_ms` over all rows in `fetch_timing` (table size is capped on insert).
 */
export async function getFetchTimingAvgMs(): Promise<number | null> {
  const { rows } = await getPool().query<{ avg_ms: string | null }>(/* sql */ `
    SELECT
      AVG(duration_ms) AS avg_ms
    FROM
      ${TABLE_NAMES.FETCH_TIMING}
  `);

  const avgMs = rows[0]?.avg_ms;

  if (avgMs == null || Number.isNaN(Number(avgMs))) {
    return null;
  }

  return Math.round(Number(avgMs));
}

/**
 * Mean `duration_ms` for completed syncs on this hash (falls back to global estimate when empty).
 */
export async function getFetchTimingAvgMsForHash(hashId: string): Promise<number | null> {
  const { rows } = await getPool().query<{ avg_ms: string | null }>(
    /* sql */ `
      SELECT
        AVG(duration_ms) AS avg_ms
      FROM
        ${TABLE_NAMES.FETCH_TIMING}
      WHERE
        hash_id = $1
    `,
    [hashId],
  );

  const avgMs = rows[0]?.avg_ms;

  if (avgMs == null || Number.isNaN(Number(avgMs))) {
    return null;
  }

  return Math.round(Number(avgMs));
}

/**
 * Best-effort full-job duration for in-sync progress when `Content-Length` is unknown.
 */
export async function getSyncDurationEstimateMs(hashId: string): Promise<number> {
  const perHash = await getFetchTimingAvgMsForHash(hashId);

  if (perHash != null && perHash > 0) {
    return perHash;
  }

  const global = await getFetchTimingAvgMs();

  if (global != null && global > 0) {
    return global;
  }

  return SYNC_FETCH_MS_FALLBACK;
}

async function selectFetchTimingRowCount(client: import("pg").PoolClient): Promise<number> {
  const { rows } = await client.query<{ cnt: string }>(/* sql */ `
    SELECT
      COUNT(*) AS cnt
    FROM
      ${TABLE_NAMES.FETCH_TIMING}
  `);

  return Number(rows[0]?.cnt ?? 0);
}

async function deleteOldestFetchTimingRows(
  client: import("pg").PoolClient,
  deleteCount: number,
): Promise<void> {
  const n = Math.max(0, Math.trunc(deleteCount));

  if (n === 0) {
    return;
  }

  await client.query(
    /* sql */ `
      DELETE FROM ${TABLE_NAMES.FETCH_TIMING}
      WHERE
        id IN (
          SELECT
            id
          FROM
            ${TABLE_NAMES.FETCH_TIMING}
          ORDER BY
            id ASC
          LIMIT
            $1
        )
    `,
    [n],
  );
}

async function insertSingleFetchTimingRow(
  client: import("pg").PoolClient,
  params: { hashId: string; durationMs: number },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.FETCH_TIMING} (hash_id, duration_ms)
      VALUES
        ($1, $2)
    `,
    [params.hashId, params.durationMs],
  );
}

/**
 * Inserts a timing row; if the table is at `FETCH_TIMING_MAX_ROWS`, deletes oldest rows first so size stays bounded.
 */
export async function insertFetchTimingRow(params: {
  hashId: string;
  durationMs: number;
}): Promise<void> {
  await withPgTransaction(async (client) => {
    const count = await selectFetchTimingRowCount(client);

    if (count >= FETCH_TIMING_MAX_ROWS) {
      const rowsToDelete = count - FETCH_TIMING_MAX_ROWS + 1;
      await deleteOldestFetchTimingRows(client, rowsToDelete);
    }

    await insertSingleFetchTimingRow(client, params);
  });
}

async function schedulerRowExists(hashId: string): Promise<boolean> {
  const { rows } = await getPool().query(
    /* sql */ `
      SELECT
        1 AS ok
      FROM
        ${TABLE_NAMES.SCHEDULER}
      WHERE
        hash_id = $1
      LIMIT
        1
    `,
    [hashId],
  );

  return rows.length > 0;
}

async function bumpSchedulerNextTrigger(params: { hashId: string }): Promise<void> {
  const minutes = SCHEDULER_INTERVAL_DEFAULT_MIN;
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.SCHEDULER}
      SET
        next_trigger_at = NOW() + ($1::text || ' minutes')::interval,
        interval_minutes = $2
      WHERE
        hash_id = $3
    `,
    [String(minutes), minutes, params.hashId],
  );
}

async function insertSchedulerRowDefault(params: { hashId: string }): Promise<void> {
  const minutes = SCHEDULER_INTERVAL_DEFAULT_MIN;
  await getPool().query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.SCHEDULER} (hash_id, next_trigger_at, interval_minutes)
      VALUES
        ($1, NOW() + ($2::text || ' minutes')::interval, $3)
    `,
    [params.hashId, String(minutes), minutes],
  );
}

/**
 * After a successful sync, bump `next_trigger_at` by `intervalMinutes` from now; insert row if missing.
 */
export async function upsertSchedulerAfterSync(hashId: string): Promise<void> {
  const exists = await schedulerRowExists(hashId);

  if (exists) {
    await bumpSchedulerNextTrigger({ hashId });
    return;
  }

  await insertSchedulerRowDefault({ hashId });
}

/**
 * Current scheduler row for a hash, if any (used by room Server-Sent Events payloads).
 */
export async function getSchedulerSnapshot(hashId: string): Promise<SchedulerSnapshot | null> {
  const { rows } = await getPool().query<SchedulerSnapshotSqlRow>(
    /* sql */ `
      SELECT
        next_trigger_at AS next_trigger_at,
        interval_minutes AS interval_minutes
      FROM
        ${TABLE_NAMES.SCHEDULER}
      WHERE
        hash_id = $1
      LIMIT
        1
    `,
    [hashId],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    intervalMinutes: row.interval_minutes,
    nextTriggerAt: toIsoStringOrNull(row.next_trigger_at) ?? "",
  };
}
