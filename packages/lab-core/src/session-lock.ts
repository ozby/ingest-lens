/**
 * SessionLock — Durable Object providing per-scenario single-writer slot.
 *
 * Pattern (CF F6T):
 * - Constructor init guarded by blockConcurrencyWhile
 * - fetch paths check getAlarm() before setAlarm
 * - Alarm handler is idempotent (CF retries up to 6× with backoff)
 *
 * TTL default: 300_000 ms (F-20; 120s was too short for long-tail runs).
 */
import type { LockHolder, WaiterEntry, LockStorage } from "./lock-state";
import { DEFAULT_TTL_MS } from "./lock-state";

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

const HOLDER_KEY = "lock:holder";
const WAITERS_KEY = "lock:waiters";

export interface AcquireResult {
  granted: boolean;
  sessionId: string;
  position?: number; // queue position (1-based) if not granted
  etaMs?: number; // estimated wait ms if not granted
}

export interface ReleaseResult {
  released: boolean;
  nextHolder?: string; // sessionId promoted from queue
}

export interface WaitingRoomResult {
  position: number; // 1-based; 0 means not in queue
  etaMs: number;
  queueLength: number;
}

export class SessionLock {
  private state: DurableObjectState;
  private initialized = false;
  private holder: LockHolder | null = null;
  private waiters: WaiterEntry[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
    // F6T: guard init; concurrent fetches wait here
    void this.state.blockConcurrencyWhile(async () => {
      this.holder = (await this.state.storage.get<LockHolder>(HOLDER_KEY)) ?? null;
      this.waiters = (await this.state.storage.get<WaiterEntry[]>(WAITERS_KEY)) ?? [];
      this.initialized = true;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initialized) {
      await this.state.blockConcurrencyWhile(async () => {});
    }
    const url = new URL(request.url);
    const method = request.method;

    if (method === "POST" && url.pathname === "/acquire") {
      const body = (await request.json()) as { sessionId: string; ttlMs?: number };
      const result = await this.acquire(body.sessionId, body.ttlMs ?? DEFAULT_TTL_MS);
      return Response.json(result);
    }

    if (method === "POST" && url.pathname === "/release") {
      const body = (await request.json()) as { sessionId: string };
      const result = await this.release(body.sessionId);
      return Response.json(result);
    }

    if (method === "GET" && url.pathname === "/waiting-room") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const result = this.waitingRoom(sessionId);
      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    // Idempotent: check if holder actually expired before releasing
    const now = Date.now();
    if (this.holder !== null && this.holder.acquiredAt + this.holder.ttlMs <= now) {
      await this.forceRelease(this.holder.sessionId);
    }
    // Reschedule alarm if there's still a holder after force-release
    if (this.holder !== null) {
      const expiresAt = this.holder.acquiredAt + this.holder.ttlMs;
      const existingAlarm = await this.state.storage.getAlarm();
      if (existingAlarm === null || existingAlarm > expiresAt) {
        await this.state.storage.setAlarm(expiresAt);
      }
    }
  }

  async acquire(sessionId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<AcquireResult> {
    // If this sessionId already holds the lock, re-grant idempotently
    if (this.holder?.sessionId === sessionId) {
      return { granted: true, sessionId };
    }

    if (this.holder === null) {
      // Slot is free — grant it
      this.holder = { sessionId, acquiredAt: Date.now(), ttlMs };
      await this.state.storage.put(HOLDER_KEY, this.holder);
      // F6T: only set alarm if not already armed
      const expiresAt = this.holder.acquiredAt + ttlMs;
      const existing = await this.state.storage.getAlarm();
      if (existing === null) {
        await this.state.storage.setAlarm(expiresAt);
      }
      return { granted: true, sessionId };
    }

    // Slot taken — enqueue this waiter (avoid duplicates)
    const alreadyQueued = this.waiters.findIndex((w) => w.sessionId === sessionId);
    if (alreadyQueued === -1) {
      this.waiters.push({ sessionId, enqueuedAt: Date.now(), ttlMs });
      await this.state.storage.put(WAITERS_KEY, this.waiters);
    }
    const position = this.waiters.findIndex((w) => w.sessionId === sessionId) + 1;
    const etaMs = this.estimateEta(position);
    return { granted: false, sessionId, position, etaMs };
  }

  async release(sessionId: string): Promise<ReleaseResult> {
    if (this.holder?.sessionId !== sessionId) {
      // Not the holder — check if in waiters and remove
      const idx = this.waiters.findIndex((w) => w.sessionId === sessionId);
      if (idx !== -1) {
        this.waiters.splice(idx, 1);
        await this.state.storage.put(WAITERS_KEY, this.waiters);
      }
      return { released: false };
    }
    return this.forceRelease(sessionId);
  }

  waitingRoom(sessionId: string): WaitingRoomResult {
    const idx = this.waiters.findIndex((w) => w.sessionId === sessionId);
    const position = idx + 1; // 0 if not found, but we return idx+1 so -1+1=0
    const queueLength = this.waiters.length;
    const etaMs = idx >= 0 ? this.estimateEta(idx + 1) : 0;
    return { position, etaMs, queueLength };
  }

  private async forceRelease(sessionId: string): Promise<ReleaseResult> {
    if (this.holder?.sessionId !== sessionId) {
      return { released: false };
    }
    this.holder = null;
    await this.state.storage.delete(HOLDER_KEY);

    let nextHolder: string | undefined;
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      this.holder = { sessionId: next.sessionId, acquiredAt: Date.now(), ttlMs: next.ttlMs };
      nextHolder = next.sessionId;
      await this.state.storage.put(HOLDER_KEY, this.holder);
      await this.state.storage.put(WAITERS_KEY, this.waiters);
      // Schedule alarm for new holder
      const expiresAt = this.holder.acquiredAt + this.holder.ttlMs;
      const existing = await this.state.storage.getAlarm();
      if (existing === null || existing > expiresAt) {
        await this.state.storage.setAlarm(expiresAt);
      }
    } else {
      await this.state.storage.put(WAITERS_KEY, this.waiters);
      await this.state.storage.deleteAlarm();
    }

    return { released: true, nextHolder };
  }

  private estimateEta(position: number): number {
    const holderRemainingMs =
      this.holder !== null
        ? Math.max(0, this.holder.acquiredAt + this.holder.ttlMs - Date.now())
        : 0;
    // Rough estimate: each queued session before this one takes DEFAULT_TTL_MS/2 on average
    return holderRemainingMs + (position - 1) * (DEFAULT_TTL_MS / 2);
  }

  // Expose storage snapshot for testing
  getStorage(): LockStorage {
    return { holder: this.holder, waiters: [...this.waiters] };
  }
}
