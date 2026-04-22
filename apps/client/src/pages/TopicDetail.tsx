import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiService from "@/services/api";
import { PublishTopicRequest, SubscribeTopicRequest } from "@repo/types";
import { ITopic, IQueue } from "@repo/types";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@repo/ui/components";
import { Button } from "@repo/ui/components";
import { Textarea } from "@repo/ui/components";
import { ArrowLeft, Hash, Link2, SendHorizontal, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components";
import { toast } from "sonner";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components";
import { Badge } from "@repo/ui/components";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components";
import { Label } from "@repo/ui/components";

const TopicDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topic, setTopic] = useState<ITopic | null>(null);
  const [queues, setQueues] = useState<IQueue[]>([]);
  const [availableQueues, setAvailableQueues] = useState<IQueue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [publishData, setPublishData] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedQueueId, setSelectedQueueId] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    const fetchTopicData = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        const [topicData, queuesData] = await Promise.all([
          apiService.getTopic(id),
          apiService.getQueues(),
        ]);
        setTopic(topicData);
        setQueues(queuesData);

        // Filter out already subscribed queues
        const available = queuesData.filter(
          (queue) => !topicData.subscribedQueues.includes(queue.id),
        );
        setAvailableQueues(available);

        // Set default selected queue if available
        if (available.length > 0) {
          setSelectedQueueId(available[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch topic data", error);
        toast.error("Failed to load topic details");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopicData();
  }, [id]);

  const handleDeleteTopic = async () => {
    // Note: The API doesn't actually provide a deleteTopic endpoint in the spec,
    // so this is just a placeholder
    if (!id) return;

    try {
      setIsDeleting(true);
      // Simulating delete operation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Topic deleted successfully");
      navigate("/topics");
    } catch (error) {
      console.error("Failed to delete topic", error);
      toast.error("Failed to delete topic");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handlePublish = async () => {
    if (!id || !publishData.trim()) return;

    try {
      setIsPublishing(true);

      let parsedData;
      try {
        parsedData = JSON.parse(publishData);
      } catch (error) {
        console.error("Invalid JSON format", error);
        toast.error("Invalid JSON format");
        return;
      }

      const payload: PublishTopicRequest = { data: parsedData };
      await apiService.publishToTopic(id, payload);
      toast.success("Message published successfully");
      setPublishData("");
    } catch (error) {
      console.error("Failed to publish message", error);
      toast.error("Failed to publish message");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSubscribe = async () => {
    if (!id || !selectedQueueId) return;

    try {
      setIsSubscribing(true);
      const payload: SubscribeTopicRequest = { queueId: selectedQueueId };
      const updatedTopic = await apiService.subscribeTopic(id, payload);
      setTopic(updatedTopic);

      // Update available queues
      setAvailableQueues(availableQueues.filter((q) => q.id !== selectedQueueId));

      // Reset selection if possible
      if (availableQueues.length > 1) {
        const nextAvailable = availableQueues.find((q) => q.id !== selectedQueueId);
        if (nextAvailable) {
          setSelectedQueueId(nextAvailable.id);
        } else {
          setSelectedQueueId("");
        }
      } else {
        setSelectedQueueId("");
      }

      toast.success("Queue subscribed successfully");
    } catch (error) {
      console.error("Failed to subscribe queue", error);
      toast.error("Failed to subscribe queue");
    } finally {
      setIsSubscribing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="pt-16 lg:pl-64">
          <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="pt-16 lg:pl-64">
          <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Topic not found or you don't have permission to view it.
              </AlertDescription>
            </Alert>
            <div className="mt-6">
              <Button asChild>
                <Link to="/topics">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Topics
                </Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <main className="pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="mb-4 sm:mb-0">
              <Button asChild variant="ghost" size="sm" className="mb-2">
                <Link to="/topics">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Topics
                </Link>
              </Button>
              <h1 className="text-3xl font-bold mb-1">{topic.name}</h1>
              <div className="flex items-center text-muted-foreground">
                <span>Created on {format(new Date(topic.createdAt), "MMM d, yyyy")}</span>
                <span className="mx-2">•</span>
                <Badge variant="outline">
                  {topic.subscribedQueues.length} subscribed{" "}
                  {topic.subscribedQueues.length === 1 ? "queue" : "queues"}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Topic
              </Button>
            </div>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="publish">Publish</TabsTrigger>
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader>
                  <CardTitle>Topic Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Topic ID</h4>
                        <p className="font-mono text-sm">{topic.id}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Owner ID</h4>
                        <p className="font-mono text-sm">{topic.ownerId}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Created</h4>
                        <p>{format(new Date(topic.createdAt), "PPpp")}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">
                          Subscribed Queues
                        </h4>
                        <p>{topic.subscribedQueues.length}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subscribed Queues</CardTitle>
                </CardHeader>
                <CardContent>
                  {topic.subscribedQueues.length === 0 ? (
                    <div className="text-center py-6">
                      <Hash className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Subscribed Queues</h3>
                      <p className="text-muted-foreground text-center mb-4">
                        This topic doesn't have any subscribed queues yet.
                      </p>
                      <Button onClick={() => document.getElementById("subscriptions-tab")?.click()}>
                        Add Subscription
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {topic.subscribedQueues.map((queueId) => {
                        const queue = queues.find((q) => q.id === queueId);
                        return (
                          <div key={queueId} className="py-3 flex items-center justify-between">
                            <div className="flex items-center">
                              <Link2 className="h-4 w-4 text-muted-foreground mr-2" />
                              <div>
                                <p className="font-medium">{queue?.name || "Unknown Queue"}</p>
                                <p className="text-xs text-muted-foreground font-mono">{queueId}</p>
                              </div>
                            </div>
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/queues/${queueId}`}>View Queue</Link>
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="publish" className="animate-fade-in">
              <Card>
                <CardHeader>
                  <CardTitle>Publish Message</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Publish a message to this topic. The message will be delivered to all subscribed
                    queues.
                  </p>
                  <Textarea
                    placeholder='{"example": "Enter your JSON message here"}'
                    className="font-mono resize-y h-32"
                    value={publishData}
                    onChange={(e) => setPublishData(e.target.value)}
                  />
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handlePublish} disabled={isPublishing || !publishData.trim()}>
                    <SendHorizontal className="mr-2 h-4 w-4" />
                    {isPublishing ? "Publishing..." : "Publish Message"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="subscriptions" id="subscriptions-tab" className="animate-fade-in">
              <Card>
                <CardHeader>
                  <CardTitle>Manage Subscriptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Add Subscription</h3>

                      {availableQueues.length === 0 ? (
                        <Alert>
                          <AlertTitle>No available queues</AlertTitle>
                          <AlertDescription>
                            There are no queues available to subscribe or all queues are already
                            subscribed to this topic.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="queue-select">Select Queue</Label>
                            <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                              <SelectTrigger id="queue-select">
                                <SelectValue placeholder="Select a queue" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableQueues.map((queue) => (
                                  <SelectItem key={queue.id} value={queue.id}>
                                    {queue.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            onClick={handleSubscribe}
                            disabled={isSubscribing || !selectedQueueId}
                          >
                            {isSubscribing ? "Subscribing..." : "Subscribe Queue"}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-6">
                      <h3 className="text-lg font-medium mb-4">Current Subscriptions</h3>

                      {topic.subscribedQueues.length === 0 ? (
                        <p className="text-muted-foreground">
                          No queues are currently subscribed to this topic.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {topic.subscribedQueues.map((queueId) => {
                            const queue = queues.find((q) => q.id === queueId);
                            return (
                              <div
                                key={queueId}
                                className="flex items-center justify-between border-b pb-3"
                              >
                                <div>
                                  <p className="font-medium">{queue?.name || "Unknown Queue"}</p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {queueId}
                                  </p>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                  <Link to={`/queues/${queueId}`}>View</Link>
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Topic</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the topic "{topic.name}"? This action cannot be undone
              and will remove all subscriptions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTopic} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Topic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TopicDetail;
