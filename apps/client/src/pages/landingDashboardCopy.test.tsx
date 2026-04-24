import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Index from "./Index";
import Dashboard from "./Dashboard";

const navigateMock = vi.fn();
const authState = {
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
};

const apiMocks = vi.hoisted(() => ({
  getAllQueueMetrics: vi.fn(),
  getQueues: vi.fn(),
  getServerMetrics: vi.fn(),
  getTopics: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));
vi.mock("@/components/NavBar", () => ({
  default: () => <div>NavBar</div>,
}));
vi.mock("@/components/Sidebar", () => ({
  default: () => <div>Sidebar</div>,
}));
vi.mock("@/components/MetricsCard", () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div>
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}));
vi.mock("@/components/ServerMetrics", () => ({
  default: () => <div>Server metrics</div>,
}));
vi.mock("@/components/QueueForm", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/TopicForm", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

describe("landing and dashboard copy", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    authState.isAuthenticated = false;
    authState.isLoading = false;
    Object.values(apiMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it("positions the landing page around intake observability", () => {
    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    expect(screen.getByText("IngestLens")).toBeTruthy();
    expect(
      screen.getByText(
        "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.",
      ),
    ).toBeTruthy();
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

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText("IngestLens operations dashboard");

    expect(
      screen.getByText(
        "Track delivery rails, queue activity, and observability across your owned queues and topics.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No delivery queues configured yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Create a queue to route delivery traffic and retries while intake tooling remains planned.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No delivery topics configured yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Create a topic when one delivery event should fan out across multiple delivery rails.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Overview of your message queuing system")).toBeNull();
  });
});
