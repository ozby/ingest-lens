import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NavBar from "./NavBar";
import Sidebar from "./Sidebar";

const authMocks = vi.hoisted(() => ({
  logout: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { username: "operator" },
    logout: authMocks.logout,
  }),
}));

describe("branding shell", () => {
  it("shows IngestLens shell branding without hiding delivery primitives", () => {
    render(
      <MemoryRouter>
        <NavBar toggleSidebar={() => {}} />
        <Sidebar isOpen closeSidebar={() => {}} />
      </MemoryRouter>,
    );

    screen.getByText("IngestLens");
    screen.getByText("AI-assisted integration observability");
    expect(screen.queryByText("PubSub Dashboard")).toBeNull();

    screen.getByText("INTEGRATION OBSERVABILITY");
    screen.getByText("DELIVERY PRIMITIVES");
    screen.getByText("Queues and topics stay visible as the shipped delivery rails.");
    screen.getByText(
      "Queue metrics and delivery telemetry remain visible while intake tooling is still planned.",
    );

    screen.getByText("Queues");
    screen.getByText("Topics");
    screen.getByText("Server Metrics");
  });
});
