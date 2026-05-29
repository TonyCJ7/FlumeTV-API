import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const MIGRATION_ADVISORY_LOCK_ID = 839274651;

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((name) => name.endsWith(".sql"));

  return sqlFiles.sort();
}

async function upsertSchemaMigrationsTable(client: Pool | PoolClient): Promise<void> {
  await client.query(/* sql */ `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW ()
    )
  `);
}

async function listAppliedVersions(client: Pool | PoolClient): Promise<Set<string>> {
  await upsertSchemaMigrationsTable(client);

  const { rows } = await client.query<{ version: string }>("SELECT version FROM schema_migrations");

  return new Set(rows.map((row) => row.version));
}

/** Recover from a concurrent first-boot race that applied DDL but never recorded versions. */
async function baselineIfSchemaPresentWithoutMigrations(client: PoolClient): Promise<void> {
  const applied = await listAppliedVersions(client);

  if (applied.size > 0) {
    return;
  }

  const { rows } = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'stream_fetch_status'
    ) AS exists
  `);

  if (!rows[0]?.exists) {
    return;
  }

  const files = await listMigrationFiles();

  for (const file of files) {
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
      [file],
    );
  }
}

export async function runPendingMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_ID]);
    await baselineIfSchemaPresentWithoutMigrations(client);

    const files = await listMigrationFiles();
    const applied = await listAppliedVersions(client);

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_ID]);
    client.release();
  }
}
