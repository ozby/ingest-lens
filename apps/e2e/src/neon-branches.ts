import { createApiClient, EndpointPoolerMode, EndpointType } from "@neondatabase/api-client";

const DEFAULT_TTL_HOURS = 1;
const MAX_TTL_HOURS = 24 * 30;

export interface NeonConfig {
  apiKey: string;
  projectId: string;
  parentBranchId?: string;
}

export interface NeonConfigInput {
  NEON_API_KEY?: string;
  NEON_PROJECT_ID?: string;
  NEON_PARENT_BRANCH_ID?: string;
}

export interface Branch {
  id: string;
  connectionUri: string;
  name?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

export interface BranchConfig {
  name?: string;
  parentBranchId?: string;
  ttlMs?: number;
}

export interface BranchProvider {
  createBranch(config?: BranchConfig): Promise<Branch>;
  deleteBranch(branchId: string): Promise<void>;
  resetBranch(branchId: string): Promise<void>;
  getConnectionUri(branchId?: string): Promise<string>;
}

export interface BranchDatabaseUrls {
  appDatabaseUrl: string;
  runtimeDatabaseUrl: string;
}

export interface EphemeralBranch {
  id: string;
  name: string;
  projectId: string;
  connectionUri: string;
  appDatabaseUrl?: string;
  runtimeDatabaseUrl?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface CreateBranchOptions {
  name?: string;
  ttlHours?: number;
}

export interface CleanupOptions {
  maxAgeHours?: number;
  now?: Date;
}

export function getNeonConfig(input: NeonConfigInput = process.env as NeonConfigInput): NeonConfig {
  const apiKey = input.NEON_API_KEY;
  const projectId = input.NEON_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error("Missing Neon configuration. Expected NEON_API_KEY and NEON_PROJECT_ID.");
  }

