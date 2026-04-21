import { describe, it, expect } from "vitest";
import app from "../index";

describe("Health check", () => {
  it("returns 200 ok", async () => {
    const req = new Request("http://localhost/health");
    const res = await app.fetch(req, {
      HYPERDRIVE: null,
      DATABASE_URL: "",
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
