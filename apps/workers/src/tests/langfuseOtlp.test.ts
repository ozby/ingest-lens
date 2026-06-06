import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportOtlpTrace } from "../langfuse/otlp";

const CREDENTIALS = {
  publicKey: "pk-test-123",
  secretKey: "sk-test-456",
  baseUrl: "https://cloud.langfuse.com",
};

const BASE_INPUT = {
  traceId: "550e8400-e29b-41d4-a716-446655440000",
  model: "gpt-4o",
  promptName: "payload-mapper",
  promptVersion: "v3",
  promptText: "Map this payload",
  outputText: "Mapped output",
  startTimeMs: 1700000000000,
  endTimeMs: 1700000001234,
  credentials: CREDENTIALS,
};

type OtlpAttr = { key: string; value: { stringValue?: string; intValue?: number } };

function getFirstCallArgs(
  spy: ReturnType<typeof vi.fn>,
): [string, { headers: Record<string, string>; body: string }] {
  const call = spy.mock.calls[0];
  if (!call) throw new Error("Expected fetch to have been called");
  const [url, init] = call;
  return [url as string, init as { headers: Record<string, string>; body: string }];
}

function parseSpan(spy: ReturnType<typeof vi.fn>): {
  traceId: string;
  spanId: string;
  attributes: OtlpAttr[];
} {
  const [, init] = getFirstCallArgs(spy);
  const body = JSON.parse(init.body);
  return body.resourceSpans[0].scopeSpans[0].spans[0] as {
    traceId: string;
    spanId: string;
    attributes: OtlpAttr[];
  };
}

describe("exportOtlpTrace", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("normalizes UUID to 32-char lowercase hex trace id", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const span = parseSpan(fetchSpy);
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.traceId).toBe("550e8400e29b41d4a716446655440000");
  });

  it("generates a 16-char lowercase hex span id when not provided", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const span = parseSpan(fetchSpy);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("uses provided spanId normalized to 16-char hex", async () => {
    await exportOtlpTrace({ ...BASE_INPUT, spanId: "abcd-ef01-2345-6789" });

    const span = parseSpan(fetchSpy);
    // spanId provided — stripped of hyphens and truncated/padded to 16 chars
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("sets langfuse.observation.type = generation attribute", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const span = parseSpan(fetchSpy);
    const obsType = span.attributes.find((a) => a.key === "langfuse.observation.type");
    expect(obsType?.value.stringValue).toBe("generation");
  });

  it("includes prompt name in attributes", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const span = parseSpan(fetchSpy);
    const promptName = span.attributes.find((a) => a.key === "langfuse.observation.prompt.name");
    expect(promptName?.value.stringValue).toBe("payload-mapper");
  });

  it("includes prompt version in attributes", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const span = parseSpan(fetchSpy);
    const promptVersion = span.attributes.find(
      (a) => a.key === "langfuse.observation.prompt.version",
    );
    expect(promptVersion?.value.stringValue).toBe("v3");
  });

  it("includes model in attributes", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const span = parseSpan(fetchSpy);
    const model = span.attributes.find((a) => a.key === "gen_ai.request.model");
    expect(model?.value.stringValue).toBe("gpt-4o");
  });

  it("posts to the correct OTLP endpoint", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const [url] = getFirstCallArgs(fetchSpy);
    expect(url).toBe("https://cloud.langfuse.com/api/public/otel/v1/traces");
  });

  it("sends Basic Auth header derived from public and secret key", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const [, init] = getFirstCallArgs(fetchSpy);
    const expected = `Basic ${btoa("pk-test-123:sk-test-456")}`;
    expect(init.headers["Authorization"]).toBe(expected);
  });

  it("sends x-langfuse-ingestion-version: 4 header", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const [, init] = getFirstCallArgs(fetchSpy);
    expect(init.headers["x-langfuse-ingestion-version"]).toBe("4");
  });

  it("sends Content-Type: application/json header", async () => {
    await exportOtlpTrace(BASE_INPUT);

    const [, init] = getFirstCallArgs(fetchSpy);
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("does not throw when fetch rejects", async () => {
    fetchSpy.mockRejectedValue(new Error("network error"));

    await expect(exportOtlpTrace(BASE_INPUT)).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "langfuse.otlp.export_failed",
      expect.objectContaining({ reason: "network error" }),
    );
  });

  it("does not throw when fetch returns non-2xx", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(exportOtlpTrace(BASE_INPUT)).resolves.toBeUndefined();
  });

  it("clamps input text exceeding 8000 chars", async () => {
    const longInput = "x".repeat(9000);
    await exportOtlpTrace({ ...BASE_INPUT, promptText: longInput });

    const span = parseSpan(fetchSpy);
    const inputAttr = span.attributes.find((a) => a.key === "gen_ai.prompt");
    expect(inputAttr?.value.stringValue?.length).toBeLessThanOrEqual(8000);
  });

  it("clamps output text exceeding 8000 chars", async () => {
    const longOutput = "y".repeat(9000);
    await exportOtlpTrace({ ...BASE_INPUT, outputText: longOutput });

    const span = parseSpan(fetchSpy);
    const outputAttr = span.attributes.find((a) => a.key === "gen_ai.completion");
    expect(outputAttr?.value.stringValue?.length).toBeLessThanOrEqual(8000);
  });

  it("includes token usage when provided", async () => {
    await exportOtlpTrace({
      ...BASE_INPUT,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const span = parseSpan(fetchSpy);
    const promptTokens = span.attributes.find((a) => a.key === "gen_ai.usage.prompt_tokens");
    const completionTokens = span.attributes.find(
      (a) => a.key === "gen_ai.usage.completion_tokens",
    );
    expect(promptTokens?.value.intValue).toBe(100);
    expect(completionTokens?.value.intValue).toBe(50);
  });
});
