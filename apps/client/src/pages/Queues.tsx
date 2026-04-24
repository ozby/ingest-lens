import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CreateQueueRequest } from "@repo/types";
import { IQueue, IQueueMetrics } from "@repo/types";
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
import { List, PlusCircle, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import QueueForm from "@/components/QueueForm";

const Queues = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [queues, setQueues] = useState<IQueue[]>([]);
  const [queueMetrics, setQueueMetrics] = useState<IQueueMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [queueToDelete, setQueueToDelete] = useState<IQueue | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchQueues = async () => {
      try {
        setIsLoading(true);
        const [queuesData, queueMetricsData] = await Promise.all([
          apiService.getQueues(),
          apiService.getAllQueueMetrics(),
        ]);
        setQueues(queuesData);
        setQueueMetrics(queueMetricsData);
      } catch (error) {
        console.error("Failed to fetch queues", error);
        toast.error("Failed to load queues");
      } finally {
        setIsLoading(false);
      }
    };

    fetchQueues();
  }, []);

  const handleCreateQueue = async (values: CreateQueueRequest) => {
    try {
      setIsCreating(true);
      const newQueue = await apiService.createQueue(values);
      setQueues([...queues, newQueue]);
      toast.success(`Queue "${values.name}" created successfully`);
    } catch (error) {
      console.error("Failed to create queue", error);
      toast.error("Failed to create queue");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteQueue = async () => {
    if (!queueToDelete) return;

    try {
      setIsDeleting(true);
      await apiService.deleteQueue(queueToDelete.id);
      setQueues(queues.filter((queue) => queue.id !== queueToDelete.id));
      toast.success(`Queue "${queueToDelete.name}" deleted`);
      setQueueToDelete(null);
    } catch (error) {
      console.error("Failed to delete queue", error);
      toast.error("Failed to delete queue");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredQueues = queues.filter((queue) =>
    queue.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getQueueMetrics = (queueId: string) => {
    return queueMetrics.find((metric) => metric.queueId === queueId);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <main className="pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-3xl font-bold mb-1">Delivery Queues</h1>
              <p className="text-muted-foreground">Manage the delivery rails that receive direct messages and retries.</p>
            </div>
            <QueueForm
              onSubmit={handleCreateQueue}
              isLoading={isCreating}
              trigger={
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Queue
                </Button>
              }
            />
          </div>

          <div className="mb-6 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search delivery queues..."
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
          ) : filteredQueues.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <List className="h-12 w-12 text-muted-foreground mb-4" />
                {searchTerm ? (
                  <>
                    <h3 className="text-lg font-medium mb-2">No matching queues</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      No queues found matching "{searchTerm}"
                    </p>
                    <Button variant="outline" onClick={() => setSearchTerm("")}>
                      Clear search
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium mb-2">No delivery queues yet</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Create a queue to receive direct messages and retries.
                    </p>
                    <QueueForm
                      onSubmit={handleCreateQueue}
                      isLoading={isCreating}
                      trigger={<Button>Create your first delivery queue</Button>}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQueues.map((queue) => {
                const metrics = getQueueMetrics(queue.id);
                return (
                  <Card key={queue.id} className="transition-all-200 hover:shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{queue.name}</CardTitle>
                      <CardDescription>
                        Created on {format(new Date(queue.createdAt), "MMM d, yyyy")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Messages:</span>
                          <span className="font-medium">{metrics?.messageCount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Retention:</span>
                          <span className="font-medium">{queue.retentionPeriod} days</span>
                        </div>
                        {queue.pushEndpoint && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Push endpoint:</span>
                            <span className="font-medium">Yes</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setQueueToDelete(queue)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button asChild variant="default" size="sm">
                        <Link to={`/queues/${queue.id}`}>View Details</Link>
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!queueToDelete} onOpenChange={(open) => !open && setQueueToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Queue</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the queue "{queueToDelete?.name}"? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueueToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteQueue} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Queues;
