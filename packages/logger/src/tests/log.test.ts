import { describe, it, expect, vi } from "vitest";
import { log } from "..";

describe("@repo/logger", () => {
  it("prints a message", () => {
    const consoleLogSpy = vi.spyOn(global.console, "log");

    log("hello");

    expect(consoleLogSpy).toHaveBeenCalledWith("LOGGER: ", "hello");
  });
});
