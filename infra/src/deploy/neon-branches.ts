type RuntimeEnv = NodeJS.ProcessEnv;

type NeonBranch = {
  id: string;
  name: string;
};

type NeonBranchListResponse = {
  branches?: NeonBranch[];
};

type NeonBranchCreateResponse = {
  branch?: NeonBranch;
};

type NeonEndpoint = {
  id: string;
  type?: string;
};

type NeonEndpointListResponse = {
  endpoints?: NeonEndpoint[];
};

type NeonEndpointCreateResponse = {
  endpoint?: NeonEndpoint;
};

export type NeonBranchResult = {
  id: string;
  reused: boolean;
  appDatabaseUrl: string;
};

type NeonConfig = {
  apiKey: string;
  projectId: string;
  parentBranchId?: string;
  databaseName: string;
  roleName: string;
};

export function getNeonConfig(env: RuntimeEnv): NeonConfig {
  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error("Neon branch provisioning requires NEON_API_KEY and NEON_PROJECT_ID");
  }
  return {
    apiKey,
    projectId,
    parentBranchId: env.NEON_PARENT_BRANCH_ID,
    databaseName: env.INGEST_LENS_NEON_DATABASE_NAME ?? env.NEON_DATABASE_NAME ?? "neondb",
    roleName: env.NEON_ROLE_NAME ?? "neondb_owner",
  };
}

function neonHeaders(config: NeonConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Neon API request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

async function findBranch(config: NeonConfig, branchName: string): Promise<NeonBranch | null> {
  const body = await requestJson<NeonBranchListResponse>(
    `https://console.neon.tech/api/v2/projects/${config.projectId}/branches`,
    { headers: neonHeaders(config) },
  );
  return body.branches?.find((branch) => branch.name === branchName) ?? null;
}

async function createBranch(config: NeonConfig, branchName: string): Promise<NeonBranch> {
  const branchBody = config.parentBranchId
    ? {
        branch: { name: branchName, parent_id: config.parentBranchId },
        endpoints: [{ type: "read_write" }],
      }
    : { branch: { name: branchName }, endpoints: [{ type: "read_write" }] };
  const body = await requestJson<NeonBranchCreateResponse>(
    `https://console.neon.tech/api/v2/projects/${config.projectId}/branches`,
    {
      method: "POST",
      headers: neonHeaders(config),
      body: JSON.stringify(branchBody),
    },
  );
  if (!body.branch) {
    throw new Error("Neon API did not return a created branch");
  }
  return body.branch;
}

async function listBranchEndpoints(config: NeonConfig, branchId: string): Promise<NeonEndpoint[]> {
  const body = await requestJson<NeonEndpointListResponse>(
    `https://console.neon.tech/api/v2/projects/${config.projectId}/branches/${branchId}/endpoints`,
    { headers: neonHeaders(config) },
  );
  return body.endpoints ?? [];
}

async function createReadWriteEndpoint(
  config: NeonConfig,
  branchId: string,
): Promise<NeonEndpoint> {
  const body = await requestJson<NeonEndpointCreateResponse>(
    `https://console.neon.tech/api/v2/projects/${config.projectId}/endpoints`,
    {
      method: "POST",
      headers: neonHeaders(config),
      body: JSON.stringify({ endpoint: { branch_id: branchId, type: "read_write" } }),
    },
  );
  if (!body.endpoint) {
    throw new Error("Neon API did not return a created endpoint");
  }
  return body.endpoint;
}

async function ensureReadWriteEndpoint(
  config: NeonConfig,
  branchId: string,
): Promise<NeonEndpoint> {
  const existing = (await listBranchEndpoints(config, branchId)).find(
    (endpoint) => endpoint.type === "read_write",
  );
  return existing ?? (await createReadWriteEndpoint(config, branchId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getConnectionUri(
  config: NeonConfig,
  branchId: string,
  endpointId: string,
): Promise<string> {
  const params = new URLSearchParams({
    branch_id: branchId,
    endpoint_id: endpointId,
    database_name: config.databaseName,
    role_name: config.roleName,
  });
  const url = `https://console.neon.tech/api/v2/projects/${config.projectId}/connection_uri?${params.toString()}`;
  let body: { uri?: string } | undefined;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: neonHeaders(config) });
    if (response.ok) {
      body = (await response.json()) as { uri?: string };
      break;
    }
    if (response.status !== 404 || attempt === 5) {
      throw new Error(`Neon API request failed with status ${response.status}`);
    }
    await sleep(2000);
  }
  if (!body.uri) {
    throw new Error("Neon API did not return a connection URI");
  }
  return body.uri;
}

export async function ensureNamedBranch(
  config: NeonConfig,
  branchName: string,
): Promise<NeonBranchResult> {
  const existing = await findBranch(config, branchName);
  const branch = existing ?? (await createBranch(config, branchName));
  const endpoint = await ensureReadWriteEndpoint(config, branch.id);
  return {
    id: branch.id,
    reused: existing !== null,
    appDatabaseUrl: await getConnectionUri(config, branch.id, endpoint.id),
  };
}
