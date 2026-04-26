import { describe, it, expect } from "vitest";
import { classifyFailure, retryDelaySeconds } from "../consumers/failureClassifier";

describe("classifyFailure", () => {
  it.each([401, 403, 404, 410, 422, 451])("classifies %i as permanent", (status) => {
    expect(classifyFailure(status)).toBe("permanent");
  });

  it.each([408, 425, 429, 500, 502, 503, 504])("classifies %i as transient", (status) => {
    expect(classifyFailure(status)).toBe("transient");
  });

  it('classifies "throw" as transient', () => {
    expect(classifyFailure("throw")).toBe("transient");
  });

  it("retryDelaySeconds: permanent 4xx returns 0 regardless of attempt", () => {
    expect(retryDelaySeconds(401, 1)).toBe(0);
    expect(retryDelaySeconds(410, 5)).toBe(0);
  });

  it("retryDelaySeconds: transient uses exponential backoff by attempt", () => {
    expect(retryDelaySeconds(500, 1)).toBe(5);
    expect(retryDelaySeconds(500, 3)).toBe(20);
    expect(retryDelaySeconds(429, 5)).toBe(80);
  });
});
