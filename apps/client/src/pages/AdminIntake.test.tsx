import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import AdminIntake from "./AdminIntake";

const apiMocks = vi.hoisted(() => ({
  approveIntakeSuggestion: vi.fn(),
  getIntakeSuggestions: vi.fn(),
  rejectIntakeSuggestion: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  default: apiMocks,
}));

vi.mock("@/components/NavBar", () => ({
  default: () => <div>NavBar</div>,
}));
vi.mock("@/components/Sidebar", () => ({
  default: () => <div>Sidebar</div>,
}));
vi.mock("@/components/MappingSuggestionReview", () => ({
  default: ({
    suggestion,
    onToggle,
  }: {
    suggestion: { id: string; sourcePath: string; targetField: string };
    onToggle?: (id: string, selected: boolean) => void;
  }) => (
    <div>
      <span>{suggestion.id}</span>
      <span>{suggestion.sourcePath}</span>
      <span>{suggestion.targetField}</span>
      <input
        aria-label={`approve-${suggestion.id}`}
        type="checkbox"
        onChange={(event) => onToggle?.(suggestion.id, event.currentTarget.checked)}
      />
    </div>
  ),
}));

const attempt = {
  intakeAttemptId: "attempt-1",
  mappingTraceId: "trace-1",
  contractId: "order-created-v1",
  contractVersion: "1.0.0",
  sourceSystem: "source-system",
  sourceKind: "inline_payload",
  sourceHash: "hash-1",
  deliveryTarget: { queueId: "queue-1" },
  status: "pending_review",
  ingestStatus: "pending",
  driftCategory: "renamed_field",
  modelName: "gpt-test",
  promptVersion: "payload-mapper-v1",
  overallConfidence: 0.78,
  redactedSummary: "Sanitized payload preview",
  validationErrors: [],
  createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
  suggestionBatch: {
    mappingTraceId: "trace-1",
    contractId: "order-created-v1",
    contractVersion: "1.0.0",
    sourceSystem: "source-system",
    promptVersion: "payload-mapper-v1",
    generatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    overallConfidence: 0.8,
    driftCategories: [],
    missingRequiredFields: [],
    ambiguousTargetFields: [],
    summary: "summary",
    suggestions: [
      {
        id: "s-1",
        sourcePath: "$.name",
        targetField: "name",
        transformKind: "copy",
        confidence: 0.99,
        explanation: "copy suggestion",
        evidenceSample: "sample",
        deterministicValidation: {
          isValid: true,
          validatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
          errors: [],
        },
        reviewStatus: "pending",
        replayStatus: "not_requested",
      },
    ],
  },
};

describe("AdminIntake page", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it("loads pending attempts and shows ingest trace", async () => {
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([attempt]);

    render(
      <MemoryRouter>
        <AdminIntake />
      </MemoryRouter>,
    );

    await screen.findByText("mappingTraceId: trace-1");
    screen.getByText("pending_review");
    expect(apiMocks.getIntakeSuggestions).toHaveBeenCalledWith();
  });

  it("approves selected mapping suggestion and uses mappingTraceId in result", async () => {
    const user = userEvent.setup();
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([attempt]);
    apiMocks.approveIntakeSuggestion.mockResolvedValueOnce({
      attempt: {
        ...attempt,
        status: "ingested",
        ingestStatus: "ingested",
      },
      mappingVersion: {
        mappingVersionId: "mapping-1",
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "order-created-v1",
        contractVersion: "1.0.0",
        targetRecordType: "order_created",
        approvedSuggestionIds: ["s-1"],
        sourceHash: "hash-1",
        sourceKind: "inline_payload",
        deliveryTarget: { queueId: "queue-1" },
        createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
      },
    });

    render(
      <MemoryRouter>
        <AdminIntake />
      </MemoryRouter>,
    );

    const check = await screen.findByLabelText("approve-s-1");
    await user.click(check);
    await user.click(screen.getByRole("button", { name: "Approve selected" }));

    expect(apiMocks.approveIntakeSuggestion).toHaveBeenCalledWith("attempt-1", {
      approvedSuggestionIds: ["s-1"],
    });
    const ingestNode = await screen.findByText((_, node) => {
      const textContent = node?.tagName?.toLowerCase() === "span" ? node.textContent : "";
      return textContent.includes("Ingest: ingested");
    });
    ingestNode;
  });

  it("rejects attempt with reason", async () => {
    const user = userEvent.setup();
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([attempt]);
    apiMocks.rejectIntakeSuggestion.mockResolvedValueOnce({
      ...attempt,
      status: "rejected",
      ingestStatus: "not_started",
      rejectionReason: "No good",
    });

    render(
      <MemoryRouter>
        <AdminIntake />
      </MemoryRouter>,
    );

    await screen.findByText("attempt-1");
    const sanitizedHeaders = screen.getAllByText("Sanitized payload preview");
    expect(sanitizedHeaders).toHaveLength(2);
    sanitizedHeaders[0];
    await user.type(screen.getByPlaceholderText("Rejection reason"), "No good");
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(apiMocks.rejectIntakeSuggestion).toHaveBeenCalledWith("attempt-1", {
      reason: "No good",
    });
  });
});
