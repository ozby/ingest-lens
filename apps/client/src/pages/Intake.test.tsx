import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import Intake from "./Intake";

const apiMocks = vi.hoisted(() => ({
  createIntakeSuggestion: vi.fn(),
  getIntakeSuggestions: vi.fn(),
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

describe("Intake page", () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((fn) => fn.mockReset());
  });

  it("renders list heading and fetches history", async () => {
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([
      {
        intakeAttemptId: "attempt-1",
        mappingTraceId: "trace-1",
        contractId: "order-created-v1",
        contractVersion: "1.0.0",
        sourceSystem: "webhook-provider-a",
        sourceKind: "inline_payload",
        sourceHash: "hash-1",
        deliveryTarget: { queueId: "queue-1" },
        status: "pending_review",
        ingestStatus: "not_started",
        driftCategory: "renamed_field",
        modelName: "gpt-test",
        promptVersion: "payload-mapper-v1",
        overallConfidence: 0.7,
        redactedSummary: "Preview payload summary",
        validationErrors: [],
        createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
        suggestionBatch: {
          mappingTraceId: "trace-1",
          contractId: "order-created-v1",
          contractVersion: "1.0.0",
          sourceSystem: "webhook-provider-a",
          promptVersion: "payload-mapper-v1",
          generatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
          overallConfidence: 0.8,
          driftCategories: ["renamed_field"],
          missingRequiredFields: [],
          ambiguousTargetFields: [],
          summary: "summary",
          suggestions: [
            {
              id: "s1",
              sourcePath: "$.id",
              targetField: "source.id",
              transformKind: "copy",
              confidence: 0.98,
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
      },
    ]);

    render(
      <MemoryRouter>
        <Intake />
      </MemoryRouter>,
    );

    expect(apiMocks.getIntakeSuggestions).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Intake mapping")).toBeTruthy();
  });

  it("submits a new mapping suggestion", async () => {
    const user = userEvent.setup();
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([]);
    apiMocks.createIntakeSuggestion.mockResolvedValueOnce({
      intakeAttemptId: "attempt-2",
      mappingTraceId: "trace-2",
      contractId: "order-created-v1",
      contractVersion: "1.0.0",
      sourceSystem: "webhook-provider-a",
      sourceKind: "inline_payload",
      sourceHash: "hash-2",
      deliveryTarget: { queueId: "queue-1" },
      status: "pending_review",
      ingestStatus: "not_started",
      driftCategory: "renamed_field",
      modelName: "gpt-test",
      promptVersion: "payload-mapper-v1",
      overallConfidence: 0.71,
      redactedSummary: "New summary",
      validationErrors: [],
      createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    });

    render(
      <MemoryRouter>
        <Intake />
      </MemoryRouter>,
    );

    const sourceSystemInput = await screen.findByPlaceholderText("Source system");
    await user.clear(sourceSystemInput);
    await user.type(sourceSystemInput, "source-system-1");

    const contractIdInput = screen.getByPlaceholderText("Contract ID");
    await user.clear(contractIdInput);
    await user.type(contractIdInput, "contract-1");

    const payloadInput = screen.getByPlaceholderText('{ "customerId": "abc", "status": "created" }');
    await user.clear(payloadInput);
    fireEvent.change(payloadInput, {
      target: { value: '{"customerId":"abc"}' },
    });

    const submit = screen.getByRole("button", { name: "Generate mapping suggestions" });
    await user.click(submit);

    expect(apiMocks.createIntakeSuggestion).toHaveBeenCalledWith({
      sourceSystem: "source-system-1",
      contractId: "contract-1",
      payload: { customerId: "abc" },
      fixtureId: undefined,
      queueId: undefined,
      topicId: undefined,
    });
  });
});
