/**
 * Pulumi program entry — provisions long-lived underlying resources only.
 *
 * Worker-scoped concerns (script, routes, custom domains, DNS records for
 * the Worker) are owned by wrangler.toml per the CF official pattern:
 *   - routes live in `[env.X]` with `custom_domain = true`, which makes
 *     wrangler atomically create the route + DNS + cert
 *   - bindings (Hyperdrive/KV/R2) reference IDs from this program's outputs
 *
 * See docs/deploy-architecture.md (or the refinement commit) for rationale.
 */
import "./exports-database";
import "./exports-storage";
import "./exports-queues";
import { hyperdriveId as _hyperdriveId } from "./exports-database";
import { kvNamespace, r2Bucket } from "./exports-storage";
import { deliveryQueue, deliveryDlq } from "./exports-queues";

// Flat stack outputs — each becomes a top-level key in
// `pulumi stack output --json`, consumed by
// `infra/src/deploy/sync-wrangler-ids.ts`.
export const hyperdriveId = _hyperdriveId;
export const kvNamespaceId = kvNamespace.id;
export const r2BucketName = r2Bucket.name;
// Queue names are outputs for observability; wrangler.toml references them
// by the same names, so no ID-sync step is needed.
export const deliveryQueueName = deliveryQueue.queueName;
export const deliveryDlqName = deliveryDlq.queueName;
