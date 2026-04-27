import { createMiddleware } from "hono/factory";
import type { Env } from "../db/client";
import type { AuthVariables } from "./auth";

type HonoCtx = { Bindings: Env; Variables: AuthVariables };

function createRateLimiter(selectBinding: (env: Env) => RateLimit | undefined, label: string) {
  return createMiddleware<HonoCtx>(async (c, next) => {
    const binding = selectBinding(c.env);

    if (!binding) {
      if (c.env.NODE_ENV === "production") {
        return c.json(
          { status: "error", message: `Server misconfiguration: ${label} binding not available` },
          500,
        );
      }
      console.warn(
        `[rateLimiter] ${label} binding is absent — rate limiting is DISABLED for this request.`,
      );
      await next();
      return;
    }

    const user = c.get("user");
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
