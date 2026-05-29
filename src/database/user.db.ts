import { randomBytes } from "node:crypto";

import { TABLE_NAMES } from "@/constants/dbBuild.constants";
import { SCHEDULER_TRIGGER_USER_ID } from "@/constants/room.constants";
import { hashPassword } from "@/utils/password.utils";

import { getPool } from "./pgPool.utils";

export async function insertUser(userId: string, passwordHash: string): Promise<void> {
  await getPool().query(
    /* sql */ `
      INSERT INTO
        ${TABLE_NAMES.USER} (user_id, password_hash)
      VALUES
        ($1, $2)
    `,
    [userId, passwordHash],
  );
}

export async function getPasswordHash(userId: string): Promise<string | undefined> {
  const { rows } = await getPool().query<{ password_hash: string }>(
    /* sql */ `
      SELECT
        password_hash
      FROM
        ${TABLE_NAMES.USER}
      WHERE
        user_id = $1
    `,
    [userId],
  );

  return rows[0]?.password_hash;
}

export async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.USER}
      SET
        password_hash = $1
      WHERE
        user_id = $2
    `,
    [passwordHash, userId],
  );
}

/**
 * Inserts a dedicated `user` row for scheduler-driven rooms (`SCHEDULER_TRIGGER_USER_ID`) when missing.
 * Password is random and discarded so the account is not meant for interactive login.
 */
export async function insertSchedulerUserIfMissing(): Promise<void> {
  const existing = await getPasswordHash(SCHEDULER_TRIGGER_USER_ID);

  if (existing !== undefined) {
    return;
  }

  const disposablePlainPassword = randomBytes(48).toString("hex");
  const passwordHash = await hashPassword(disposablePlainPassword);

  await insertUser(SCHEDULER_TRIGGER_USER_ID, passwordHash);
}
