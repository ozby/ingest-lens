# Consistency Lab — Incident Runbook

> Scannable in under 60 seconds per script. Exact commands where applicable.

---

## Script 1 — "Lab being abused / high cost"

**Signs:** CostEstimatorCron webhook fires at $50 tier, or billing dashboard shows unexpected spend.

**Steps:**

1. Confirm spend via Cloudflare dashboard → Analytics → Billing (do NOT use CF GraphQL API — not authoritative).
2. Kill the lab immediately via KV (not Doppler — runtime only):

   ```bash
   # Using wrangler KV CLI
   wrangler kv key put --binding KILL_SWITCH_KV "lab:kill-switch" \
     '{"enabled":false,"reason":"manual-cost-kill","flippedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
   ```

3. Verify lab is offline:

   ```bash
   curl -I https://ingestlens-lab.workers.dev/lab
   # Expect: 404
   ```

4. Investigate by querying `lab.heartbeat_audit` for recent admin bypass entries:

   ```sql
   SELECT * FROM lab.heartbeat_audit ORDER BY created_at DESC LIMIT 20;
   ```

5. Post-incident: review rate-limit config and `KillSwitchAutoReset` rolling window counter.
6. Re-enable manually once safe:

   ```bash
   wrangler kv key put --binding KILL_SWITCH_KV "lab:kill-switch" \
     '{"enabled":true,"reason":"manual-re-enable","flippedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
   ```

**Env vars involved:** `KILL_SWITCH_KV` binding, `HEARTBEAT_WEBHOOK_URL` (for alerts).

---

## Script 2 — "Heartbeat failing"

**Signs:** HeartbeatCron webhook fires with `heartbeat_consecutive_failures` alert (3 in a row).

**Steps:**

1. Query last 5 heartbeat rows:

   ```sql
   SELECT id, active_session_count, gauge_capacity, checked_at
   FROM lab.heartbeat
   ORDER BY checked_at DESC
   LIMIT 5;
   ```

2. Check Cloudflare Queues status page: <https://cloudflarestatus.com>
3. Check Hyperdrive pool metrics in Cloudflare dashboard → Workers & Pages → Hyperdrive.
4. Re-run heartbeat manually by invoking the cron via Wrangler:

   ```bash
   wrangler trigger scheduled --trigger "*/15 * * * *"
   ```

5. If still failing after 15 min, check DO health:

   ```bash
   # Check SESSION_LOCK DO namespace for stuck locks
   wrangler durable-objects list --namespace SESSION_LOCK
   ```

6. Escalate if failure persists beyond 30 min — check CF incident history.

**Env vars involved:** `HYPERDRIVE`, `SESSION_LOCK`, `CONCURRENCY_GAUGE`, `HEARTBEAT_WEBHOOK_URL`.

---

## Script 3 — "User reports wrong numbers in a run"

**Signs:** User provides a `sessionId` and claims delivered/inversion counts are wrong.

**Steps:**

1. Pull the run from Postgres:

   ```sql
   SELECT r.id, r.session_id, r.path_id, r.status,
          r.delivered_count, r.inversion_count, r.duration_ms,
          r.started_at, r.completed_at
   FROM lab.runs r
   WHERE r.session_id = '<sessionId>'
   ORDER BY r.started_at;
   ```

2. Inspect the events archive for that session:

   ```sql
   SELECT seq, event_type, payload, created_at
   FROM lab.events_archive
   WHERE session_id = '<sessionId>'
   ORDER BY seq;
   ```

3. Re-run the same scenario synthetically:

   ```bash
   curl -X POST https://ingestlens-lab.workers.dev/lab/s1a/run \
     -H "Content-Type: application/json" \
     -d '{"workloadSize": 100}'
   ```

4. Diff results:
   - If numbers **match**: user likely misread the UI — close with explanation.
   - If numbers **do not match**: genuine scenario bug → file a blueprint in `blueprints/planned/`.

**Env vars involved:** `HYPERDRIVE` (Postgres connection), `LAB_SESSION_SECRET` (session auth).