  return {
    apiKey,
    projectId,
    parentBranchId: input.NEON_PARENT_BRANCH_ID,
  };
}

export function isNeonAvailable(input: NeonConfigInput = process.env as NeonConfigInput): boolean {
  return Boolean(input.NEON_API_KEY && input.NEON_PROJECT_ID);
}

export function generateBranchName(prefix = "e2e"): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}/${timestamp}-${random}`;
}

export function calculateExpiryDate(ttlHours: number): string {
  const clamped = Math.min(ttlHours, MAX_TTL_HOURS);
  return new Date(Date.now() + clamped * 60 * 60 * 1000).toISOString();
}

function getClient(config: NeonConfig) {
  return createApiClient({ apiKey: config.apiKey });
}

function is404Error(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (!("response" in error)) return false;
  return (error as { response?: { status?: number } }).response?.status === 404;
}

async function findExistingBranch(
  client: ReturnType<typeof createApiClient>,
  projectId: string,
  branchName: string,
): Promise<{ id: string; name: string; createdAt: string } | null> {
  const { data } = await client.listProjectBranches({ projectId });
  const found = data?.branches?.find((branch) => branch.name === branchName);
  if (!found) return null;
  return {
    id: found.id,
    name: found.name,
    createdAt: (found as unknown as Record<string, string>).created_at ?? "",
  };
}

async function fetchConnectionUri(
  client: ReturnType<typeof createApiClient>,
  projectId: string,
  branchId: string,
  options: { pooled?: boolean } = {},
): Promise<string | null> {
  const { data } = await client.getConnectionUri({
    projectId,
    branch_id: branchId,
    role_name: "neondb_owner",
    database_name: "neondb",
    ...(options.pooled !== undefined ? { pooled: options.pooled } : {}),
  });
  return data?.uri ?? null;
}

async function resolveBranchDatabaseUrls(
  client: ReturnType<typeof createApiClient>,
  projectId: string,
  branchId: string,
  connectionUris?: Array<{ connection_uri?: string }>,
): Promise<BranchDatabaseUrls | null> {
  const fromResponse = connectionUris?.[0]?.connection_uri;
  const [appDatabaseUrl, runtimeDatabaseUrl] = await Promise.all([
    fromResponse ?? fetchConnectionUri(client, projectId, branchId, { pooled: true }),
    fetchConnectionUri(client, projectId, branchId, { pooled: false }),
  ]);
  const resolvedApp = appDatabaseUrl ?? runtimeDatabaseUrl;
  if (!resolvedApp || !runtimeDatabaseUrl) return null;
  return { appDatabaseUrl: resolvedApp, runtimeDatabaseUrl };
}

async function ensureBranchDatabaseUrls(
  client: ReturnType<typeof createApiClient>,
  projectId: string,
  branchId: string,
): Promise<BranchDatabaseUrls> {
  try {
    const { data: endpoints } = await client.listProjectEndpoints(projectId);
    const branchEndpoints = endpoints?.endpoints?.filter((endpoint) => endpoint.branch_id === branchId);
    if (!branchEndpoints?.length) {
      await client.createProjectEndpoint(projectId, {
        endpoint: {
          branch_id: branchId,
          type: EndpointType.ReadWrite,
          pooler_enabled: true,
          pooler_mode: "session" as unknown as EndpointPoolerMode,
        },
      });
    }
  } catch {
    // best effort
  }

  const urls = await resolveBranchDatabaseUrls(client, projectId, branchId);
  if (!urls) throw new Error("Failed to get connection URIs");
  return urls;
}

async function toEphemeralBranchFromExisting(
  client: ReturnType<typeof createApiClient>,
  config: NeonConfig,
  existing: { id: string; name: string; createdAt: string },
): Promise<EphemeralBranch> {
  const urls = await ensureBranchDatabaseUrls(client, config.projectId, existing.id);
  return {
    id: existing.id,
    name: existing.name,
    projectId: config.projectId,
    connectionUri: urls.appDatabaseUrl,
    appDatabaseUrl: urls.appDatabaseUrl,
    runtimeDatabaseUrl: urls.runtimeDatabaseUrl,
    createdAt: existing.createdAt,
  };
}

function buildCreateProjectBranchRequest(
  config: NeonConfig,
  branchName: string,
  expiresAt: string,
): Parameters<typeof createApiClient>[0] extends never
  ? never
  : Parameters<ReturnType<typeof createApiClient>["createProjectBranch"]>[1] {
  return {
    branch: {
      name: branchName,
      parent_id: config.parentBranchId,
      expires_at: expiresAt,
    } as Record<string, unknown>,
    endpoints: [
      {
        type: EndpointType.ReadWrite,
        autoscaling_limit_min_cu: 0.25,
        autoscaling_limit_max_cu: 1,
        pooler_enabled: true,
        pooler_mode: "session",
      } as unknown as Parameters<ReturnType<typeof createApiClient>["createProjectBranch"]>[1] extends {
        endpoints?: Array<infer E>;
      }
        ? E
        : never,
    ],
  } as Parameters<ReturnType<typeof createApiClient>["createProjectBranch"]>[1];
}

async function createProjectBranch(
  client: ReturnType<typeof createApiClient>,
  config: NeonConfig,
  branchName: string,
  expiresAt: string,
): Promise<{
  branchData: Record<string, string | undefined>;
  connectionUris?: Array<{ connection_uri?: string }>;
}> {
  const { data } = await client.createProjectBranch(
    config.projectId,
    buildCreateProjectBranchRequest(config, branchName, expiresAt),
  );

  if (!data?.branch) {
    throw new Error("Failed to create Neon branch: no branch returned");
  }

  const branchData = data.branch as unknown as Record<string, string | undefined>;
  const rawData = data as unknown as Record<string, unknown>;
  return {
    branchData,
    connectionUris: rawData.connection_uris as Array<{ connection_uri?: string }> | undefined,
  };
}

export async function createEphemeralBranch(
  config: NeonConfig,
  options: CreateBranchOptions = {},
): Promise<EphemeralBranch> {
  const client = getClient(config);
  const branchName = options.name ?? generateBranchName();
  const ttlHours = options.ttlHours ?? DEFAULT_TTL_HOURS;
  const expiresAt = calculateExpiryDate(ttlHours);

  const existing = await findExistingBranch(client, config.projectId, branchName);
  if (existing) {
    return toEphemeralBranchFromExisting(client, config, existing);
  }

  const { branchData, connectionUris } = await createProjectBranch(
    client,
    config,
    branchName,
    expiresAt,
  );

  const urls = await resolveBranchDatabaseUrls(
    client,
    config.projectId,
    branchData.id ?? "",
    connectionUris,
  );
  if (!urls) throw new Error("Failed to get connection URIs for new branch");

  return {
    id: branchData.id ?? "",
    name: branchData.name ?? "",
    projectId: config.projectId,
    connectionUri: urls.appDatabaseUrl,
    appDatabaseUrl: urls.appDatabaseUrl,
    runtimeDatabaseUrl: urls.runtimeDatabaseUrl,
    createdAt: branchData.created_at ?? "",
    expiresAt,
  };
}

export async function deleteEphemeralBranch(config: NeonConfig, branchId: string): Promise<void> {
  const client = getClient(config);
  try {
    await client.deleteProjectBranch(config.projectId, branchId);
  } catch (error) {
    if (!is404Error(error)) throw error;
  }
}

export async function listE2EBranches(config: NeonConfig): Promise<EphemeralBranch[]> {
  const client = getClient(config);
  const { data } = await client.listProjectBranches({ projectId: config.projectId });

  return (data?.branches ?? [])
    .filter((branch) => branch.name.startsWith("e2e/"))
    .map((branch) => {
      const raw = branch as unknown as Record<string, string | undefined>;
      return {
        id: branch.id,
        name: branch.name,
        projectId: config.projectId,
        connectionUri: "",
        createdAt: raw.created_at ?? "",
        expiresAt: raw.expires_at,
      };
    });
}

export async function cleanupStaleE2EBranches(
  config: NeonConfig,
  options: CleanupOptions = {},
): Promise<{ deletedBranchIds: string[] }> {
  const maxAgeHours = options.maxAgeHours ?? 24;
  const cutoff = new Date((options.now ?? new Date()).getTime() - maxAgeHours * 60 * 60 * 1000);
  const branches = await listE2EBranches(config);

  const stale = branches.filter((branch) => new Date(branch.createdAt).getTime() <= cutoff.getTime());
  const deletedBranchIds: string[] = [];
  for (const branch of stale) {
    await deleteEphemeralBranch(config, branch.id);
    deletedBranchIds.push(branch.id);
  }
  return { deletedBranchIds };
}

export async function getBranchConnectionUri(
  config: NeonConfig,
  branchId: string,
  options: { pooled?: boolean } = {},
): Promise<string> {
  const client = getClient(config);
  const urls = await ensureBranchDatabaseUrls(client, config.projectId, branchId);
  return options.pooled === false ? urls.runtimeDatabaseUrl : urls.appDatabaseUrl;
}

export class NeonBranchProvider implements BranchProvider {
  constructor(private readonly config: NeonConfig) {}

  async createBranch(config?: BranchConfig): Promise<Branch> {
    const branch = await createEphemeralBranch(this.config, {
      name: config?.name,
      ttlHours: config?.ttlMs !== undefined ? config.ttlMs / 3_600_000 : undefined,
    });

    return {
      id: branch.id,
      connectionUri: branch.connectionUri,
      name: branch.name,
      createdAt: new Date(branch.createdAt),
      expiresAt: branch.expiresAt ? new Date(branch.expiresAt) : undefined,
    };
  }

  async deleteBranch(branchId: string): Promise<void> {
    await deleteEphemeralBranch(this.config, branchId);
  }

  async resetBranch(branchId: string): Promise<void> {
    await deleteEphemeralBranch(this.config, branchId);
    await createEphemeralBranch(this.config);
  }

  async getConnectionUri(branchId?: string): Promise<string> {
    return getBranchConnectionUri(this.config, branchId ?? "main");
  }
}
