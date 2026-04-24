import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const apiMocks = vi.hoisted(() => ({
  clearToken: vi.fn(),
  getAllQueueMetrics: vi.fn(),
  getCurrentUser: vi.fn(),
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

    await waitFor(() =>
      expect(
        screen.getByText("Login or create an account to continue"),
      ).toBeTruthy(),
    );
  });

  it("redirects protected routes back to the auth landing page when no token is present", async () => {
    window.history.pushState({}, "", "/dashboard");

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText("Login or create an account to continue"),
      ).toBeTruthy(),
    );
  });

  it("renders the protected dashboard when auth bootstrap succeeds", async () => {
    localStorage.setItem("authToken", "token");
    apiMocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      username: "demo",
      email: "demo@example.com",
      createdAt: new Date("2026-04-01T00:00:00Z"),
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

    await waitFor(() =>
      expect(
        screen.getByText("Overview of your message queuing system"),
      ).toBeTruthy(),
    );
  });
});
