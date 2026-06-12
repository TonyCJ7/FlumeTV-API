import { TABLE_NAMES } from "@/constants/dbBuild.constants";

import { getPool } from "./pgPool.utils";

export async function setAllUsersHasProxy(value: boolean): Promise<number> {
  const { rowCount } = await getPool().query(
    /* sql */ `
      UPDATE ${TABLE_NAMES.USER}
      SET
        has_proxy = $1
    `,
    [value],
  );

  return rowCount ?? 0;
}

export async function setHasProxyForUserIds(userIds: string[], enabled: boolean): Promise<void> {
  if (enabled) {
    await getPool().query(
      /* sql */ `
        UPDATE ${TABLE_NAMES.USER}
        SET
          has_proxy = (user_id = ANY ($1::text[]))
      `,
      [userIds],
    );

    return;
  }

  await getPool().query(/* sql */ `
    UPDATE ${TABLE_NAMES.USER}
    SET
      has_proxy = FALSE
  `);
}
