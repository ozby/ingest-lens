import { describe, expect, it } from "vitest";
import {
  defaultHashPayload,
  validateIntakeRequest,
} from "../intake/validateIntakeRequest";

const fixedNow = new Date("2026-04-24T00:00:00.000Z");
const deps = {
  clock: () => fixedNow,
  hashPayload: defaultHashPayload,
  idGenerator: () => "generated-id",
};

describe("validateIntakeRequest", () => {
  it("rejects unknown contracts before any AI call", () => {
    const result = validateIntakeRequest(
      {
        contractId: "missing-contract",
        payload: { name: "Demo" },
        queueId: "queue-1",
        sourceSystem: "manual",
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain("Unknown contract id.");
  });

  it("rejects requests that provide both payload and fixtureId", () => {
    const result = validateIntakeRequest(
      {
        contractId: "job-posting-v1",
        fixtureId: "ashby-job-001",
        payload: { name: "Demo" },
        queueId: "queue-1",
        sourceSystem: "manual",
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain(
      "Provide exactly one source input: fixtureId xor payload.",
    );
  });

  it("rejects payloads that exceed depth limits", () => {
    const payload = { a: { b: { c: { d: { e: { f: { g: { h: { i: true } } } } } } } } };

    const result = validateIntakeRequest(
      {
        contractId: "job-posting-v1",
        payload,
        queueId: "queue-1",
        sourceSystem: "manual",
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain("Payload depth must be <= 8.");
  });

  it("accepts inline payloads and assigns review TTL metadata", () => {
    const result = validateIntakeRequest(
      {
        contractId: "job-posting-v1",
        payload: { name: "Demo Job", post_url: "https://example.com" },
        queueId: "queue-1",
        sourceSystem: "manual",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected validation success");
    }

    expect(result.value.reviewPayload).toEqual({
      name: "Demo Job",
      post_url: "https://example.com",
    });
    expect(result.value.reviewPayloadExpiresAt).toBe("2026-04-25T00:00:00.000Z");
    expect(result.value.sourceKind).toBe("inline_payload");
  });

  it("accepts fixture references without storing raw review payload", () => {
    const result = validateIntakeRequest(
      {
        contractId: "job-posting-v1",
        fixtureId: "lever-posting-001",
        topicId: "topic-1",
        sourceSystem: "manual",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected validation success");
    }

    expect(result.value.reviewPayload).toBeNull();
    expect(result.value.reviewPayloadExpiresAt).toBeUndefined();
    expect(result.value.sourceKind).toBe("fixture_reference");
    expect(result.value.sourceSystem).toBe("lever");
    expect(result.value.deliveryTarget.topicId).toBe("topic-1");
  });
});
