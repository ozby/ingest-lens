import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import Intake from "./Intake";

const apiMocks = vi.hoisted(() => ({
  createIntakeSuggestion: vi.fn(),
  getIntakeSuggestions: vi.fn(),
  getPublicFixtures: vi.fn(),
  getPublicFixtureById: vi.fn(),
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
    apiMocks.getPublicFixtures.mockResolvedValueOnce([
      {
        id: "ashby-job-001",
        sourceSystem: "ashby",
        sourceUrl: "https://example.com/ashby",
        summary: "Staff Software Engineer sample",
        contractHint: "job-posting-v1",
      },
    ]);

    render(
      <MemoryRouter>
        <Intake />
      </MemoryRouter>,
    );

    expect(apiMocks.getIntakeSuggestions).toHaveBeenCalledTimes(1);
    expect(apiMocks.getPublicFixtures).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Intake mapping")).toBeTruthy();
  });

  it("submits a new mapping suggestion", async () => {
    const user = userEvent.setup();
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([]);
    apiMocks.getPublicFixtures.mockResolvedValueOnce([]);
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

    const payloadInput = screen.getByPlaceholderText(
      '{ "customerId": "abc", "status": "created" }',
    );
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

  it("loads fixture catalog and prefills payload from selected fixture", async () => {
    const user = userEvent.setup();
    apiMocks.getIntakeSuggestions.mockResolvedValueOnce([]);
    apiMocks.getPublicFixtures.mockResolvedValueOnce([
      {
        id: "ashby-job-001",
        sourceSystem: "ashby",
        sourceUrl: "https://example.com/ashby",
        summary: "Staff Software Engineer sample",
        contractHint: "job-posting-v1",
      },
    ]);
    apiMocks.getPublicFixtureById.mockResolvedValueOnce({
      id: "ashby-job-001",
      sourceSystem: "ashby",
      sourceUrl: "https://example.com/ashby",
      contractHint: "job-posting-v1",
      payload: { title: "Staff Engineer" },
    });
    apiMocks.createIntakeSuggestion.mockResolvedValueOnce({
      intakeAttemptId: "attempt-3",
      mappingTraceId: "trace-3",
      contractId: "job-posting-v1",
      contractVersion: "v1",
      sourceSystem: "ashby",
      sourceKind: "fixture_reference",
      sourceHash: "hash-3",
      deliveryTarget: { queueId: "queue-1" },
      status: "pending_review",
      ingestStatus: "not_started",
      driftCategory: "renamed_field",
      modelName: "gpt-test",
      promptVersion: "payload-mapper-v1",
      overallConfidence: 0.72,
      redactedSummary: "Fixture summary",
      validationErrors: [],
      createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    });

    render(
      <MemoryRouter>
        <Intake />
      </MemoryRouter>,
    );

    const fixtureSelect = await screen.findByLabelText("Public fixture (optional)");
    await user.selectOptions(fixtureSelect, "ashby-job-001");

    expect(apiMocks.getPublicFixtureById).toHaveBeenCalledWith("ashby-job-001");

    const payloadInput = screen.getByPlaceholderText(
      '{ "customerId": "abc", "status": "created" }',
    );
    expect((payloadInput as HTMLTextAreaElement).value).toBe('{\n  "title": "Staff Engineer"\n}');

    const sourceSystemInput = screen.getByPlaceholderText("Source system");
    expect((sourceSystemInput as HTMLInputElement).value).toBe("ashby");

    const submit = screen.getByRole("button", { name: "Generate mapping suggestions" });
    await user.click(submit);

    expect(apiMocks.createIntakeSuggestion).toHaveBeenCalledWith({
      sourceSystem: "ashby",
      contractId: "job-posting-v1",
      payload: undefined,
      fixtureId: "ashby-job-001",
      queueId: undefined,
      topicId: undefined,
    });
  });
});
