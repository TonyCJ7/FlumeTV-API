import "dotenv/config";

import { runPendingMigrations } from "@/database/migrate.db";
import { closePool, getPool } from "@/database/pgPool.utils";
import { logError, logInfo } from "@/utils/debug.utils";

async function main(): Promise<void> {
  const pool = getPool();

  logInfo("migrate", "Running pending migrations");
  await runPendingMigrations(pool);
  logInfo("migrate", "Migrations complete");
  await closePool();
}

main().catch(async (err) => {
  logError("migrate", "Migration failed", err);

  try {
    await closePool();
  } catch {
    // ignore close errors during failure exit
  }

  process.exit(1);
});
