import { createMiddleware } from "hono/factory";
import type { Env } from "../db/client";
import type { DecodedToken } from "./auth";

type RateLimiterVariables = {
  user: DecodedToken;
};

export const rateLimiter = createMiddleware<{
  Bindings: Env;
  Variables: RateLimiterVariables;
}>(async (c, next) => {
  const rateLimiterBinding = c.env.RATE_LIMITER;

  if (!rateLimiterBinding) {
    // FIX-7 (CSO audit): warn loudly so the absence doesn't go unnoticed in
    // staging/production logs.  In local wrangler dev the binding is absent by
    // design; in deployed envs it must always be present.
    console.warn(
      "[rateLimiter] RATE_LIMITER binding is absent — rate limiting is DISABLED for this request.",
    );
    await next();
    return;
  }

  // Use the authenticated userId when available; fall back to the client IP for
  // unauthenticated routes (e.g. /api/auth/register, /api/auth/login).
  const user = c.get("user") as DecodedToken | undefined;
  const key =
    user?.userId ??
    c.req.raw.headers.get("CF-Connecting-IP") ??
    c.req.raw.headers.get("X-Forwarded-For") ??
    "anonymous";

  const { success } = await rateLimiterBinding.limit({ key });

  if (!success) {
    return c.json({ status: "error", message: "Rate limit exceeded" }, 429, {
      "Retry-After": "60",
    });
  }

  await next();
});
