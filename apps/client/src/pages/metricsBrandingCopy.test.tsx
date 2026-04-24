import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Metrics from "./Metrics";

const apiMocks = vi.hoisted(() => ({
  getServerMetrics: vi.fn(),
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));
vi.mock("@/components/NavBar", () => ({
  default: () => <div>NavBar</div>,
}));
vi.mock("@/components/Sidebar", () => ({
  default: () => <div>Sidebar</div>,
}));
vi.mock("@/components/ServerMetrics", () => ({
  default: () => <div>Server metrics</div>,
}));

describe("metrics branding copy", () => {
  beforeEach(() => {
    apiMocks.getServerMetrics.mockReset();
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
