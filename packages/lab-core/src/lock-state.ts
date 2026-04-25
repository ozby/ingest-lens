/**
 * DO storage schema for SessionLock.
 */

export interface LockHolder {
  sessionId: string;
  acquiredAt: number; // ms epoch
  ttlMs: number;
}

export interface WaiterEntry {
  sessionId: string;
  enqueuedAt: number; // ms epoch
  ttlMs: number;
}

export interface LockStorage {
  holder: LockHolder | null;
  waiters: WaiterEntry[];
}

export const DEFAULT_TTL_MS = 300_000; // 5 minutes (F-20: 120s was too short)
