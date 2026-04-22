import * as cf from "@pulumi/cloudflare";
import { cloudflareAccountId, cloudflareZoneId, domain, workerName } from "./config";

// Worker script route — wrangler handles the actual code deploy;
// Pulumi registers the route so traffic reaches the right Worker.
export const workerRoute = new cf.WorkersRoute("worker-route", {
  zoneId: cloudflareZoneId,
  pattern: `api.${domain}/*`,
  script: workerName,
});

export const customDomain = new cf.WorkersCustomDomain("worker-domain", {
  accountId: cloudflareAccountId,
  hostname: `api.${domain}`,
  service: workerName,
  zoneId: cloudflareZoneId,
});
