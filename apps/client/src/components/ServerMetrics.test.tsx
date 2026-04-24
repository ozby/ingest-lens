import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerMetrics from "./ServerMetrics";

const apiMocks = vi.hoisted(() => ({
  getServerActivityHistory: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  default: {
    getServerActivityHistory: apiMocks.getServerActivityHistory,
  },
}));

describe("ServerMetrics", () => {
  beforeEach(() => {
    apiMocks.getServerActivityHistory.mockReset();
  });

  it("labels fallback activity as demo data when measured history is unavailable", async () => {
    apiMocks.getServerActivityHistory.mockResolvedValueOnce([]);

    render(
      <ServerMetrics
        metrics={{
          startTime: new Date("2026-04-20T00:00:00Z"),
          totalRequests: 125,
          activeConnections: 3,
          messagesProcessed: 42,
          errorCount: 1,
          avgResponseTime: 12.5,
        }}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Demo sample activity shown until measured history is available.",
        ),
      ).toBeTruthy(),
    );

    expect(screen.getByText("Activity Source")).toBeTruthy();
    expect(
      screen.getByText(
        "Demo sample derived in the client because the worker has no measured activity history yet.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/from last period/i)).toBeNull();
  });

  it("labels worker-provided activity history as measured", async () => {
    apiMocks.getServerActivityHistory.mockResolvedValueOnce([]);

    render(
      <ServerMetrics
        metrics={{
          startTime: new Date("2026-04-20T00:00:00Z"),
          totalRequests: 125,
          activeConnections: 3,
          messagesProcessed: 42,
          errorCount: 1,
          avgResponseTime: 12.5,
          activityHistory: [
            { time: "10:00", requests: 5, messages: 2, errors: 0 },
          ],
        }}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Activity history is measured from the current dashboard payload.",
        ),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText("Measured activity history from the worker response."),
    ).toBeTruthy();
    expect(apiMocks.getServerActivityHistory).not.toHaveBeenCalled();
  });
});
