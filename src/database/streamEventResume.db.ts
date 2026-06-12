import type { PoolClient } from "pg";

import { TABLE_NAMES } from "@/constants/dbBuild.constants";

import { getPool } from "./pgPool.utils";
import { withPgTransaction } from "./pgTransaction.utils";

type StreamEventResumeRow = {
  last_log_sequence: number;
  last_sequence: number;
};

async function selectResumeRow(
  client: PoolClient,
  hash: string,
): Promise<StreamEventResumeRow | undefined> {
  const { rows } = await client.query<StreamEventResumeRow>(
    /* sql */ `
      SELECT
        last_sequence AS last_sequence,
        last_log_sequence AS last_log_sequence
      FROM
        ${TABLE_NAMES.STREAM_EVENT_RESUME}
      WHERE
        hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows[0];
}

async function insertResumeSeqInitial(client: PoolClient, hash: string): Promise<void> {
  await client.query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.STREAM_EVENT_RESUME} (hash, last_sequence, last_log_sequence)
      VALUES
        ($1, 0, 0)
    `,
    [hash],
  );
}

async function updateResumeSeq(client: PoolClient, hash: string, next: number): Promise<void> {
  await client.query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.STREAM_EVENT_RESUME}
      SET
        last_sequence = $1,
        updated_at = NOW()
      WHERE
        hash = $2
    `,
    [next, hash],
  );
}

async function updateResumeLogSeq(client: PoolClient, hash: string, next: number): Promise<void> {
  await client.query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.STREAM_EVENT_RESUME}
      SET
        last_log_sequence = $1,
        updated_at = NOW()
      WHERE
        hash = $2
    `,
    [next, hash],
  );
}

/**
 * Next `id:` for room **`/room/events`** — caller may wrap in a transaction.
 */
export async function nextRoomEventSequenceForHashInTx(
  client: PoolClient,
  hash: string,
): Promise<number> {
  let row = await selectResumeRow(client, hash);

  if (!row) {
    await insertResumeSeqInitial(client, hash);
    row = await selectResumeRow(client, hash);
  }

  if (!row) {
    throw new Error("stream_event_resume_insert_failed");
  }

  const next = row.last_sequence + 1;

  await updateResumeSeq(client, hash, next);

  return next;
}

/**
 * Monotonic per-hash sequence for room Server-Sent Events `id:` fields (reconnect / resume).
 */
export async function allocateEventSequence(hash: string): Promise<number> {
  return withPgTransaction(async (client) => nextRoomEventSequenceForHashInTx(client, hash));
}

/**
 * Next `id:` for **`/logs/stream`** — caller may wrap in a transaction (e.g. with `room_log_line` insert).
 */
export async function nextLogEventSequenceForHashInTx(
  client: PoolClient,
  hash: string,
): Promise<number> {
  let row = await selectResumeRow(client, hash);

  if (!row) {
    await insertResumeSeqInitial(client, hash);
    row = await selectResumeRow(client, hash);
  }

  if (!row) {
    throw new Error("stream_event_resume_insert_failed");
  }

  const next = row.last_log_sequence + 1;

  await updateResumeLogSeq(client, hash, next);

  return next;
}

/**
 * Monotonic per-hash sequence for **`/logs/stream`** Server-Sent Events only (independent of room/events).
 */
export async function allocateLogEventSequence(hash: string): Promise<number> {
  return withPgTransaction(async (client) => nextLogEventSequenceForHashInTx(client, hash));
}

export async function lastEventSeq(hash: string): Promise<number> {
  const { rows } = await getPool().query<StreamEventResumeRow>(
    /* sql */ `
      SELECT
        last_sequence AS last_sequence,
        last_log_sequence AS last_log_sequence
      FROM
        ${TABLE_NAMES.STREAM_EVENT_RESUME}
      WHERE
        hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows[0]?.last_sequence ?? 0;
}

export async function lastLogEventSeq(hash: string): Promise<number> {
  const { rows } = await getPool().query<StreamEventResumeRow>(
    /* sql */ `
      SELECT
        last_sequence AS last_sequence,
        last_log_sequence AS last_log_sequence
      FROM
        ${TABLE_NAMES.STREAM_EVENT_RESUME}
      WHERE
        hash = $1
      LIMIT
        1
    `,
    [hash],
  );

  return rows[0]?.last_log_sequence ?? 0;
}

/**
 * Reset the log cursor when `room_log_line` is cleared for a new prefetch run.
 */
export async function resetLogEventSequence(hash: string): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.STREAM_EVENT_RESUME}
      SET
        last_log_sequence = 0,
        updated_at = NOW()
      WHERE
        hash = $1
    `,
    [hash],
  );
}
