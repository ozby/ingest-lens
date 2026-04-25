/**
 * Typed Env for apps/lab.
 *
 * DO bindings:
 *   SESSION_LOCK        — SessionLock DO (@repo/lab-core)
 *   CONCURRENCY_GAUGE   — LabConcurrencyGauge DO (@repo/lab-core)
 *   S1A_RUNNER          — S1aRunnerDO (@repo/lab-s1a-correctness)
 *   S1B_RUNNER          — S1bRunnerDO (@repo/lab-s1b-latency)
 *
 * Queue bindings (F-3T):
 *   LAB_S1A_QUEUE       — dedicated queue for s1a-correctness path
 *   LAB_S1B_QUEUE       — dedicated queue for s1b-latency path
 *
 * KV (F-01 kill switch):
 *   KILL_SWITCH_KV
 *
 * Hyperdrive:
 *   HYPERDRIVE
 *
 * Workers Assets (F12T):
 *   LAB_ASSETS
 *
 * Secrets (Doppler-managed; F-08):
 *   LAB_SESSION_SECRET  — cookie signing key; NEVER use JWT_SECRET
 *   HEARTBEAT_WEBHOOK_URL — wired by Lane E
 */
export interface Env {
  // Durable Object namespaces
  SESSION_LOCK: DurableObjectNamespace;
  CONCURRENCY_GAUGE: DurableObjectNamespace;
  S1A_RUNNER: DurableObjectNamespace;
  S1B_RUNNER: DurableObjectNamespace;

  // Queue producers (F-3T)
  LAB_S1A_QUEUE: Queue;
  LAB_S1B_QUEUE: Queue;

  // KV namespace (F-01)
  KILL_SWITCH_KV: KVNamespace;

  // Hyperdrive
  HYPERDRIVE: Hyperdrive;

  // Workers Assets binding (F12T)
  LAB_ASSETS: Fetcher;

  // Secrets
  LAB_SESSION_SECRET: string; // dedicated; NOT JWT_SECRET (F-08)
  HEARTBEAT_WEBHOOK_URL?: string; // wired by Lane E

  // Vars
  NODE_ENV?: string;
}
