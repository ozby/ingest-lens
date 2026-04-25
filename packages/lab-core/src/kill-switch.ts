/**
 * KillSwitchKV — runtime kill switch over CF Workers KV.
 *
 * KV schema: one key "lab:kill-switch" with value:
 *   { enabled: bool, reason: string, flippedAt: ISO8601, autoResetAt?: ISO8601 }
 *
 * Per-request cache ≤ 5s (F-01: Doppler injects at deploy time; runtime
 * toggling needs KV, not Doppler).
 */

export interface KillSwitchState {
  enabled: boolean;
  reason: string;
  flippedAt: string; // ISO8601
  autoResetAt?: string; // ISO8601; used by Lane E daily reset
}

const KV_KEY = "lab:kill-switch";
const CACHE_TTL_MS = 5_000; // 5 seconds

const DEFAULT_STATE: KillSwitchState = {
  enabled: true,
  reason: "default",
  flippedAt: new Date(0).toISOString(),
};

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export class KillSwitchKV {
  private readonly kv: KVNamespace;
  private cached: KillSwitchState | null = null;
  private cachedAt = 0;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Read the current kill-switch state.
   * Uses a 5s local cache to avoid paying a KV read on every request.
   */
  async read(): Promise<KillSwitchState> {
    const now = Date.now();
    if (this.cached !== null && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }
    const raw = await this.kv.get(KV_KEY);
    if (raw === null) {
      this.cached = DEFAULT_STATE;
      this.cachedAt = now;
      return DEFAULT_STATE;
    }
    const state = JSON.parse(raw) as KillSwitchState;
    this.cached = state;
    this.cachedAt = now;
    return state;
  }

  /**
   * Write a new kill-switch state.
   * Invalidates the local cache immediately.
   */
  async write(state: KillSwitchState): Promise<void> {
    await this.kv.put(KV_KEY, JSON.stringify(state));
    this.cached = state;
    this.cachedAt = Date.now();
  }

  /**
   * Flip the kill-switch.
   * Idempotent: if the current state has the same enabled+reason, no write occurs.
   * Supports autoResetAt for Lane E's daily reset feature (F-11).
   */
  async flip(opts: {
    enabled: boolean;
    reason: string;
    autoResetAt?: string;
    now?: string; // injectable for testing
  }): Promise<KillSwitchState> {
    const current = await this.read();
    // Idempotent: same enabled + same reason = no-op
    if (current.enabled === opts.enabled && current.reason === opts.reason) {
      return current;
    }
    const next: KillSwitchState = {
      enabled: opts.enabled,
      reason: opts.reason,
      flippedAt: opts.now ?? new Date().toISOString(),
      ...(opts.autoResetAt !== undefined ? { autoResetAt: opts.autoResetAt } : {}),
    };
    await this.write(next);
    return next;
  }

  /** Invalidate the local cache (useful in tests). */
  invalidateCache(): void {
    this.cached = null;
    this.cachedAt = 0;
  }
}
