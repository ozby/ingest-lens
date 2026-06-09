import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Metrics from "./Metrics";

const authState = {
  user: { id: "user-1", name: "Operator", email: "operator@example.com" },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const apiMocks = vi.hoisted(() => ({
  getServerActivityHistory: vi.fn(),
  getServerMetrics: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));

describe("metrics branding copy", () => {
  beforeEach(() => {
    apiMocks.getServerMetrics.mockReset();
    apiMocks.getServerActivityHistory.mockReset();
  });

  it("frames metrics around delivery and intake observability", async () => {
    apiMocks.getServerMetrics.mockResolvedValueOnce({
      startTime: new Date("2026-04-01T00:00:00Z"),
      totalRequests: 42,
      activeConnections: 2,
      messagesProcessed: 12,
      errorCount: 0,
      avgResponseTime: 3.5,
    });
    apiMocks.getServerActivityHistory.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Metrics />
      </MemoryRouter>,
    );

    await screen.findByText("Delivery and intake metrics");

    screen.getByText(
      "Monitor delivery throughput, queue health, and intake observability for your owned rails.",
    );
    expect(screen.queryByText("System Metrics")).toBeNull();
    expect(screen.queryByText("Monitor the performance of your message queuing system")).toBeNull();
  });
});
