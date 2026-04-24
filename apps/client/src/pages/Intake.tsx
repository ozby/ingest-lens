import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { CreateIntakeSuggestionRequest, IntakeAttemptRecord } from "@repo/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea, 
  Tabs, TabsList, TabsContent, TabsTrigger } from "@repo/ui/components";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import MappingSuggestionReview from "@/components/MappingSuggestionReview";
import apiService from "@/services/api";

const toPreviewText = (text: string) => {
  if (!text) return "No sanitized payload preview available.";
  if (text.length <= 600) return text;
  return `${text.slice(0, 597)}...`;
};

const Intake = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attempts, setAttempts] = useState<IntakeAttemptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sourceSystem, setSourceSystem] = useState("webhook-provider-a");
  const [contractId, setContractId] = useState("order-created-v1");
  const [payloadInput, setPayloadInput] = useState('{"source": "demo"}');
  const [fixtureId, setFixtureId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [topicId, setTopicId] = useState("");

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

    fetchAttempts();
    const interval = window.setInterval(fetchAttempts, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const handleCreateSuggestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let parsedPayload: unknown = null;
    try {
      parsedPayload = JSON.parse(payloadInput);
    } catch {
      toast.error("Payload must be valid JSON");
      return;
    }

    const request: CreateIntakeSuggestionRequest = {
      sourceSystem,
      contractId,
      payload: parsedPayload,
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
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-1">Intake mapping</h1>
            <p className="text-muted-foreground">
              Submit payloads for AI-assisted mapping suggestion and review before publish.
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
                    Paste a sanitized source payload and target it to a queue or topic.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateSuggestion} className="space-y-4">
                    <Input
                      value={sourceSystem}
                      onChange={(event) => setSourceSystem(event.target.value)}
                      placeholder="Source system"
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
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        value={fixtureId}
                        onChange={(event) => setFixtureId(event.target.value)}
                        placeholder="Fixture ID (optional)"
                      />
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
                    <Button type="submit" disabled={isSubmitting}>
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
                    Last suggestions with sanitized payload preview and mapping details.
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
                              Contract {attempt.contractId} · status {attempt.status} · ingest {attempt.ingestStatus}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">Sanitized payload preview</p>
                            <pre className="whitespace-pre-wrap rounded bg-slate-100 dark:bg-slate-900 p-3 text-xs">
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
