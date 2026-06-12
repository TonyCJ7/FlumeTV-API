import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import type {
  AppendRoomLogStreamLineParams,
  RoomLogKind,
  RoomLogSectorStatus,
  RoomLogStreamSqlRow,
  RoomLogTone,
} from "@/types/room.types";

import { getPool } from "./pgPool.utils";
import { toIsoStringOrNull } from "./pgRow.utils";
import { withPgTransaction } from "./pgTransaction.utils";
import { nextLogEventSequenceForHashInTx } from "./streamEventResume.db";

const LOG_REPLAY_MAX_LINES = 500;

async function insertRoomLogLine(
  client: import("pg").PoolClient,
  params: {
    bytesRead: number | null;
    bytesTotal: number | null;
    hash: string;
    kind: RoomLogKind;
    level: string | null;
    line: string;
    logKey: string | null;
    roomId: number;
    sector: string | null;
    sectorPercent: number | null;
    seq: number;
    status: RoomLogSectorStatus | null;
    tone: RoomLogTone;
  },
): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.ROOM_LOG_LINE} (
          hash,
          seq,
          room_id,
          line,
          level,
          tone,
          kind,
          log_key,
          sector,
          status,
          bytes_read,
          bytes_total,
          sector_percent
        )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      params.hash,
      params.seq,
      params.roomId,
      params.line,
      params.level,
      params.tone,
      params.kind,
      params.logKey,
      params.sector,
      params.status,
      params.bytesRead,
      params.bytesTotal,
      params.sectorPercent,
    ],
  );
}

/**
 * Persist one prefetch log line (main process only — worker lines are forwarded here from stdout).
 */
export async function appendRoomLogStreamLine(
  params: AppendRoomLogStreamLineParams,
): Promise<number> {
  return withPgTransaction(async (client) => {
    const seq = await nextLogEventSequenceForHashInTx(client, params.hash);

    await insertRoomLogLine(client, {
      bytesRead: params.bytesRead ?? null,
      bytesTotal: params.bytesTotal ?? null,
      hash: params.hash,
      kind: params.kind ?? "text",
      level: params.level ?? null,
      line: params.line,
      logKey: params.logKey ?? null,
      roomId: params.roomId,
      sector: params.sector ?? null,
      sectorPercent: params.sectorPercent ?? null,
      seq,
      status: params.status ?? null,
      tone: params.tone ?? "default",
    });

    return seq;
  });
}

export async function deleteRoomLogLinesForHash(hash: string): Promise<void> {
  await getPool().query(
    /* sql */ `
      DELETE FROM ${TABLE_NAMES.ROOM_LOG_LINE}
      WHERE
        hash = $1
    `,
    [hash],
  );
}

/** Whether any persisted prefetch log lines exist for the hash (replay buffer non-empty). */
export async function hashHasRoomLogLines(hash: string): Promise<boolean> {
  const { rows } = await getPool().query(
    /* sql */ `
      SELECT
        1 AS one
      FROM
        ${TABLE_NAMES.ROOM_LOG_LINE}
      WHERE
        hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows.length > 0;
}

/** Config hashes that have at least one row in `room_log_line` (batch snapshot helper). */
export async function listHashesWithRoomLogLines(hashes: readonly string[]): Promise<Set<string>> {
  if (hashes.length === 0) {
    return new Set();
  }

  const placeholders = hashes.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await getPool().query<{ hash: string }>(
    /* sql */ `
      SELECT DISTINCT
        hash AS hash
      FROM
        ${TABLE_NAMES.ROOM_LOG_LINE}
      WHERE
        hash IN (${placeholders})
    `,
    [...hashes],
  );

  return new Set(rows.map((row) => row.hash));
}

/**
 * Log lines with `seq > afterSeq`, oldest first, capped for replay.
 */
export async function listRoomLogStreamLinesAfter(
  hash: string,
  afterSeq: number,
): Promise<RoomLogStreamSqlRow[]> {
  const { rows } = await getPool().query<RoomLogStreamSqlRow>(
    /* sql */ `
      SELECT
        seq AS seq,
        line AS line,
        level AS level,
        tone AS tone,
        kind AS kind,
        log_key AS log_key,
        sector AS sector,
        status AS status,
        bytes_read AS bytes_read,
        bytes_total AS bytes_total,
        sector_percent AS sector_percent,
        created_at AS created_at
      FROM
        ${TABLE_NAMES.ROOM_LOG_LINE}
      WHERE
        hash = $1
        AND seq > $2
      ORDER BY
        seq ASC
      LIMIT
        ${LOG_REPLAY_MAX_LINES}
    `,
    [hash, afterSeq],
  );

  return rows.map((row) => ({
    ...row,
    created_at: toIsoStringOrNull(row.created_at),
  }));
}
