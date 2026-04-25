/**
 * KillSwitchAutoReset — daily cron (0 0 * * *) that auto-resets the kill switch.
 *
 * Reads KillSwitchKV; if disabled and autoResetAt <= now, resets to enabled.
 * Caps at 3 auto-resets per 7-day rolling window (tracked in KV).
 * If cap is reached: emits a "manual override required" webhook instead of resetting.
 * No reset if switch was manually disabled without autoResetAt (sticky operator action).
 * F-11.
 */

import { KillSwitchKV } from "@repo/lab-core";

export interface AutoResetKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface AutoResetWebhook {
  send(url: string, payload: unknown): Promise<void>;
}

export interface AutoResetDeps {
  killSwitch: KillSwitchKV;
  kv: AutoResetKV;
  webhookUrl?: string;
  webhook?: AutoResetWebhook;
  /** Injectable ISO8601 now for deterministic tests */
  now?: string;
}

export type AutoResetOutcome =
  | { action: "reset"; previous: string }
  | { action: "no-op"; reason: string }
  | { action: "cap-reached"; resets: string[] };

const RESET_LOG_KEY = "lab:kill-switch:auto-reset-log";
const MAX_RESETS_PER_WINDOW = 3;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days

/**
 * Read the rolling reset log (ISO8601 timestamps of past auto-resets).
 * Filters out entries older than 7 days relative to `now`.
 */
async function readResetLog(kv: AutoResetKV, now: string): Promise<string[]> {
  const raw = await kv.get(RESET_LOG_KEY);
  if (!raw) return [];
  const entries = JSON.parse(raw) as string[];
  const nowMs = new Date(now).getTime();
  return entries.filter((ts) => nowMs - new Date(ts).getTime() < WINDOW_MS);
}

async function writeResetLog(kv: AutoResetKV, log: string[]): Promise<void> {
  await kv.put(RESET_LOG_KEY, JSON.stringify(log));
}

/**
 * Run the auto-reset logic for one scheduled tick.
 * Returns the outcome for observability.
 */
export async function runKillSwitchAutoReset(deps: AutoResetDeps): Promise<AutoResetOutcome> {
  const now = deps.now ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();

  const state = await deps.killSwitch.read();

  // No-op: kill switch is already enabled
  if (state.enabled) {
    return { action: "no-op", reason: "kill-switch-already-enabled" };
  }

  // No-op: manually disabled without autoResetAt (sticky operator action)
  if (!state.autoResetAt) {
    return { action: "no-op", reason: "no-auto-reset-at-set" };
  }

  // No-op: autoResetAt is in the future
  const resetAtMs = new Date(state.autoResetAt).getTime();
  if (resetAtMs > nowMs) {
    return { action: "no-op", reason: "auto-reset-at-in-future" };
  }

  // Check rolling window cap
  const recentResets = await readResetLog(deps.kv, now);

  if (recentResets.length >= MAX_RESETS_PER_WINDOW) {
    // Cap reached — emit webhook instead of resetting
    if (deps.webhookUrl && deps.webhook) {
      await deps.webhook.send(deps.webhookUrl, {
        alert: "kill_switch_auto_reset_cap_reached",
        message: "Manual override required — 3 auto-resets in 7 days",
        reason: state.reason,
        lastResets: recentResets.slice(-3),
        timestamp: now,
      });
    }
    return { action: "cap-reached", resets: recentResets };
  }

  // Perform the reset
  const prevReason = state.reason;
  await deps.killSwitch.flip({
    enabled: true,
    reason: "auto-reset",
    now,
  });

  // Update the rolling reset log
  const updatedLog = [...recentResets, now];
  await writeResetLog(deps.kv, updatedLog);

  return { action: "reset", previous: prevReason };
}
