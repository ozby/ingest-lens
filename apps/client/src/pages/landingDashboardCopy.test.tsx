import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Index from "./Index";
import Dashboard from "./Dashboard";

const authState = {
  isAuthenticated: false,
  isLoading: false,
  user: { id: "user-1", name: "Operator", email: "operator@example.com" },
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const apiMocks = vi.hoisted(() => ({
  getAllQueueMetrics: vi.fn(),
  getServerActivityHistory: vi.fn(),
  getQueues: vi.fn(),
  getServerMetrics: vi.fn(),
  getTopics: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));

describe("landing and dashboard copy", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.user = { id: "user-1", name: "Operator", email: "operator@example.com" };
    Object.values(apiMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it("positions the landing page around intake observability", () => {
    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    screen.getByText("IngestLens");
    screen.getByText(
      "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.",
    );
    expect(screen.queryByText("PubSub Dashboard")).toBeNull();
  });

  it("guides empty dashboard states toward payload ingestion and delivery setup", async () => {
    apiMocks.getQueues.mockResolvedValueOnce([]);
    apiMocks.getTopics.mockResolvedValueOnce([]);
    apiMocks.getAllQueueMetrics.mockResolvedValueOnce([]);
    apiMocks.getServerMetrics.mockResolvedValueOnce({
      startTime: new Date("2026-04-01T00:00:00Z"),
      totalRequests: 0,
      activeConnections: 0,
      messagesProcessed: 0,
      errorCount: 0,
      avgResponseTime: 0,
    });
    apiMocks.getServerActivityHistory.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText("IngestLens operations dashboard");

    screen.getByText(
      "Track delivery rails, queue activity, and observability across your owned queues and topics.",
    );
    screen.getByText("No delivery queues configured yet");
    screen.getByText(
      "Create a queue to route delivery traffic and retries while intake tooling remains planned.",
    );
    screen.getByText("No delivery topics configured yet");
    screen.getByText(
      "Create a topic when one delivery event should fan out across multiple delivery rails.",
    );
    expect(screen.queryByText("Overview of your message queuing system")).toBeNull();
  });
});
