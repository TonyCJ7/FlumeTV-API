import rateLimit from "express-rate-limit";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value || "", 10);

  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Limits brute-force traffic to `/api/auth/register` and `/api/auth/login`. */
export const authRouteRateLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 60),
  standardHeaders: true,
  legacyHeaders: false,
});
