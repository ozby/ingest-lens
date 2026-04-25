/**
 * Kill-switch middleware (F-01).
 *
 * Reads KILL_SWITCH_KV via KillSwitchKV (5s local cache).
 * Returns 404 if kill-switch is disabled (enabled: false).
 * Does NOT read env.LAB_ENABLED — that pattern was architecturally broken (F-01).
 */
import type { Context, Next } from "hono";
import { KillSwitchKV } from "@repo/lab-core";
import type { Env } from "../env";

// Module-level cache so the KillSwitchKV instance survives across requests
// within the same Worker isolate (CF Worker isolate lifetime).
const instanceCache = new WeakMap<KVNamespace, KillSwitchKV>();

function getKillSwitchKV(kv: KVNamespace): KillSwitchKV {
  const existing = instanceCache.get(kv);
  if (existing !== undefined) return existing;
  const instance = new KillSwitchKV(kv);
  instanceCache.set(kv, instance);
  return instance;
}

export async function killSwitchMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const ks = getKillSwitchKV(c.env.KILL_SWITCH_KV);
  const state = await ks.read();

  if (!state.enabled) {
    return c.text("Not Found", 404);
  }

  return next();
}
