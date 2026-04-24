import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupStaleE2EBranches,
  createEphemeralBranch,
  deleteEphemeralBranch,
  listE2EBranches,
} from "../branches";
import type { NeonConfig } from "../config";

const config: NeonConfig = {
  apiKey: "neon-key",
  projectId: "project-id",
  parentBranchId: "parent-branch-id",
  apiBaseUrl: "https://console.neon.tech/api/v2",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("@repo/neon branch operations", () => {
  it("creates an ephemeral branch from the parent branch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          branch: {
            id: "branch-id",
            name: "e2e/20260424101112-abc1",
            parent_id: "parent-branch-id",
            created_at: "2026-04-24T10:11:12.000Z",
            expires_at: "2026-04-24T11:11:12.000Z",
          },
          connection_uris: [{ connection_uri: "postgres://branch" }],
        }),
        { status: 201 },
      ),
    );

    const branch = await createEphemeralBranch(config, {
      name: "e2e/20260424101112-abc1",
      ttlHours: 1,
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://console.neon.tech/api/v2/projects/project-id/branches",
      expect.objectContaining({ method: "POST" }),
    );
    expect(branch).toEqual({
      id: "branch-id",
      name: "e2e/20260424101112-abc1",
      parentId: "parent-branch-id",
      connectionUri: "postgres://branch",
      createdAt: "2026-04-24T10:11:12.000Z",
      expiresAt: "2026-04-24T11:11:12.000Z",
    });
  });

  it("lists only e2e branches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          branches: [
            {
              id: "branch-a",
              name: "e2e/branch-a",
              parent_id: "parent-branch-id",
              created_at: "2026-04-24T08:00:00.000Z",
            },
            {
              id: "branch-b",
              name: "feature/not-e2e",
              parent_id: "parent-branch-id",
              created_at: "2026-04-24T09:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(listE2EBranches(config, { fetch: fetchMock })).resolves.toEqual([
      {
        id: "branch-a",
        name: "e2e/branch-a",
        parentId: "parent-branch-id",
        connectionUri: undefined,
        createdAt: "2026-04-24T08:00:00.000Z",
        expiresAt: undefined,
      },
    ]);
  });

  it("deletes a branch by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await deleteEphemeralBranch(config, "branch-id", { fetch: fetchMock });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://console.neon.tech/api/v2/projects/project-id/branches/branch-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("cleans up only stale e2e branches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            branches: [
              {
                id: "branch-old",
                name: "e2e/branch-old",
                parent_id: "parent-branch-id",
                created_at: "2026-04-24T06:00:00.000Z",
              },
              {
                id: "branch-fresh",
                name: "e2e/branch-fresh",
                parent_id: "parent-branch-id",
                created_at: "2026-04-24T09:30:00.000Z",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      cleanupStaleE2EBranches(config, {
        fetch: fetchMock,
        maxAgeHours: 2,
        now: new Date("2026-04-24T10:00:00.000Z"),
      }),
    ).resolves.toEqual({ deletedBranchIds: ["branch-old"] });
  });
});
