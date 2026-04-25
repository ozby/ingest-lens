import { describe, expect, it } from "vitest";

const baseUrl = process.env.E2E_BASE_URL;

if (!baseUrl) {
  throw new Error("E2E_BASE_URL is required for apps/e2e/journeys/worker-health.e2e.ts");
}

describe("worker health", () => {
  it("returns 200 ok from the live worker runtime", async () => {
    const response = await fetch(new URL("/health", baseUrl));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
