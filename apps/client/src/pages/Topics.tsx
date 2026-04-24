import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CreateTopicRequest, SubscribeTopicRequest } from "@repo/types";
import { ITopic, IQueue } from "@repo/types";
import apiService from "@/services/api";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import { Button } from "@repo/ui/components";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components";
import { Input } from "@repo/ui/components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components";
import { Hash, PlusCircle, Search, Share2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@repo/ui/components";
import TopicForm from "@/components/TopicForm";

const Topics = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [topics, setTopics] = useState<ITopic[]>([]);
  const [queues, setQueues] = useState<IQueue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [topicToDelete, setTopicToDelete] = useState<ITopic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [topicsData, queuesData] = await Promise.all([
          apiService.getTopics(),
          apiService.getQueues(),
        ]);
        setTopics(topicsData);
        setQueues(queuesData);
      } catch (error) {
        console.error("Failed to fetch data", error);
        toast.error("Failed to load topics and queues");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCreateTopic = async (values: CreateTopicRequest, subscribers: string[]) => {
    try {
      setIsCreating(true);
      const newTopic = await apiService.createTopic(values);

      const subscribePromises = subscribers.map((queueId) => {
        const subscribeRequest: SubscribeTopicRequest = { queueId };
        return apiService.subscribeTopic(newTopic.id, subscribeRequest);
      });

      await Promise.all(subscribePromises);

      const updatedTopics = await apiService.getTopics();
      setTopics(updatedTopics);

      toast.success(`Topic "${values.name}" created with ${subscribers.length} subscribers`);
    } catch (error) {
      console.error("Failed to create topic or subscribe queues", error);
      toast.error("Failed to create topic or add subscribers");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!topicToDelete) return;

    try {
      setIsDeleting(true);
      await apiService.deleteTopic(topicToDelete.id);
      const updatedTopics = await apiService.getTopics();
      setTopics(updatedTopics);

      toast.success(`Topic "${topicToDelete.name}" deleted successfully`);
      setTopicToDelete(null);
    } catch (error) {
      console.error("Failed to delete topic", error);
      toast.error("Failed to delete topic");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTopics = topics.filter((topic) =>
    topic.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const availableQueues = queues.map((queue) => ({ id: queue.id, name: queue.name }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <main className="pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-3xl font-bold mb-1">Delivery Topics</h1>
              <p className="text-muted-foreground">Broadcast delivery events across subscribed delivery rails.</p>
            </div>
            <TopicForm
              onSubmit={handleCreateTopic}
              isLoading={isCreating}
              availableQueues={availableQueues}
              trigger={
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Topic
                </Button>
              }
            />
          </div>

          <div className="mb-6 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search delivery topics..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-2">
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <div className="h-9 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : filteredTopics.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Hash className="h-12 w-12 text-muted-foreground mb-4" />
                {searchTerm ? (
                  <>
                    <h3 className="text-lg font-medium mb-2">No matching topics</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      No topics found matching "{searchTerm}"
                    </p>
                    <Button variant="outline" onClick={() => setSearchTerm("")}>
                      Clear search
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium mb-2">No delivery topics yet</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Create a topic when one delivery event should fan out across multiple delivery queues.
                    </p>
                    <TopicForm
                      onSubmit={handleCreateTopic}
                      isLoading={isCreating}
                      availableQueues={availableQueues}
                      trigger={<Button>Create your first delivery topic</Button>}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTopics.map((topic) => (
                <Card key={topic.id} className="transition-all-200 hover:shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{topic.name}</CardTitle>
                    <CardDescription>
                      Created on {format(new Date(topic.createdAt), "MMM d, yyyy")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Subscribed Queues:</span>
                        <Badge variant="secondary">{topic.subscribedQueues.length}</Badge>
                      </div>

                      {topic.subscribedQueues.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {topic.subscribedQueues.slice(0, 3).map((queueId, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="flex items-center gap-1"
                            >
                              <Share2 className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">
                                {queueId.substring(0, 8)}...
                              </span>
                            </Badge>
                          ))}
                          {topic.subscribedQueues.length > 3 && (
                            <Badge variant="outline">
                              +{topic.subscribedQueues.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setTopicToDelete(topic)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="default" size="sm">
                      <Link to={`/topics/${topic.id}`}>View Details</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!topicToDelete} onOpenChange={(open) => !open && setTopicToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Topic</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the topic "{topicToDelete?.name}"? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopicToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTopic} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Topics;
