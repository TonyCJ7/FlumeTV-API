import { runPendingMigrations } from "./migrate.db";
import { closePool, getPool } from "./pgPool.utils";
import { insertSchedulerUserIfMissing } from "./user.db";
import { logError } from "../utils/debug.utils";

export { closePool, getPool };

export async function initializeDatabase(): Promise<void> {
  try {
    await runPendingMigrations(getPool());

    await insertSchedulerUserIfMissing();
  } catch (err) {
    logError("database", "Initialization failed", err);
    throw err;
  }
}
