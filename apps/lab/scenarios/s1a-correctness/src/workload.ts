/**
 * buildWorkload — O(n) generator of deterministic Messages.
 *
 * Uses a seeded LCG so the same (sessionId, n) always produces
 * the same sequence. The payload is a 64-char hex string derived
 * from the LCG state for each message.
 */
import type { Message } from "./message";

// Simple seeded LCG (multiplier + increment chosen for full-period on 2^32)
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    state = state >>> 0;
    return state;
  };
}

function strToSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

function toHex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Build a 36-char UUID-like string from two LCG values */
function makeUuid(rng: () => number): string {
  const a = toHex8(rng());
  const b = toHex8(rng());
  const c = toHex8(rng());
  const d = toHex8(rng());
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-${c.slice(0, 4)}-${d}${c.slice(4, 8)}`;
}

/** Build a 64-char hex payload from four LCG values */
function makePayload(rng: () => number): string {
  return (
    toHex8(rng()) +
    toHex8(rng()) +
    toHex8(rng()) +
    toHex8(rng()) +
    toHex8(rng()) +
    toHex8(rng()) +
    toHex8(rng()) +
    toHex8(rng())
  );
}

/**
 * buildWorkload(sessionId, n) — returns n messages with distinct msg_ids,
 * seq 1..n, all scoped to sessionId. Deterministic for same inputs.
 */
export function* buildWorkload(sessionId: string, n: number): Generator<Message> {
  const rng = lcg(strToSeed(sessionId));
  for (let seq = 1; seq <= n; seq++) {
    const msg_id = makeUuid(rng);
    const payload = makePayload(rng);
    yield { msg_id, seq, session_id: sessionId, payload };
  }
}

/**
 * buildWorkloadArray — convenience wrapper that materialises the full array.
 * Use when you need random access; prefer the generator for streaming.
 */
export function buildWorkloadArray(sessionId: string, n: number): Message[] {
  return Array.from(buildWorkload(sessionId, n));
}
