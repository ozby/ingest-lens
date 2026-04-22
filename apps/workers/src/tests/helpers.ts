import { vi } from "vitest";
import type { Env, DeliveryPayload } from "../db/client";

export function createMockEnv(
  deliveryQueue: Pick<Queue<DeliveryPayload>, "send"> = { send: vi.fn() },
  rateLimiter: Pick<RateLimit, "limit"> = { limit: vi.fn().mockResolvedValue({ success: true }) },
): Env {
  return {
    HYPERDRIVE: null as unknown as Hyperdrive,
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "test-secret",
    NODE_ENV: "test",
    DELIVERY_QUEUE: deliveryQueue as Queue<DeliveryPayload>,
    RATE_LIMITER: rateLimiter as RateLimit,
  };
}
