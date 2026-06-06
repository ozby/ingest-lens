import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangfuseClient } from "@langfuse/client";
import {
  CACHE_TTL_SECONDS,
  FALLBACK_PROMPT_TEXT,
  FALLBACK_PROMPT_VERSION,
  PROMPT_NAME,
  fetchPayloadMapperPrompt,
} from "../langfuse/prompts";

const CREDENTIALS = {
  LANGFUSE_PUBLIC_KEY: "pk-test-123",
  LANGFUSE_SECRET_KEY: "sk-test-456",
  LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
};

let mockPromptGet: ReturnType<typeof vi.fn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@langfuse/client", () => ({
  LangfuseClient: vi.fn(),
}));

const MockedLangfuseClient = vi.mocked(LangfuseClient);

describe("fetchPayloadMapperPrompt", () => {
  beforeEach(() => {
    mockPromptGet = vi.fn().mockResolvedValue({
      prompt: "Fetched prompt text from Langfuse",
      name: PROMPT_NAME,
      version: 42,
      isFallback: false,
    });
    MockedLangfuseClient.mockImplementation(function (
      this: Record<string, unknown>,
      params: unknown,
    ) {
      this._constructorParams = params;
      this.prompt = { get: mockPromptGet };
    } as never);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("constructs LangfuseClient with correct baseUrl", async () => {
    await fetchPayloadMapperPrompt(CREDENTIALS);

    const params = MockedLangfuseClient.mock.calls[0]?.[0] as Record<string, string>;
    expect(params.baseUrl).toBe("https://cloud.langfuse.com");
  });

  it("constructs LangfuseClient with publicKey and secretKey", async () => {
    await fetchPayloadMapperPrompt(CREDENTIALS);

    const params = MockedLangfuseClient.mock.calls[0]?.[0] as Record<string, string>;
    expect(params.publicKey).toBe("pk-test-123");
    expect(params.secretKey).toBe("sk-test-456");
  });

  it("calls prompt.get with correct prompt name, label, and cacheTtlSeconds", async () => {
    await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(mockPromptGet).toHaveBeenCalledWith(PROMPT_NAME, {
      label: "production",
      cacheTtlSeconds: CACHE_TTL_SECONDS,
      fallback: FALLBACK_PROMPT_TEXT,
    });
  });

  it("returns promptText from Langfuse response", async () => {
    const result = await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(result.promptText).toBe("Fetched prompt text from Langfuse");
  });

  it("returns promptName from Langfuse response", async () => {
    const result = await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(result.promptName).toBe(PROMPT_NAME);
  });

  it("returns promptVersion as string from numeric version", async () => {
    const result = await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(result.promptVersion).toBe("42");
  });

  it("returns usedFallback: false when Langfuse responds successfully", async () => {
    const result = await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(result.usedFallback).toBe(false);
  });

  it("returns fallback when Langfuse client throws", async () => {
    mockPromptGet.mockRejectedValue(new Error("network error"));

    const result = await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(result.promptText).toBe(FALLBACK_PROMPT_TEXT);
    expect(result.promptName).toBe(PROMPT_NAME);
    expect(result.promptVersion).toBe(FALLBACK_PROMPT_VERSION);
    expect(result.usedFallback).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "langfuse.prompt.fetch_failed",
      expect.objectContaining({
        promptName: PROMPT_NAME,
        reason: "network error",
      }),
    );
  });

  it("returns fallback metadata when SDK returns isFallback: true", async () => {
    mockPromptGet.mockResolvedValue({
      prompt: FALLBACK_PROMPT_TEXT,
      name: PROMPT_NAME,
      version: 1,
      isFallback: true,
    });

    const result = await fetchPayloadMapperPrompt(CREDENTIALS);

    expect(result.usedFallback).toBe(true);
    expect(result.promptVersion).toBe("1");
  });

  it("returns fallback without calling Langfuse when LANGFUSE_PUBLIC_KEY is missing", async () => {
    const result = await fetchPayloadMapperPrompt({
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: "sk-test-456",
      LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
    });

    expect(mockPromptGet).not.toHaveBeenCalled();
    expect(MockedLangfuseClient).not.toHaveBeenCalled();
    expect(result.usedFallback).toBe(true);
    expect(result.promptText).toBe(FALLBACK_PROMPT_TEXT);
    expect(result.promptVersion).toBe(FALLBACK_PROMPT_VERSION);
  });

  it("returns fallback without calling Langfuse when LANGFUSE_SECRET_KEY is missing", async () => {
    const result = await fetchPayloadMapperPrompt({
      LANGFUSE_PUBLIC_KEY: "pk-test-123",
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
    });

    expect(mockPromptGet).not.toHaveBeenCalled();
    expect(result.usedFallback).toBe(true);
    expect(result.promptText).toBe(FALLBACK_PROMPT_TEXT);
  });

  it("fallback promptText contains contract/source/payload instruction fields", () => {
    expect(FALLBACK_PROMPT_TEXT).toContain("deterministic intake system");
    expect(FALLBACK_PROMPT_TEXT).toContain("Return JSON only");
    expect(FALLBACK_PROMPT_TEXT).toContain("Abstain instead of inventing fields");
  });
});
