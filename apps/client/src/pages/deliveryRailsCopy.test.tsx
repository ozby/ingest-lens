import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Queues from "./Queues";
import Topics from "./Topics";

const apiMocks = vi.hoisted(() => ({
  deleteQueue: vi.fn(),
  deleteTopic: vi.fn(),
  getAllQueueMetrics: vi.fn(),
  getQueues: vi.fn(),
  getTopics: vi.fn(),
}));

vi.mock("@/services/api", () => ({ default: apiMocks }));
vi.mock("@/components/NavBar", () => ({
  default: () => <div>NavBar</div>,
}));
vi.mock("@/components/Sidebar", () => ({
  default: () => <div>Sidebar</div>,
}));
vi.mock("@/components/QueueForm", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock("@/components/TopicForm", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

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

    expect(
      screen.getByText("Manage the delivery rails that receive direct messages and retries."),
    ).toBeTruthy();
    expect(screen.getByText("No delivery queues yet")).toBeTruthy();
    expect(screen.getByText("Create a queue to receive direct messages and retries.")).toBeTruthy();
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

    expect(
      screen.getByText("Broadcast delivery events across subscribed delivery rails."),
    ).toBeTruthy();
    expect(screen.getByText("No delivery topics yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Create a topic when one delivery event should fan out across multiple delivery queues.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Manage your publish/subscribe topics")).toBeNull();
  });
});
