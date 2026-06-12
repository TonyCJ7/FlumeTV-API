import { Router } from "express";

import {
  handleChangePassword,
  handleGetMe,
  handleLogin,
  handleLogout,
  handleRegister,
} from "@/handlers/auth.handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { authRouteRateLimiter } from "@/middleware/authRateLimit.middleware";

export const authRouter = Router();

authRouter.use(authRouteRateLimiter);

authRouter.post("/register", (req, res) => {
  void handleRegister(req, res);
});

authRouter.post("/login", (req, res) => {
  void handleLogin(req, res);
});

authRouter.post("/logout", (req, res) => {
  void handleLogout(req, res);
});

authRouter.get("/me", requireAuth, (req, res) => {
  void handleGetMe(req, res);
});

authRouter.post("/change-password", requireAuth, (req, res) => {
  void handleChangePassword(req, res);
});
