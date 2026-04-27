import { describe, expect, it } from "vitest";
import { getE2EBaseUrlOrThrow } from "../src/journeys/env";

const baseUrl = getE2EBaseUrlOrThrow("apps/e2e/journeys/worker-health.e2e.ts");

describe("worker health", () => {
  it("returns 200 ok from the live worker runtime", async () => {
    const response = await fetch(new URL("/health", baseUrl));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
