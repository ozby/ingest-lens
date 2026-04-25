import type { NeonConfig } from "./config";

export interface NeonBranchRecord {
  id: string;
  name: string;
  parent_id?: string;
  created_at: string;
  expires_at?: string;
}

export interface NeonConnectionUriRecord {
  connection_uri?: string;
}

export interface NeonListBranchesResponse {
  branches?: NeonBranchRecord[];
}

export interface NeonCreateBranchResponse {
  branch?: NeonBranchRecord;
  connection_uris?: NeonConnectionUriRecord[];
}

export interface CreateBranchPayload {
  branch: {
    name: string;
    parent_id: string;
    expires_at: string;
  };
}

export interface NeonClientOptions {
  fetch?: typeof fetch;
}

export class NeonApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NeonApiError";
    this.status = status;
  }
}

export interface NeonClient {
  listBranches(): Promise<NeonListBranchesResponse>;
  createBranch(payload: CreateBranchPayload): Promise<NeonCreateBranchResponse>;
  deleteBranch(branchId: string): Promise<void>;
}

export function createNeonClient(config: NeonConfig, options: NeonClientOptions = {}): NeonClient {
  const fetchImplementation = options.fetch ?? fetch;

  return {
    listBranches() {
      return requestJson<NeonListBranchesResponse>(
        fetchImplementation,
        config,
        `/projects/${config.projectId}/branches`,
      );
    },
    createBranch(payload) {
      return requestJson<NeonCreateBranchResponse>(
        fetchImplementation,
        config,
        `/projects/${config.projectId}/branches`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
    },
    deleteBranch(branchId) {
      return requestEmpty(
        fetchImplementation,
        config,
        `/projects/${config.projectId}/branches/${branchId}`,
        { method: "DELETE" },
      );
    },
  };
}

async function requestJson<TResponse>(
  fetchImplementation: typeof fetch,
  config: NeonConfig,
  path: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const response = await fetchImplementation(buildUrl(config, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new NeonApiError(response.status, await response.text());
  }

  return (await response.json()) as TResponse;
}

async function requestEmpty(
  fetchImplementation: typeof fetch,
  config: NeonConfig,
  path: string,
  init: RequestInit,
): Promise<void> {
  const response = await fetchImplementation(buildUrl(config, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new NeonApiError(response.status, await response.text());
  }
}

function buildUrl(config: NeonConfig, path: string): string {
  return new URL(path, `${config.apiBaseUrl}/`).toString();
}
