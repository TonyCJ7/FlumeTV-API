import { Router } from "express";

import { handleGetStremioManifestUrl } from "@/handlers/stremioInstall.handler";
import { requireAuth } from "@/middleware/auth.middleware";

export const stremioRouter = Router();

stremioRouter.get("/manifest-url", requireAuth, handleGetStremioManifestUrl);
