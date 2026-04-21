import * as cf from "@pulumi/cloudflare";
import { cloudflareAccountId, workerName } from "./config";

export const r2Bucket = new cf.R2Bucket("assets", {
  accountId: cloudflareAccountId,
  name: `${workerName}-assets`,
});

export const kvNamespace = new cf.WorkersKvNamespace("kv", {
  accountId: cloudflareAccountId,
  title: `${workerName}-kv`,
});
