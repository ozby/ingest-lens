import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getNeonConfig,
  isNeonAvailable,
  NeonBranchProvider,
} from "./neon-branches";

const mockCreateProjectBranch = vi.fn();
const mockDeleteProjectBranch = vi.fn();
const mockListProjectBranches = vi.fn();
const mockListProjectEndpoints = vi.fn();
const mockCreateProjectEndpoint = vi.fn();
const mockGetConnectionUri = vi.fn();

vi.mock("@neondatabase/api-client", () => ({
  EndpointPoolerMode: {
    Session: "session",
  },
  EndpointType: {
    ReadWrite: "read_write",
  },
  createApiClient: () => ({
    createProjectBranch: mockCreateProjectBranch,
    deleteProjectBranch: mockDeleteProjectBranch,
    listProjectBranches: mockListProjectBranches,
    listProjectEndpoints: mockListProjectEndpoints,
    createProjectEndpoint: mockCreateProjectEndpoint,
    getConnectionUri: mockGetConnectionUri,
  }),
}));

describe("getNeonConfig", () => {
  it("returns config from env vars", () => {
    expect(
      getNeonConfig({
        NEON_API_KEY: "key",
        NEON_PROJECT_ID: "project",
        NEON_PARENT_BRANCH_ID: "parent",
      }),
    ).toEqual({
      apiKey: "key",
      projectId: "project",
      parentBranchId: "parent",
    });
  });

  it("throws when key or project is missing", () => {
    expect(() => getNeonConfig({ NEON_PROJECT_ID: "project" })).toThrow("NEON_API_KEY");
    expect(() => getNeonConfig({ NEON_API_KEY: "key" })).toThrow("NEON_PROJECT_ID");
  });
});

describe("isNeonAvailable", () => {
  it("returns true only when both required vars exist", () => {
    expect(isNeonAvailable({ NEON_API_KEY: "key", NEON_PROJECT_ID: "project" })).toBe(true);
    expect(isNeonAvailable({ NEON_API_KEY: "key" })).toBe(false);
  });
});

describe("NeonBranchProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListProjectBranches.mockResolvedValue({ data: { branches: [] } });
    mockCreateProjectBranch.mockResolvedValue({
      data: {
        branch: {
          id: "branch-1",
          name: "e2e/test",
          created_at: "2026-06-06T00:00:00Z",
        },
        connection_uris: [{ connection_uri: "postgres://pooled" }],
      },
    });
    mockListProjectEndpoints.mockResolvedValue({ data: { endpoints: [] } });
    mockCreateProjectEndpoint.mockResolvedValue({
      data: { endpoint: { id: "endpoint-1", branch_id: "branch-1", type: "read_write" } },
    });
    mockGetConnectionUri.mockResolvedValue({ data: { uri: "postgres://direct" } });
    mockDeleteProjectBranch.mockResolvedValue(undefined);
  });

  it("creates a branch and maps the result shape", async () => {
    const provider = new NeonBranchProvider({ apiKey: "key", projectId: "project" });
    const branch = await provider.createBranch({ name: "e2e/test", ttlMs: 3_600_000 });

    expect(branch.id).toBe("branch-1");
    expect(branch.connectionUri).toBe("postgres://pooled");
    expect(branch.name).toBe("e2e/test");
    expect(branch.createdAt).toBeInstanceOf(Date);
    expect(branch.expiresAt).toBeInstanceOf(Date);
  });

  it("deletes a branch", async () => {
    const provider = new NeonBranchProvider({ apiKey: "key", projectId: "project" });
    await provider.deleteBranch("branch-1");
    expect(mockDeleteProjectBranch).toHaveBeenCalledWith("project", "branch-1");
  });

  it("gets the default connection URI for main when branchId is absent", async () => {
    const provider = new NeonBranchProvider({ apiKey: "key", projectId: "project" });
    const uri = await provider.getConnectionUri();
    expect(uri).toBe("postgres://direct");
  });
});
