import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router-dom";
import { beforeEach, describe, it, vi } from "vitest";
import { createAppRoutes, type AppPages } from "./App";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Queues from "./pages/Queues";
import QueueDetail from "./pages/QueueDetail";
import Topics from "./pages/Topics";
import TopicDetail from "./pages/TopicDetail";
import NotFound from "./pages/NotFound";
import Metrics from "./pages/Metrics";
import Intake from "./pages/Intake";
import AdminIntake from "./pages/AdminIntake";

const landingPageCopy =
  "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.";
const dashboardSummaryCopy =
  "Track delivery rails, queue activity, and observability across your owned queues and topics.";
const metricsSummaryCopy =
  "Monitor delivery throughput, queue health, and intake observability for your owned rails.";
const intakeRouteHeading = "Intake mapping";
const adminIntakeRouteHeading = "Intake admin review";

const apiMocks = vi.hoisted(() => ({
  clearToken: vi.fn(),
  getAllQueueMetrics: vi.fn(),
  getCurrentUser: vi.fn(),
  getIntakeSuggestions: vi.fn(),
  getQueues: vi.fn(),
  getServerActivityHistory: vi.fn(),
  getServerMetrics: vi.fn(),
  getTopics: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));
vi.mock("./services/api", () => ({ default: apiMocks }));

// Eager page references: the same route tree the production App renders, but
// without lazy() — so the MemoryRouter in createRoutesStub resolves pages
// synchronously and there is no Suspense race against findBy* timeouts.
const eagerPages: AppPages = {
  Index,
  Dashboard,
  Queues,
  QueueDetail,
  Topics,
  TopicDetail,
  NotFound,
  Metrics,
  Intake,
  AdminIntake,
};

const Stub = createRoutesStub(createAppRoutes(eagerPages));

// sonner's Toaster (mounted by the production App) reads window.matchMedia in a
// passive effect. We only render the route tree here — Toaster lives outside
// createAppRoutes — so matchMedia isn't strictly required, but we install it
// once as a safety net for any page that queries it.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("App route tree", () => {
  beforeEach(() => {
    for (const mockFn of Object.values(apiMocks)) {
      mockFn.mockReset();
    }
    localStorage.clear();
  });

  it("shows the auth landing page at the root route when signed out", async () => {
    render(<Stub initialEntries={["/"]} />);

    await screen.findByText(landingPageCopy);
  });

  it("redirects protected routes to the auth landing page when no token is present", async () => {
    render(<Stub initialEntries={["/dashboard"]} />);

    await screen.findByText(landingPageCopy);
  });

  it("renders the protected dashboard when auth bootstrap succeeds", async () => {
    localStorage.setItem("authToken", "token");
    apiMocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      username: "demo",
      email: "demo@example.com",
      createdAt: new Date("2026-04-01T00:00:00Z"),
      updatedAt: new Date("2026-04-01T00:00:00Z"),
    });
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

    render(<Stub initialEntries={["/dashboard"]} />);

    await screen.findByText(dashboardSummaryCopy);
  });

  it("renders the protected intake route after auth bootstrap", async () => {
    localStorage.setItem("authToken", "token");
    apiMocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      username: "demo",
      email: "demo@example.com",
      createdAt: new Date("2026-04-01T00:00:00Z"),
      updatedAt: new Date("2026-04-01T00:00:00Z"),
    });
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([]);

    render(<Stub initialEntries={["/intake"]} />);

    await screen.findByText(intakeRouteHeading);
  });

  it("renders the protected metrics route after auth bootstrap", async () => {
    localStorage.setItem("authToken", "token");
    apiMocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      username: "demo",
      email: "demo@example.com",
      createdAt: new Date("2026-04-01T00:00:00Z"),
      updatedAt: new Date("2026-04-01T00:00:00Z"),
    });
    apiMocks.getServerMetrics.mockResolvedValueOnce({
      startTime: new Date("2026-04-01T00:00:00Z"),
      totalRequests: 42,
      activeConnections: 2,
      messagesProcessed: 12,
      errorCount: 0,
      avgResponseTime: 3.5,
    });

    render(<Stub initialEntries={["/metrics"]} />);

    await screen.findByText(metricsSummaryCopy);
  });

  it("renders the protected admin intake review route after auth bootstrap", async () => {
    localStorage.setItem("authToken", "token");
    apiMocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      username: "demo",
      email: "demo@example.com",
      createdAt: new Date("2026-04-01T00:00:00Z"),
      updatedAt: new Date("2026-04-01T00:00:00Z"),
    });
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([]);

    render(<Stub initialEntries={["/admin/intake"]} />);

    await screen.findByText(adminIntakeRouteHeading);
  });
});
