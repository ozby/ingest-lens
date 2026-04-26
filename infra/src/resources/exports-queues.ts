import * as cf from "@pulumi/cloudflare";
import { cloudflareAccountId, stackName } from "./config";

// Delivery queues — one pair per stack (dev / prd).
// Names must match wrangler.toml `queue` and `dead_letter_queue` values exactly.
// The DLQ is managed here (not left to wrangler) because it holds failed messages
// that need to survive across deployments — same lifecycle category as KV and R2.

const queueSettings: cf.types.input.QueueSettings = {
  messageRetentionPeriod: 86400, // 24 hours — CF default; explicit so Pulumi doesn't drift
};

export const deliveryQueue = new cf.Queue("delivery-queue", {
  accountId: cloudflareAccountId,
  queueName: `delivery-queue-${stackName}`,
  settings: queueSettings,
});

export const deliveryDlq = new cf.Queue("delivery-dlq", {
  accountId: cloudflareAccountId,
  queueName: `delivery-dlq-${stackName}`,
  settings: queueSettings,
});
