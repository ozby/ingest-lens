import { LangfuseClient } from "@langfuse/client";
import type { Env } from "../db/client";

export const PROMPT_NAME = "payload-mapper";
export const FALLBACK_PROMPT_VERSION = "payload-mapper-v1";
export const CACHE_TTL_SECONDS = 60;

/**
 * The static fallback text mirrors what the Langfuse `payload-mapper` prompt stores.
 * Placeholders use the same tokens as buildMappingPrompt() so callers can substitute
 * values with their own templating if needed, or use the raw text in the prompt directly.
 */
export const FALLBACK_PROMPT_TEXT = [
  "You are proposing mapping suggestions for a deterministic intake system.",
  "Return JSON only.",
  "Abstain instead of inventing fields that are absent from the payload.",
].join("\n\n");

export type LangfusePromptResult = {
  promptText: string;
  promptName: string;
  promptVersion: string;
  usedFallback: boolean;
};

function fallbackPromptResult(): LangfusePromptResult {
  return {
    promptText: FALLBACK_PROMPT_TEXT,
    promptName: PROMPT_NAME,
    promptVersion: FALLBACK_PROMPT_VERSION,
    usedFallback: true,
  };
}

/**
 * Fetches the `payload-mapper` prompt from Langfuse using the `production` label.
 * Uses SDK-level caching (`cacheTtlSeconds`). Falls back to `FALLBACK_PROMPT_TEXT`
 * when Langfuse is unavailable or credentials are missing.
 */
export async function fetchPayloadMapperPrompt(
  env: Pick<Env, "LANGFUSE_PUBLIC_KEY" | "LANGFUSE_SECRET_KEY" | "LANGFUSE_BASE_URL">,
): Promise<LangfusePromptResult> {
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = env;

  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    return fallbackPromptResult();
  }

  const client = new LangfuseClient({
    publicKey: LANGFUSE_PUBLIC_KEY,
    secretKey: LANGFUSE_SECRET_KEY,
    baseUrl: LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
  });

  try {
    const result = await client.prompt.get(PROMPT_NAME, {
      label: "production",
      cacheTtlSeconds: CACHE_TTL_SECONDS,
      fallback: FALLBACK_PROMPT_TEXT,
    });

    return {
      promptText: result.prompt as string,
      promptName: result.name,
      promptVersion: String(result.version),
      usedFallback: result.isFallback,
    };
  } catch (error) {
    console.error("langfuse.prompt.fetch_failed", {
      promptName: PROMPT_NAME,
      reason: error instanceof Error ? error.message : String(error),
    });
    return fallbackPromptResult();
  }
}
