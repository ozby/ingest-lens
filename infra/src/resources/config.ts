import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const stack = pulumi.getStack();

export const stackName = stack;
export const isProd = stack === "prd";
export const isPreview = stack.startsWith("preview");
export const prNumber = isPreview ? stack.replace("preview-pr-", "") : null;

export const cloudflareAccountId = config.requireSecret("cloudflareAccountId");
export const cloudflareZoneId = config.requireSecret("cloudflareZoneId");
export const domain = config.require("domain"); // e.g. "example.com"
export const workerName = `ingest-lens-${stack}`;

// Neon config — the connection string is set before pulumi up by deploy.ts
// (which creates a Neon branch for non-prd stacks).
export const neonConnectionString = config.requireSecret("neonConnectionString");
export const neonDatabaseName = config.require("neonDatabaseName");
