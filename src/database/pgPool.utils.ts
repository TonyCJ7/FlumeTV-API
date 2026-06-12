import { Pool } from "pg";

let pool: Pool | null = null;

function resolvePoolMax(): number {
  if (process.env.PREFETCH_SYNC_WORKER === "1") {
    return parseInt(process.env.PG_POOL_MAX_WORKER || "2", 10);
  }

  return parseInt(process.env.PG_POOL_MAX || "10", 10);
}

export function assertDatabaseUrlConfigured(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

export function createPool(): Pool {
  const databaseUrl = assertDatabaseUrlConfigured();

  return new Pool({
    connectionString: databaseUrl,
    max: resolvePoolMax(),
  });
}

export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  const closing = pool;
  pool = null;
  await closing.end();
}
