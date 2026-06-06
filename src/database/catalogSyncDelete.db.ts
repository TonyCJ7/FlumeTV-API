import type { PoolClient } from "pg";

export async function deleteCatalogRowsByHash(
  client: PoolClient,
  tableName: string,
  hash: string,
): Promise<void> {
  await client.query(
    /* sql */ `
      DELETE FROM ${tableName}
      WHERE
        hash = $1
    `,
    [hash],
  );
}
