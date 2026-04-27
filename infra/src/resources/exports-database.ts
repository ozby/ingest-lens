import * as cf from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import { cloudflareAccountId, neonConnectionString, neonDatabaseName, workerName } from "./config";

const neonHost = neonConnectionString.apply((s) => new URL(s).hostname);
const dbPassword = neonConnectionString.apply((s) => new URL(s).password);
const dbUser = neonConnectionString.apply((s) => new URL(s).username);

export const hyperdrive = new cf.HyperdriveConfig("hyperdrive", {
  accountId: cloudflareAccountId,
  name: pulumi.interpolate`${workerName}-db`,
  origin: {
    database: neonDatabaseName,
    host: neonHost,
    port: 5432,
    scheme: "postgresql",
    user: dbUser,
    password: dbPassword,
  },
});

export const hyperdriveId = hyperdrive.id;
