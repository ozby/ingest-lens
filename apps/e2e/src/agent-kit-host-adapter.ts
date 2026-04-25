import type { E2eExecutionRequest, E2eHostAdapter } from "@webpresso/agent-kit/e2e";
import { createCommandE2eHostAdapter } from "@webpresso/agent-kit/e2e";
import {
  listE2ESuites,
  normalizeE2EPath,
  resolveE2ESuiteForFile,
  resolveE2ESuiteId,
} from "./e2e-suite-manifest.ts";

function buildHostExecutionArgs(request: E2eExecutionRequest): string[] {
  const args = ["--dir", "apps/e2e", "run", "e2e:run"];
  const forwarded: string[] = [];

  if (request.suite) forwarded.push("--suite", request.suite);
  for (const file of request.file ?? []) forwarded.push("--file", file);
  if (request.headed) forwarded.push("--headed");
  if (request.debug) forwarded.push("--debug");
  if (request.reuseReset) forwarded.push("--reuse-reset");
  if (request.noSupervisor) forwarded.push("--no-supervisor");
  if (request.workers !== undefined) forwarded.push("--workers", String(request.workers));
  if (request.testList) forwarded.push("--test-list", request.testList);
  if ((request.passthrough?.length ?? 0) > 0) forwarded.push(...(request.passthrough ?? []));

  return forwarded.length > 0 ? [...args, "--", ...forwarded] : args;
}

export const agentKitE2eHostAdapter: E2eHostAdapter = createCommandE2eHostAdapter({
  listSuites: listE2ESuites,
  resolveSuiteId: resolveE2ESuiteId,
  normalizeFilePath: normalizeE2EPath,
  resolveSuiteForFile: resolveE2ESuiteForFile,
  defaultSuiteId: "foundation",
  buildCommandGroup(request) {
    return {
      batchKey: "node-pubsub-e2e-host",
      run: {
        suiteId: request.suite ?? "foundation",
        batchKey: "node-pubsub-e2e-host",
        logName: "node-pubsub-e2e-host",
        command: "pnpm",
        args: buildHostExecutionArgs(request),
      },
    };
  },
});

export const nodePubsubE2eHostAdapter = agentKitE2eHostAdapter;
