import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

type DeployLane = "prd" | "preview_main" | `preview_pr_${number}` | (string & {});

type DeployRequest = {
  lane: DeployLane;
  dryRun: boolean;
};

type DeployStep = {
  kind: "command";
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string;
};

type DeployPlan = {
  schemaVersion: 1;
  lane: DeployLane;
  provider: string;
  requiredCredentials: string[];
  steps: DeployStep[];
};

type DeployAdapter = {
  createPlan(request: DeployRequest): DeployPlan;
};

const deployDir = dirname(fileURLToPath(import.meta.url));
const infraRoot = resolve(deployDir, "..", "..");
const repoRoot = resolve(infraRoot, "..");

function stackForLane(lane: DeployLane): string {
  if (lane === "prd") return "prd";
  if (lane === "preview_main") return "preview-main";
  if (lane.startsWith("preview_pr_")) return lane.replace("preview_pr_", "preview-pr-");
  return lane;
}

export const webpressoDeployAdapter: DeployAdapter = {
  createPlan(request): DeployPlan {
    const stack = stackForLane(request.lane);
    if (request.dryRun) {
      return {
        schemaVersion: 1,
        lane: request.lane,
        provider: "pulumi-cloudflare-neon",
        requiredCredentials: [],
        steps: [
          {
            kind: "command",
            id: "deploy-plan-dry-run",
            label: `Plan ingest-lens ${stack} deploy without secrets`,
            command: "bun",
            args: [join(deployDir, "plan-dry-run.ts"), request.lane],
            cwd: repoRoot,
          },
        ],
      };
    }

    return {
      schemaVersion: 1,
      lane: request.lane,
      provider: "pulumi-cloudflare-neon",
      requiredCredentials: [
        "PULUMI_ACCESS_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ZONE_ID",
        "NEON_API_KEY",
        "NEON_PROJECT_ID",
      ],
      steps: [
        {
          kind: "command",
          id: "ingest-lens-deploy",
          label: `Run ingest-lens ${stack} deploy script`,
          command: "bun",
          args: [
            join(deployDir, request.lane === "prd" ? "deploy-production.ts" : "deploy-preview.ts"),
            ...(request.lane === "prd" ? [] : ["--lane", stack]),
          ],
          cwd: repoRoot,
        },
      ],
    };
  },
};

export default webpressoDeployAdapter;
