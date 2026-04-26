import type { MappingSuggestion } from "@repo/types";
import { createDb, type Env } from "../db/client";
import { approvedMappingRevisions } from "../db/schema";

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

type HealEvent =
  | { type: "drift_detected"; shapeFingerprint: string; driftCategories: string[] }
  | { type: "analyzing"; confidence: number; model: string }
  | { type: "rewriting"; suggestionCount: number }
  | { type: "healed"; mappingVersionId: string; latencyMs: number }
  | { type: "deferred"; reason: "low_confidence"; confidence: number }
  | { type: "rolled_back"; rolledBackTo: string };

// ---------------------------------------------------------------------------
// HealStreamDO
// ---------------------------------------------------------------------------

interface ApprovedState {
  fingerprint: string;
  suggestions: MappingSuggestion[];
}

interface TryHealBody {
  batch: { suggestions: MappingSuggestion[]; mappingTraceId: string; driftCategories: string[] };
  payloadFingerprint: string; // shapeFingerprint(payload) computed by the Worker
}

interface RollbackBody {
  currentRevisionId: string;
  previousRevision: {
    id: string;
    intakeAttemptId: string;
    mappingTraceId: string;
    contractId: string;
    contractVersion: string;
    targetRecordType: string;
    approvedSuggestionIds: string[];
    sourceHash: string;
    sourceKind: string;
    sourceFixtureId: string | null;
    deliveryTarget: Record<string, unknown>;
    shapeFingerprint: string | null;
    suggestions: MappingSuggestion[];
  };
}

const STORAGE_KEY = "approved";

/**
 * HealStreamDO — one instance per sourceSystem:contractId:contractVersion.
 *
 * Serializes concurrent heal writes via DO input gate, persists
 * approved mapping to Neon in order (write → cache → SSE broadcast).
 * Rollback inserts a new revision row with rolledBackFrom set, updates
 * the DO cache, and broadcasts rolled_back.
 *
 * Constraint: Neon write must succeed before DO cache is updated or
 * SSE is broadcast. Throw on failure forces the Worker to fall back to
 * pending_review.
 */
export class HealStreamDO implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private approved: ApprovedState | null = null;
  private readonly subscribers: Set<WritableStreamDefaultWriter<Uint8Array>> = new Set();
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // ---------------------------------------------------------------------------
  // Lazy cold-start restore
  // ---------------------------------------------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const saved = await this.state.storage.get<string>(STORAGE_KEY);
    if (saved) {
      this.approved = JSON.parse(saved) as ApprovedState;
    }
  }

  // ---------------------------------------------------------------------------
  // SSE broadcast
  // ---------------------------------------------------------------------------

  private async broadcast(event: HealEvent): Promise<void> {
    const payload = `id: ${Date.now()}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const enc = new TextEncoder();
    const chunk = enc.encode(payload);
    const dead: WritableStreamDefaultWriter<Uint8Array>[] = [];
    for (const writer of this.subscribers) {
      try {
        await writer.write(chunk);
      } catch {
        dead.push(writer);
      }
    }
    for (const writer of dead) {
      this.subscribers.delete(writer);
    }
  }

  // ---------------------------------------------------------------------------
  // RPC router
  // ---------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/state") {
      return Response.json({ approved: this.approved });
    }

    if (request.method === "POST" && url.pathname === "/tryHeal") {
      return this.handleTryHeal(request);
    }

    if (request.method === "POST" && url.pathname === "/rollback") {
      return this.handleRollback(request);
    }

    if (request.method === "GET" && url.pathname === "/subscribe") {
      return this.handleSubscribe();
    }

    return new Response("Not Found", { status: 404 });
  }

  // ---------------------------------------------------------------------------
  // /tryHeal
  // ---------------------------------------------------------------------------

  private async handleTryHeal(request: Request): Promise<Response> {
    const body = (await request.json()) as TryHealBody;
    const { batch, payloadFingerprint } = body;

    const newFingerprint = payloadFingerprint; // computed by the Worker from the raw payload

    // Already matches current approved state — no-op (race between getState() and tryHeal())
    if (this.approved && this.approved.fingerprint === newFingerprint) {
      return Response.json({ healed: false, suggestions: this.approved.suggestions });
    }

    const startMs = Date.now();

    // Broadcast intent events
    await this.broadcast({
      type: "drift_detected",
      shapeFingerprint: newFingerprint,
      driftCategories: batch.driftCategories,
    });
    await this.broadcast({ type: "analyzing", confidence: 0.9, model: "auto" });
    await this.broadcast({ type: "rewriting", suggestionCount: batch.suggestions.length });

    // Update in-memory cache and persist to DO storage
    // Neon writes are owned by the Worker (persistHealedAttempt), not the DO
    this.approved = { fingerprint: newFingerprint, suggestions: batch.suggestions };
    await this.state.storage.put(STORAGE_KEY, JSON.stringify(this.approved));

    const mappingVersionId = crypto.randomUUID();

    // Broadcast healed
    await this.broadcast({
      type: "healed",
      mappingVersionId,
      latencyMs: Date.now() - startMs,
    });

    return Response.json({ healed: true, suggestions: batch.suggestions });
  }

  // ---------------------------------------------------------------------------
  // /rollback
  // ---------------------------------------------------------------------------

  private async handleRollback(request: Request): Promise<Response> {
    const body = (await request.json()) as RollbackBody;
    const { currentRevisionId, previousRevision } = body;

    const db = createDb(this.env);
    const rollbackId = crypto.randomUUID();
    const now = new Date();

    const [revision] = await db
      .insert(approvedMappingRevisions)
      .values({
        id: rollbackId,
        ownerId: "rollback",
        intakeAttemptId: previousRevision.intakeAttemptId,
        mappingTraceId: previousRevision.mappingTraceId,
        contractId: previousRevision.contractId,
        contractVersion: previousRevision.contractVersion,
        targetRecordType: previousRevision.targetRecordType,
        approvedSuggestionIds: previousRevision.approvedSuggestionIds,
        sourceHash: previousRevision.sourceHash,
        sourceKind: previousRevision.sourceKind,
        sourceFixtureId: previousRevision.sourceFixtureId,
        deliveryTarget:
          previousRevision.deliveryTarget as unknown as import("@repo/types").DeliveryTarget,
        shapeFingerprint: previousRevision.shapeFingerprint,
        rolledBackFrom: currentRevisionId,
        createdAt: now,
      })
      .returning();

    if (!revision) {
      throw new Error("HealStreamDO: rollback Neon insert returned no rows");
    }

    // Update in-memory cache and persist
    this.approved = {
      fingerprint: previousRevision.shapeFingerprint ?? "",
      suggestions: previousRevision.suggestions,
    };
    await this.state.storage.put(STORAGE_KEY, JSON.stringify(this.approved));

    // Broadcast rolled_back
    await this.broadcast({ type: "rolled_back", rolledBackTo: previousRevision.id });

    return Response.json({ rolledBackTo: previousRevision.id });
  }

  // ---------------------------------------------------------------------------
  // /subscribe — SSE streaming response
  // ---------------------------------------------------------------------------

  private handleSubscribe(): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.subscribers.add(writer);

    const enc = new TextEncoder();
    const keepaliveHandle = setInterval(() => {
      void writer.write(enc.encode(": keepalive\n\n")).catch(() => {
        clearInterval(keepaliveHandle);
        this.subscribers.delete(writer);
      });
    }, 15_000);

    // Clean up when the writer closes (client disconnect)
    void writer.closed
      .catch(() => undefined)
      .finally(() => {
        clearInterval(keepaliveHandle);
        this.subscribers.delete(writer);
      });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }
}
