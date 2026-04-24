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

    expect(screen.getByText("IngestLens")).toBeTruthy();
    expect(screen.getByText("AI-assisted integration observability")).toBeTruthy();
    expect(screen.queryByText("PubSub Dashboard")).toBeNull();

    expect(screen.getByText("INTEGRATION OBSERVABILITY")).toBeTruthy();
    expect(screen.getByText("DELIVERY PRIMITIVES")).toBeTruthy();
    expect(
      screen.getByText("Queues and topics stay visible as the shipped delivery rails."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Queue metrics and delivery telemetry remain visible while intake tooling is still planned.",
      ),
    ).toBeTruthy();

    expect(screen.getByText("Queues")).toBeTruthy();
    expect(screen.getByText("Topics")).toBeTruthy();
    expect(screen.getByText("Server Metrics")).toBeTruthy();
  });
});
