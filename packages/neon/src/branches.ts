import type { NeonConfig } from "./config";
import { generateBranchName } from "./names";

/** @deprecated use Branch from @webpresso/db-branching */
export interface NeonBranch {
  id: string;
  name: string;
  parentId: string;
  connectionUri?: string;
  createdAt?: string;
  expiresAt?: string;
}

interface NeonFetchOptions {
  fetch?: typeof fetch;
}

interface CreateBranchOptions extends NeonFetchOptions {
  name?: string;
  ttlHours?: number;
}

interface CleanupBranchOptions extends NeonFetchOptions {
  maxAgeHours?: number;
  now?: Date;
}

function getFetch(override?: typeof fetch): typeof fetch {
  return override ?? fetch;
}

function getHeaders(config: NeonConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

function projectBranchResponse(branch: {
  id: string;
  name: string;
  parent_id?: string;
  created_at?: string;
  expires_at?: string;
}): NeonBranch {
  return {
    id: branch.id,
    name: branch.name,
    parentId: branch.parent_id ?? "",
    createdAt: branch.created_at,
    expiresAt: branch.expires_at,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Neon API request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

/** @deprecated use NeonBranchProvider.createBranch() */
export async function createEphemeralBranch(
  config: NeonConfig,
  options: CreateBranchOptions = {},
): Promise<NeonBranch> {
  const requestBody = {
    branch: {
      name: options.name ?? generateBranchName(),
      parent_id: config.parentBranchId,
      expires_at:
        options.ttlHours === undefined
          ? undefined
          : new Date(Date.now() + options.ttlHours * 60 * 60 * 1000).toISOString(),
    },
    endpoints: [{ type: "read_write" }],
  };

  const response = await getFetch(options.fetch)(
    `${config.apiBaseUrl}/projects/${config.projectId}/branches`,
    {
      method: "POST",
      headers: getHeaders(config),
      body: JSON.stringify(requestBody),
    },
  );

  const payload = await readJson<{
    branch: {
      id: string;
      name: string;
      parent_id?: string;
      created_at?: string;
      expires_at?: string;
    };
    connection_uris?: Array<{ connection_uri?: string }>;
  }>(response);

  return {
    ...projectBranchResponse(payload.branch),
    connectionUri: payload.connection_uris?.[0]?.connection_uri,
  };
}

export async function listE2EBranches(
  config: NeonConfig,
  options: NeonFetchOptions = {},
): Promise<NeonBranch[]> {
  const response = await getFetch(options.fetch)(
    `${config.apiBaseUrl}/projects/${config.projectId}/branches`,
    {
      method: "GET",
      headers: getHeaders(config),
    },
  );

  const payload = await readJson<{
    branches: Array<{
      id: string;
      name: string;
      parent_id?: string;
      created_at?: string;
      expires_at?: string;
    }>;
  }>(response);

  return payload.branches
    .filter((branch) => branch.name.startsWith("e2e/"))
    .map(projectBranchResponse);
}

/** @deprecated use NeonBranchProvider.deleteBranch() */
export async function deleteEphemeralBranch(
  config: NeonConfig,
  branchId: string,
  options: NeonFetchOptions = {},
): Promise<void> {
  const response = await getFetch(options.fetch)(
    `${config.apiBaseUrl}/projects/${config.projectId}/branches/${branchId}`,
    {
      method: "DELETE",
      headers: getHeaders(config),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete Neon branch ${branchId}: ${response.status}`);
  }
}

export async function cleanupStaleE2EBranches(
  config: NeonConfig,
  options: CleanupBranchOptions = {},
): Promise<{ deletedBranchIds: string[] }> {
  const maxAgeHours = options.maxAgeHours ?? 24;
  const cutoff = new Date((options.now ?? new Date()).getTime() - maxAgeHours * 60 * 60 * 1000);
  const branches = await listE2EBranches(config, options);
  const staleBranches = branches.filter((branch) => {
    if (!branch.createdAt) {
      return false;
    }

    return new Date(branch.createdAt).getTime() <= cutoff.getTime();
  });

  for (const branch of staleBranches) {
    await deleteEphemeralBranch(config, branch.id, options);
  }

  return { deletedBranchIds: staleBranches.map((branch) => branch.id) };
}
