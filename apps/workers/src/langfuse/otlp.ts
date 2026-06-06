const MAX_FIELD_LEN = 8000;
const SPAN_ID_HEX_LEN = 16;

export type OtlpExportInput = {
  traceId: string;
  spanId?: string;
  model: string;
  promptName: string;
  promptVersion: string;
  promptText: string;
  outputText: string;
  startTimeMs: number;
  endTimeMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  credentials: {
    publicKey: string;
    secretKey: string;
    baseUrl: string;
  };
};

type OtlpStringAttr = { key: string; value: { stringValue: string } };
type OtlpIntAttr = { key: string; value: { intValue: number } };
type OtlpAttr = OtlpStringAttr | OtlpIntAttr;

function normalizeTraceId(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSpanId(raw: string): string {
  const stripped = raw.replace(/-/g, "").toLowerCase();
  if (stripped.length >= SPAN_ID_HEX_LEN) {
    return stripped.slice(0, SPAN_ID_HEX_LEN);
  }
  return stripped.padEnd(SPAN_ID_HEX_LEN, "0");
}

function clampField(value: string): string {
  return value.length > MAX_FIELD_LEN ? value.slice(0, MAX_FIELD_LEN) : value;
}

function msToOtlpNanos(ms: number): string {
  return String(ms * 1_000_000);
}

function stringAttr(key: string, value: string): OtlpStringAttr {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtlpIntAttr {
  return { key, value: { intValue: value } };
}

export async function exportOtlpTrace(input: OtlpExportInput): Promise<void> {
  const {
    traceId,
    spanId,
    model,
    promptName,
    promptVersion,
    promptText,
    outputText,
    startTimeMs,
    endTimeMs,
    usage,
    credentials,
  } = input;

  const resolvedTraceId = normalizeTraceId(traceId);
  const resolvedSpanId = spanId !== undefined ? normalizeSpanId(spanId) : generateSpanId();

  const attributes: OtlpAttr[] = [
    stringAttr("langfuse.observation.type", "generation"),
    stringAttr("langfuse.observation.prompt.name", promptName),
    stringAttr("langfuse.observation.prompt.version", promptVersion),
    stringAttr("gen_ai.request.model", model),
    stringAttr("gen_ai.prompt", clampField(promptText)),
    stringAttr("gen_ai.completion", clampField(outputText)),
  ];

  if (usage?.promptTokens !== undefined) {
    attributes.push(intAttr("gen_ai.usage.prompt_tokens", usage.promptTokens));
  }
  if (usage?.completionTokens !== undefined) {
    attributes.push(intAttr("gen_ai.usage.completion_tokens", usage.completionTokens));
  }
  if (usage?.totalTokens !== undefined) {
    attributes.push(intAttr("gen_ai.usage.total_tokens", usage.totalTokens));
  }

  const payload = {
    resourceSpans: [
      {
        resource: { attributes: [] as OtlpAttr[] },
        scopeSpans: [
          {
            scope: { name: "ingest-lens" },
            spans: [
              {
                traceId: resolvedTraceId,
                spanId: resolvedSpanId,
                name: promptName,
                kind: 3,
                startTimeUnixNano: msToOtlpNanos(startTimeMs),
                endTimeUnixNano: msToOtlpNanos(endTimeMs),
                attributes,
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };

  const endpoint = `${credentials.baseUrl}/api/public/otel/v1/traces`;
  const authHeader = `Basic ${btoa(`${credentials.publicKey}:${credentials.secretKey}`)}`;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "x-langfuse-ingestion-version": "4",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("langfuse.otlp.export_failed", {
      endpoint,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
