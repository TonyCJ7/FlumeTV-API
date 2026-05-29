import { Router } from "express";

import { handleDeleteConfig } from "@/handlers/deleteConfig.handler";
import { handleGetConfigs } from "@/handlers/getConfigs.handler";
import { handleGetConfigsPrefetchStatus } from "@/handlers/getConfigsPrefetchStatus.handler";
import { handleGetConfigsPrefetchStatusStream } from "@/handlers/getConfigsPrefetchStatusStream.handler";
import { handlePostConfig } from "@/handlers/postConfig.handler";
import { handlePutConfig } from "@/handlers/putConfig.handler";
import { requireAuth } from "@/middleware/auth.middleware";

export const configRouter = Router();

configRouter.get("/prefetch-status/stream", requireAuth, handleGetConfigsPrefetchStatusStream);
configRouter.get("/prefetch-status", requireAuth, handleGetConfigsPrefetchStatus);
configRouter.get("/", requireAuth, handleGetConfigs);
configRouter.post("/", requireAuth, handlePostConfig);
configRouter.delete("/:hash", requireAuth, handleDeleteConfig);
configRouter.put("/:hash", requireAuth, handlePutConfig);
