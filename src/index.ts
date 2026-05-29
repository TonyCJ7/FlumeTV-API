import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import "@/types/rest.types";

import { PORT } from "./constants/common.constants";
import { killAllPrefetchWorkers } from "./core/prefetchSyncWorkerProcess";
import { sweepTerminalRoomsOnStartup } from "./core/roomLifecycle";
import { startSchedulerDueLoop } from "./core/schedulerDue";
import { closePool, initializeDatabase } from "./database";
import { requestLogMiddleware } from "./middleware/requestLog.middleware";
import { securityHeadersMiddleware } from "./middleware/securityHeaders.middleware";
import { addonRouter } from "./routes/addon.route";
import { authRouter } from "./routes/auth.route";
import { configRouter } from "./routes/config.route";
import { roomRouter } from "./routes/room.route";
import { stremioRouter } from "./routes/stremio.route";
import { assertAddonSecretConfigured } from "./utils/crypto.utils";
import { isDebug, logError, logInfo } from "./utils/debug.utils";
import { frontendOriginsFromEnv } from "./utils/frontendOrigin.utils";

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  // Optional dep — load only when outbound proxy env is set.
  await import("global-agent/bootstrap");
}

assertAddonSecretConfigured();

logInfo("startup", "Initializing database");
await initializeDatabase();
logInfo("startup", "Database ready");

await sweepTerminalRoomsOnStartup();

logInfo("startup", "Starting scheduler due loop");
startSchedulerDueLoop();
const app = express();

app.disable("x-powered-by");
app.use(securityHeadersMiddleware);

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: frontendOriginsFromEnv(),
    credentials: true,
  }),
);

const jsonBodyAuth = express.json({ limit: "32kb" });
const jsonBodyDefault = express.json({ limit: "50mb" });

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth")) {
    jsonBodyAuth(req, res, next);
    return;
  }

  jsonBodyDefault(req, res, next);
});
app.use(cookieParser());
app.use(requestLogMiddleware);

const apiRouter = express.Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/configs", configRouter);
apiRouter.use("/stremio", stremioRouter);
apiRouter.use("/", roomRouter);
app.use("/api", apiRouter);

app.use("/:config_hash", addonRouter);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  logError("HTTP", "Unhandled route error", err);
  res.status(500).json({ code: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
});

const dev = process.env.NODE_ENV !== "production";

let shuttingDown = false;

function registerProcessShutdownHandlers(): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logInfo("startup", `Shutting down (${signal})`);
    killAllPrefetchWorkers();

    void (async (): Promise<void> => {
      try {
        await closePool();
      } catch (err) {
        logError("startup", "Database pool close failed", err);
      }

      process.exit(0);
    })();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

registerProcessShutdownHandlers();

app.listen(PORT, () => {
  logInfo(
    "startup",
    `FlumeTV API ready on http://localhost:${PORT} (${dev ? "development" : "production"}) DEBUG_MODE=${isDebug()}`,
  );
});
