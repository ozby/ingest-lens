import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IntakeAttemptRecord, MappingSuggestion } from "@repo/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
} from "@repo/ui/components";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import MappingSuggestionReview from "@/components/MappingSuggestionReview";
import apiService from "@/services/api";

type SelectedSuggestionMap = Record<string, string[]>;

type RejectionReasonMap = Record<string, string>;

const statusTone: Record<IntakeAttemptRecord["status"], string> = {
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  abstained: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  invalid_output: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  runtime_failure: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ingested: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  ingest_failed: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

const toPreviewText = (value: string) =>
  value ? value.slice(0, 500) : "No sanitized payload preview available.";

const formatDeliveryTarget = (attempt: IntakeAttemptRecord) => {
  if (attempt.deliveryTarget.queueId) {
    return `queue:${attempt.deliveryTarget.queueId}`;
  }

  if (attempt.deliveryTarget.topicId) {
    return `topic:${attempt.deliveryTarget.topicId}`;
  }

  return "not set";
};

const AdminIntake = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attempts, setAttempts] = useState<IntakeAttemptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSuggestions, setSelectedSuggestions] = useState<SelectedSuggestionMap>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReasonMap>({});

  const statusPending = useMemo(
    () =>
      attempts
        .filter(
          (attempt) =>
            attempt.status === "pending_review" ||
            attempt.status === "approved" ||
            attempt.status === "ingested",
        )
        .sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
    [attempts],
  );

  const fetchAttempts = async () => {
    try {
      setIsLoading(true);
      const items = await apiService.getIntakeSuggestions();
      setAttempts(items);
      setSelectedSuggestions({});
    } catch (error) {
      console.error("Failed to load pending intake attempts", error);
      toast.error("Failed to load intake review queue");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
    const interval = window.setInterval(fetchAttempts, 20000);
    return () => window.clearInterval(interval);
  }, []);

  const updateSelection = (attemptId: string, suggestionId: string, checked: boolean) => {
    setSelectedSuggestions((state) => {
      const current = state[attemptId] ?? [];
      if (checked) {
        return {
          ...state,
          [attemptId]: Array.from(new Set([...current, suggestionId])),
        };
      }

      const next = current.filter((id) => id !== suggestionId);
      return { ...state, [attemptId]: next };
    });
  };

  const handleApprove = async (attempt: IntakeAttemptRecord) => {
    const approvedSuggestionIds = selectedSuggestions[attempt.intakeAttemptId] ?? [];
    if (approvedSuggestionIds.length === 0) {
      toast.error("Select at least one suggestion to approve");
      return;
    }

    if (!attempt.suggestionBatch) {
      toast.error("Attempt has no reviewable suggestions");
      return;
    }

    try {
      setActingId(attempt.intakeAttemptId);
      const approval = await apiService.approveIntakeSuggestion(attempt.intakeAttemptId, {
        approvedSuggestionIds,
      });

      setAttempts((current) =>
        current.map((item) =>
          item.intakeAttemptId === approval.attempt.intakeAttemptId ? approval.attempt : item,
        ),
      );
      toast.success(`Approved mapping ${approval.mappingVersion.mappingVersionId}`);
      toast.success(`Ingest status: ${approval.attempt.ingestStatus}`);
    } catch (error) {
      console.error("Failed to approve mapping", error);
      toast.error("Failed to approve mapping suggestion");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (event: FormEvent<HTMLFormElement>, attempt: IntakeAttemptRecord) => {
    event.preventDefault();
    const reason = rejectionReasons[attempt.intakeAttemptId]?.trim();

    if (!reason) {
      toast.error("Provide a rejection reason");
      return;
    }

    try {
      setActingId(attempt.intakeAttemptId);
      const updated = await apiService.rejectIntakeSuggestion(attempt.intakeAttemptId, {
        reason,
      });
      setAttempts((current) =>
        current.map((item) => (item.intakeAttemptId === updated.intakeAttemptId ? updated : item)),
      );
      toast.success("Attempt rejected");
    } catch (error) {
      console.error("Failed to reject mapping", error);
      toast.error("Failed to reject mapping suggestion");
    } finally {
      setActingId(null);
    }
  };

  const renderReviewPanel = (attempt: IntakeAttemptRecord) => {
    if (!attempt.suggestionBatch) {
      return <p className="text-sm text-muted-foreground">No suggestion batch available.</p>;
    }

    return (
      <div className="space-y-3">
        {attempt.suggestionBatch.suggestions.map((suggestion: MappingSuggestion) => (
          <MappingSuggestionReview
            key={suggestion.id}
            suggestion={suggestion}
            checked={(selectedSuggestions[attempt.intakeAttemptId] ?? []).includes(suggestion.id)}
            disabled={actingId === attempt.intakeAttemptId}
            onToggle={(suggestionId, selected) =>
              updateSelection(attempt.intakeAttemptId, suggestionId, selected)
            }
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <main className="pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-1">Intake admin review</h1>
            <p className="text-muted-foreground">
              Review AI-generated mapping suggestions, approve/reject, and confirm ingest status.
            </p>
          </div>

          {isLoading ? (
            <p>Loading admin intake review queue...</p>
          ) : statusPending.length === 0 ? (
            <p>No pending review attempts.</p>
          ) : (
            <div className="space-y-4">
              {statusPending.map((attempt) => (
                <Card key={attempt.intakeAttemptId}>
                  <CardHeader>
                    <div className="flex flex-col gap-2">
                      <CardTitle className="text-lg">{attempt.intakeAttemptId}</CardTitle>
                      <CardDescription>
                        Contract: {attempt.contractId} · {attempt.contractVersion}
                      </CardDescription>
                      <div className="text-xs">
                        <Badge className={statusTone[attempt.status]}>{attempt.status}</Badge>
                        <span className="ml-2">Ingest: {attempt.ingestStatus}</span>
                        <span className="ml-2">mappingTraceId: {attempt.mappingTraceId}</span>
                        <span className="ml-2">
                          Confidence: {Math.round(attempt.overallConfidence * 100)}%
                        </span>
                        <span className="ml-2">Delivery: {formatDeliveryTarget(attempt)}</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Sanitized payload preview</p>
                      <pre className="whitespace-pre-wrap rounded bg-slate-100 dark:bg-slate-900 p-3 text-xs">
                        {toPreviewText(attempt.redactedSummary)}
                      </pre>
                    </div>

                    {renderReviewPanel(attempt)}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Button
                        onClick={() => handleApprove(attempt)}
                        disabled={
                          actingId === attempt.intakeAttemptId ||
                          (selectedSuggestions[attempt.intakeAttemptId] ?? []).length === 0
                        }
                      >
                        {actingId === attempt.intakeAttemptId ? "Approving..." : "Approve selected"}
                      </Button>

                      <form
                        className="flex-1 flex gap-2"
                        onSubmit={(event) => handleReject(event, attempt)}
                      >
                        <Textarea
                          className="h-11"
                          placeholder="Rejection reason"
                          value={rejectionReasons[attempt.intakeAttemptId] ?? ""}
                          onChange={(event) =>
                            setRejectionReasons((state) => ({
                              ...state,
                              [attempt.intakeAttemptId]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          type="submit"
                          variant="destructive"
                          disabled={actingId === attempt.intakeAttemptId}
                        >
                          {actingId === attempt.intakeAttemptId ? "Rejecting..." : "Reject"}
                        </Button>
                      </form>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminIntake;
