import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateIntakeSuggestionRequest, IntakeAttemptRecord } from "@repo/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@repo/ui/components";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import MappingSuggestionReview from "@/components/MappingSuggestionReview";
import apiService from "@/services/api";

const MANUAL_PAYLOAD_TEMPLATE = '{\n  "title": "Demo job posting"\n}';

const toPreviewText = (text: string) => {
  if (!text) return "No sanitized payload preview available.";
  if (text.length <= 600) return text;
  return `${text.slice(0, 597)}...`;
};

type PublicFixtureMetadata = {
  id: string;
  sourceSystem: string;
  sourceUrl: string;
  summary: string;
  contractHint?: string;
};

const formatDeliveryTarget = (attempt: IntakeAttemptRecord) => {
  if (attempt.deliveryTarget.queueId) {
    return `queue:${attempt.deliveryTarget.queueId}`;
  }

  if (attempt.deliveryTarget.topicId) {
    return `topic:${attempt.deliveryTarget.topicId}`;
  }

  return "not set";
};

const Intake = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attempts, setAttempts] = useState<IntakeAttemptRecord[]>([]);
  const [fixtures, setFixtures] = useState<PublicFixtureMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFixturesLoading, setIsFixturesLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFixture, setIsLoadingFixture] = useState(false);

  const [sourceSystem, setSourceSystem] = useState("manual");
  const [contractId, setContractId] = useState("job-posting-v1");
  const [payloadInput, setPayloadInput] = useState(MANUAL_PAYLOAD_TEMPLATE);
  const [fixtureId, setFixtureId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [topicId, setTopicId] = useState("");

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === fixtureId),
    [fixtureId, fixtures],
  );

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        setIsLoading(true);
        const items = await apiService.getIntakeSuggestions();
        setAttempts(items);
      } catch (error) {
        console.error("Failed to load intake attempts", error);
        toast.error("Failed to load intake attempts");
      } finally {
        setIsLoading(false);
      }
    };

    const fetchFixtures = async () => {
      try {
        setIsFixturesLoading(true);
        const items = await apiService.getPublicFixtures();
        setFixtures(items);
      } catch (error) {
        console.error("Failed to load public fixtures", error);
        toast.error("Failed to load public fixtures");
      } finally {
        setIsFixturesLoading(false);
      }
    };

    void fetchAttempts();
    void fetchFixtures();
    const interval = window.setInterval(() => {
      void fetchAttempts();
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const handleFixtureChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value;
    setFixtureId(selected);

    if (!selected) {
      setSourceSystem("manual");
      setContractId("job-posting-v1");
      setPayloadInput(MANUAL_PAYLOAD_TEMPLATE);
      return;
    }

    const fixture = fixtures.find((candidate) => candidate.id === selected);
    if (fixture?.contractHint) {
      setContractId(fixture.contractHint);
    }

    try {
      setIsLoadingFixture(true);
      const detail = await apiService.getPublicFixtureById(selected);
      setSourceSystem(detail.sourceSystem);
      setPayloadInput(JSON.stringify(detail.payload, null, 2));
      if (detail.contractHint) {
        setContractId(detail.contractHint);
      }
    } catch (error) {
      console.error("Failed to load fixture", error);
      toast.error("Failed to load fixture payload");
    } finally {
      setIsLoadingFixture(false);
    }
  };

  const handleCreateSuggestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let parsedPayload: unknown;
    if (!fixtureId) {
      try {
        parsedPayload = JSON.parse(payloadInput);
      } catch {
        toast.error("Payload must be valid JSON");
        return;
      }
    }

    const request: CreateIntakeSuggestionRequest = {
      sourceSystem,
      contractId,
      payload: fixtureId ? undefined : parsedPayload,
      fixtureId: fixtureId || undefined,
      queueId: queueId || undefined,
      topicId: topicId || undefined,
    };

    try {
      setIsSubmitting(true);
      const created = await apiService.createIntakeSuggestion(request);
      setAttempts((current) => [created, ...current]);
      toast.success("Mapping suggestion created");
    } catch (error) {
      console.error("Failed to create mapping suggestion", error);
      toast.error("Failed to create mapping suggestion");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <main className="pt-16 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="mb-1 text-3xl font-bold">Intake mapping</h1>
            <p className="text-muted-foreground">
              Reuse the intake review flow with pinned public ATS fixtures or manual JSON before
              anything is ingested.
            </p>
          </div>

          <Tabs defaultValue="new">
            <TabsList className="mb-6">
              <TabsTrigger value="new">New suggestion</TabsTrigger>
              <TabsTrigger value="history">Review history</TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Create intake suggestion</CardTitle>
                  <CardDescription>
                    Start from the pinned public fixture catalog or paste a sanitized payload
                    manually, then target a queue or topic.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateSuggestion} className="space-y-4">
                    <label htmlFor="fixture-select" className="text-sm font-medium">
                      Public fixture (optional)
                    </label>
                    <select
                      id="fixture-select"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      value={fixtureId}
                      onChange={handleFixtureChange}
                      disabled={isLoadingFixture}
                    >
                      <option value="">Manual JSON entry</option>
                      {isFixturesLoading ? (
                        <option value="">Loading fixtures...</option>
                      ) : (
                        fixtures.map((fixture) => (
                          <option key={fixture.id} value={fixture.id}>
                            {fixture.id} · {fixture.sourceSystem}
                          </option>
                        ))
                      )}
                    </select>

                    {selectedFixture ? (
                      <div className="rounded-md border bg-slate-50 p-3 text-sm dark:bg-slate-900/60">
                        <p className="font-medium">{selectedFixture.summary}</p>
                        <p className="text-muted-foreground">
                          Fixture: {selectedFixture.id} · schema {selectedFixture.contractHint}
                        </p>
                        <a
                          href={selectedFixture.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Source provenance
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Deterministic demo mode uses pinned public ATS fixtures; manual entry stays
                        available for local experimentation.
                      </p>
                    )}

                    <Input
                      value={sourceSystem}
                      onChange={(event) => setSourceSystem(event.target.value)}
                      placeholder="Source system"
                      readOnly={Boolean(fixtureId)}
                    />
                    <Input
                      value={contractId}
                      onChange={(event) => setContractId(event.target.value)}
                      placeholder="Contract ID"
                    />
                    <Textarea
                      value={payloadInput}
                      onChange={(event) => setPayloadInput(event.target.value)}
                      className="h-40 font-mono"
                      placeholder='{ "customerId": "abc", "status": "created" }'
                      readOnly={Boolean(fixtureId)}
                    />
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input
                        value={queueId}
                        onChange={(event) => setQueueId(event.target.value)}
                        placeholder="Queue ID (optional)"
                      />
                      <Input
                        value={topicId}
                        onChange={(event) => setTopicId(event.target.value)}
                        placeholder="Topic ID (optional)"
                      />
                    </div>
                    <Button type="submit" disabled={isSubmitting || isLoadingFixture}>
                      {isSubmitting ? "Submitting..." : "Generate mapping suggestions"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Attempt history</CardTitle>
                  <CardDescription>
                    Mapping trace, confidence, ingest status, and delivery target stay visible
                    through review and approval.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <p>Loading intake attempts...</p>
                  ) : attempts.length === 0 ? (
                    <p>No intake attempts yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {attempts.map((attempt) => (
                        <Card key={attempt.intakeAttemptId} className="border">
                          <CardHeader>
                            <CardTitle className="text-lg">{attempt.intakeAttemptId}</CardTitle>
                            <CardDescription>
                              Contract {attempt.contractId} · status {attempt.status} · ingest{" "}
                              {attempt.ingestStatus}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                              <p>mappingTraceId: {attempt.mappingTraceId}</p>
                              <p>Confidence: {Math.round(attempt.overallConfidence * 100)}%</p>
                              <p>Delivery: {formatDeliveryTarget(attempt)}</p>
                              <p>
                                Source: {attempt.sourceSystem}
                                {attempt.sourceFixtureId ? ` · ${attempt.sourceFixtureId}` : ""}
                              </p>
                            </div>

                            <p className="text-sm text-muted-foreground">
                              Sanitized payload preview
                            </p>
                            <pre className="whitespace-pre-wrap rounded bg-slate-100 p-3 text-xs dark:bg-slate-900">
                              {toPreviewText(attempt.redactedSummary)}
                            </pre>
                            {attempt.suggestionBatch?.suggestions ? (
                              <div className="space-y-2">
                                {attempt.suggestionBatch.suggestions.map((suggestion) => (
                                  <MappingSuggestionReview
                                    key={suggestion.id}
                                    suggestion={suggestion}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No reviewable suggestions were generated for this attempt.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Intake;
