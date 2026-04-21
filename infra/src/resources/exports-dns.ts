import * as cf from "@pulumi/cloudflare";
import { cloudflareZoneId, domain } from "./config";

export const wwwRecord = new cf.Record("www-cname", {
  zoneId: cloudflareZoneId,
  name: "www",
  type: "CNAME",
  content: domain,
  proxied: true,
  ttl: 1,
});

export const apiRecord = new cf.Record("api-cname", {
  zoneId: cloudflareZoneId,
  name: "api",
  type: "CNAME",
  content: "workers.dev",
  proxied: true,
  ttl: 1,
});
