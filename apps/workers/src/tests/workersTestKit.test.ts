import { describe, it, expect } from "vitest";
import {
  createMockHyperdrive,
  createMockDurableObjectNamespace,
  createMockExecutionContext,
} from "@webpresso/workers-test-kit";

describe("@webpresso/workers-test-kit — mock factory smoke tests", () => {
  it("createMockHyperdrive() returns an object with connectionString", () => {
    const hyperdrive = createMockHyperdrive();
    expect(hyperdrive).toBeDefined();
    expect(typeof hyperdrive.connectionString).toBe("string");
    expect(hyperdrive.connectionString).toBeTruthy();
  });

  it("createMockHyperdrive() accepts overrides", () => {
    const hyperdrive = createMockHyperdrive({ connectionString: "postgresql://custom/db" });
    expect(hyperdrive.connectionString).toBe("postgresql://custom/db");
  });

  it("createMockDurableObjectNamespace() returns an object with idFromName and get", () => {
    const ns = createMockDurableObjectNamespace();
    expect(ns).toBeDefined();
    expect(typeof ns.idFromName).toBe("function");
    expect(typeof ns.get).toBe("function");
  });

  it("createMockDurableObjectNamespace().idFromName() returns a stub ID", () => {
    const ns = createMockDurableObjectNamespace();
    const id = ns.idFromName("test-room");
    expect(id).toBeDefined();
    expect(typeof id.toString()).toBe("string");
  });

  it("createMockExecutionContext() returns an object with waitUntil and passThroughOnException", () => {
    const ctx = createMockExecutionContext();
    expect(ctx).toBeDefined();
    expect(typeof ctx.waitUntil).toBe("function");
    expect(typeof ctx.passThroughOnException).toBe("function");
  });
});
