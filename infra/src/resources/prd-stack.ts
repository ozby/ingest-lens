/**
 * prd stack resource declarations — Cloudflare Hyperdrive, KV, R2.
 *
 * These resources are provisioned by the generic exports-database.ts and
 * exports-storage.ts modules, which derive naming from `pulumi.getStack()`.
 * When the active stack is "prd", Pulumi creates:
 *
 *   Hyperdrive:    node-pubsub-prd-db
 *   KV namespace:  node-pubsub-prd-kv
 *   R2 bucket:     node-pubsub-prd-assets
 *
 * After provisioning, the outputs (hyperdriveId, kvNamespaceId, r2BucketName)
 * are synced into apps/workers/wrangler.toml [env.prd] by
 * infra/src/deploy/sync-wrangler-ids.ts, replacing the placeholder IDs.
 *
 * IMPORTANT: Run the following manually with CF credentials to provision:
 *
 *   doppler run --project ozby-shell --config production -- \
 *     pulumi up --yes --stack prd
 *
 * Prerequisites before first deploy:
 *   1. Provision a Neon prd database and obtain the connection string.
 *   2. Set Pulumi secrets for the prd stack:
 *        pulumi config set --secret cloudflareAccountId <id> --stack prd
 *        pulumi config set --secret cloudflareZoneId <id> --stack prd
 *        pulumi config set --secret neonConnectionString <url> --stack prd
 *   3. Ensure Doppler project "ozby-shell" has a "production" config with
 *      CLOUDFLARE_API_TOKEN, PULUMI_ACCESS_TOKEN, and the Neon connection string.
 *   4. Run `bun ./src/deploy/deploy.ts prd` from infra/ to orchestrate:
 *        pulumi up → sync-wrangler-ids → wrangler deploy --env prd
 */

// Re-export the prd stack outputs so they are available via
// `pulumi stack output --json --stack prd` after provisioning.
// The actual resource creation happens in exports-database.ts and
// exports-storage.ts; this file exists to make the prd intent explicit.
export { hyperdriveId, kvNamespaceId, r2BucketName } from "./main";
