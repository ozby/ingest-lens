import * as cf from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import { cloudflareAccountId, workerName } from "./config";

const config = new pulumi.Config();
const neonConnectionString = config.requireSecret("neonConnectionString");

export const hyperdrive = new cf.HyperdriveConfig("hyperdrive", {
  accountId: cloudflareAccountId,
  name: `${workerName}-db`,
  origin: {
    database: "pubsub",
    host: neonConnectionString.apply((s) => new URL(s).hostname),
    port: 5432,
    scheme: "postgresql",
    user: neonConnectionString.apply((s) => new URL(s).username),
    password: neonConnectionString.apply((s) => new URL(s).password),
  },
});

export const hyperdriveId = hyperdrive.id;
