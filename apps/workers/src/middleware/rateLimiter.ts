import { createMiddleware } from "hono/factory";
import type { Env } from "../db/client";
import type { DecodedToken } from "./auth";

type RateLimiterVariables = {
  user: DecodedToken;
};

type HonoCtx = { Bindings: Env; Variables: RateLimiterVariables };

function createRateLimiter(selectBinding: (env: Env) => RateLimit | undefined, label: string) {
  return createMiddleware<HonoCtx>(async (c, next) => {
    const binding = selectBinding(c.env);

    if (!binding) {
      console.warn(
        `[rateLimiter] ${label} binding is absent — rate limiting is DISABLED for this request.`,
      );
      await next();
      return;
    }

    const user = c.get("user") as DecodedToken | undefined;
    const key =
      user?.userId ??
      c.req.raw.headers.get("CF-Connecting-IP") ??
      c.req.raw.headers.get("X-Forwarded-For") ??
      "anonymous";

    const { success } = await binding.limit({ key });

    if (!success) {
      return c.json({ status: "error", message: "Rate limit exceeded" }, 429, {
        "Retry-After": "60",
      });
    }

    await next();
  });
}

// General: 100 req/60s (all authenticated API routes)
export const rateLimiter = createRateLimiter((env) => env.RATE_LIMITER, "RATE_LIMITER");

// Auth: 5 req/60s (login + register — brute-force protection)
export const authRateLimiter = createRateLimiter(
  (env) => env.AUTH_RATE_LIMITER ?? env.RATE_LIMITER,
  "AUTH_RATE_LIMITER",
);
