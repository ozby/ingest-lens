export interface NeonConfig {
  apiKey: string;
  projectId: string;
  parentBranchId: string;
  apiBaseUrl: string;
}

export interface NeonConfigInput {
  NEON_API_KEY?: string;
  NEON_PROJECT_ID?: string;
  NEON_PARENT_BRANCH_ID?: string;
  NEON_API_BASE_URL?: string;
}

const DEFAULT_NEON_API_BASE_URL = "https://console.neon.tech/api/v2";

export function getNeonConfig(input: NeonConfigInput = process.env): NeonConfig {
  const apiKey = input.NEON_API_KEY;
  const projectId = input.NEON_PROJECT_ID;
  const parentBranchId = input.NEON_PARENT_BRANCH_ID;

  if (!apiKey || !projectId || !parentBranchId) {
    throw new Error(
      "Missing Neon configuration. Expected NEON_API_KEY, NEON_PROJECT_ID, and NEON_PARENT_BRANCH_ID.",
    );
  }

  return {
    apiKey,
    projectId,
    parentBranchId,
    apiBaseUrl: input.NEON_API_BASE_URL ?? DEFAULT_NEON_API_BASE_URL,
  };
}

export function isNeonAvailable(input: NeonConfigInput = process.env): boolean {
  return Boolean(input.NEON_API_KEY && input.NEON_PROJECT_ID && input.NEON_PARENT_BRANCH_ID);
}
