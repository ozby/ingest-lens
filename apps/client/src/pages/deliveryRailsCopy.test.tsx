import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Queues from "./Queues";
import Topics from "./Topics";

const authState = {
  user: { id: "user-1", name: "Operator", email: "operator@example.com" },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const apiMocks = vi.hoisted(() => ({
  deleteQueue: vi.fn(),
  deleteTopic: vi.fn(),
  getAllQueueMetrics: vi.fn(),
  getQueues: vi.fn(),
  getTopics: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));

describe("delivery rail copy", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it("frames queues as current delivery rails", async () => {
    apiMocks.getQueues.mockResolvedValueOnce([]);
    apiMocks.getAllQueueMetrics.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Queues />
      </MemoryRouter>,
    );

    await screen.findByText("Delivery Queues");

    screen.getByText("Manage the delivery rails that receive direct messages and retries.");
    screen.getByText("No delivery queues yet");
    screen.getByText("Create a queue to receive direct messages and retries.");
    expect(screen.queryByText("Manage your message queues")).toBeNull();
  });

  it("frames topics as current fan-out delivery rails", async () => {
    apiMocks.getTopics.mockResolvedValueOnce([]);
    apiMocks.getQueues.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Topics />
      </MemoryRouter>,
    );

    await screen.findByText("Delivery Topics");

    screen.getByText("Broadcast delivery events across subscribed delivery rails.");
    screen.getByText("No delivery topics yet");
    screen.getByText(
      "Create a topic when one delivery event should fan out across multiple delivery queues.",
    );
    expect(screen.queryByText("Manage your publish/subscribe topics")).toBeNull();
  });
});
