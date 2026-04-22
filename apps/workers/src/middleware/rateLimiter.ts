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
  const user = c.get("user");
  const { success } = await c.env.RATE_LIMITER.limit({ key: user.userId });

  if (!success) {
    return c.json({ status: "error", message: "Rate limit exceeded" }, 429, {
      "Retry-After": "60",
    });
  }

  await next();
});
