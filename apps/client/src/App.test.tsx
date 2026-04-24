import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, vi } from "vitest";
import App from "./App";

const landingPageCopy =
  "Sign in to inspect delivery rails, monitor observability, and prepare for future intake mapping workflows.";
const dashboardSummaryCopy =
  "Track delivery rails, queue activity, and observability across your owned queues and topics.";
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

vi.mock("@/services/api", () => ({
  default: apiMocks,
}));

vi.mock("./services/api", () => ({
  default: apiMocks,
}));

describe("App", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mockFn) => mockFn.mockReset());
    localStorage.clear();
    window.history.pushState({}, "", "/");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("shows the auth landing page at the root route when signed out", async () => {
    render(<App />);

    await screen.findByText(landingPageCopy);
  });

  it("redirects protected routes back to the auth landing page when no token is present", async () => {
    window.history.pushState({}, "", "/dashboard");

    render(<App />);

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
    window.history.pushState({}, "", "/dashboard");

    render(<App />);

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
    window.history.pushState({}, "", "/intake");

    render(<App />);

    await screen.findByText(intakeRouteHeading);
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
    window.history.pushState({}, "", "/admin/intake");

    render(<App />);

    await screen.findByText(adminIntakeRouteHeading);
  });
});
