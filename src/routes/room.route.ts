import { Router } from "express";

import {
  handlePatchHashActive,
  handlePostHashCancel,
  handlePostHashRefetch,
} from "@/handlers/hashOps.handler";
import { handleGetRoomEvents, handleGetRoomLogStream } from "@/handlers/room.handler";
import { requireAuth } from "@/middleware/auth.middleware";

export const roomRouter = Router();

roomRouter.get("/hashes/:hash/room/events", requireAuth, handleGetRoomEvents);
roomRouter.get("/hashes/:hash/logs/stream", requireAuth, handleGetRoomLogStream);
roomRouter.post("/hashes/:hash/refetch", requireAuth, handlePostHashRefetch);
roomRouter.post("/hashes/:hash/cancel", requireAuth, handlePostHashCancel);
roomRouter.patch("/hashes/:hash/active", requireAuth, handlePatchHashActive);
