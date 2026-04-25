/**
 * LabConcurrencyGauge — Durable Object tracking active sessions by sessionId.
 *
 * Design (F-02):
 * - Sessioned map keyed by sessionId, each entry has expiresAt
 * - Alarm reaper sweeps expired entries (cadence = TTL / 4)
 * - Release is idempotent
 * - Cap is tunable; default 100
 *
 * Acquire ONLY after SessionLock is granted (waiting-room visitors must not
 * consume gauge slots).
 */

interface SessionEntry {
  expiresAt: number; // ms epoch
}

export interface GaugeSnapshot {
  activeCount: number;
  oldestExpiryAt: number | null;
  capacity: number;
}

export interface GaugeAcquireResult {
  granted: boolean;
  activeCount: number;
  retryAfter?: number; // ms to wait if denied
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

const SESSIONS_KEY = "gauge:sessions";
const DEFAULT_CAPACITY = 100;
const DEFAULT_TTL_MS = 300_000;

export class LabConcurrencyGauge {
  private sessions: Map<string, SessionEntry> = new Map();
  private readonly capacity: number;
  private readonly ttlMs: number;
  private state: DurableObjectState;

  constructor(state: DurableObjectState, opts: { capacity?: number; ttlMs?: number } = {}) {
    this.state = state;
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    void this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, SessionEntry>>(SESSIONS_KEY);
      if (stored) {
        for (const [id, entry] of Object.entries(stored)) {
          this.sessions.set(id, entry);
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === "POST" && url.pathname === "/acquire") {
      const body = (await request.json()) as { sessionId: string };
      const result = await this.acquire(body.sessionId);
      return Response.json(result);
    }

    if (method === "POST" && url.pathname === "/release") {
      const body = (await request.json()) as { sessionId: string };
      await this.release(body.sessionId);
      return Response.json({ ok: true });
    }

    if (method === "GET" && url.pathname === "/snapshot") {
      return Response.json(this.snapshot());
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    // Idempotent reaper: sweep expired entries
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (entry.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
    await this.persist();
    // Reschedule alarm if there are still active sessions
    this.scheduleAlarmIfNeeded();
  }

  async acquire(sessionId: string): Promise<GaugeAcquireResult> {
    // Sweep expired first
    this.sweepExpired();
    // If already present, refresh TTL (re-acquire)
    if (this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { expiresAt: Date.now() + this.ttlMs });
      await this.persist();
      return { granted: true, activeCount: this.sessions.size };
    }
    // Check capacity
    if (this.sessions.size >= this.capacity) {
      return {
        granted: false,
        activeCount: this.sessions.size,
        retryAfter: this.ttlMs / 4,
      };
    }
    this.sessions.set(sessionId, { expiresAt: Date.now() + this.ttlMs });
    await this.persist();
    await this.scheduleAlarmIfNeeded();
    return { granted: true, activeCount: this.sessions.size };
  }

  async release(sessionId: string): Promise<void> {
    // Idempotent: calling twice has no effect
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      await this.persist();
    }
  }

  snapshot(): GaugeSnapshot {
    this.sweepExpired();
    let oldest: number | null = null;
    for (const entry of this.sessions.values()) {
      if (oldest === null || entry.expiresAt < oldest) {
        oldest = entry.expiresAt;
      }
    }
    return {
      activeCount: this.sessions.size,
      oldestExpiryAt: oldest,
      capacity: this.capacity,
    };
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (entry.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
  }

  private async persist(): Promise<void> {
    const obj: Record<string, SessionEntry> = {};
    for (const [id, entry] of this.sessions) {
      obj[id] = entry;
    }
    await this.state.storage.put(SESSIONS_KEY, obj);
  }

  private async scheduleAlarmIfNeeded(): Promise<void> {
    if (this.sessions.size === 0) return;
    const existing = await this.state.storage.getAlarm();
    if (existing === null) {
      // Alarm cadence = TTL / 4 (blueprint spec: sweep at least 4× per session lifetime)
      await this.state.storage.setAlarm(Date.now() + this.ttlMs / 4);
    }
  }
}
