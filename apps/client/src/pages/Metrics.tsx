import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import apiService from "@/services/api";
import { IServerMetrics } from "@repo/types";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import ServerMetricsComponent from "@/components/ServerMetrics";
import { toast } from "sonner";

const Metrics = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [serverMetrics, setServerMetrics] = useState<IServerMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetricsData = async () => {
      try {
        setIsLoading(true);
        const serverMetricsData = await apiService.getServerMetrics();
        setServerMetrics(serverMetricsData);
      } catch (error) {
        console.error("Failed to fetch metrics data", error);
        toast.error("Failed to load metrics data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetricsData();
    const intervalId = setInterval(fetchMetricsData, 30000); // Refresh every 30 seconds

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

      <main className="pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-3xl font-bold mb-1">System Metrics</h1>
              <p className="text-muted-foreground">
                Monitor the performance of your message queuing system
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="animate-pulse space-y-6">
              <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded"></div>
            </div>
          ) : serverMetrics ? (
            <ServerMetricsComponent metrics={serverMetrics} />
          ) : (
            <div className="text-center py-12">
              <Activity className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No metrics available</h2>
              <p className="text-muted-foreground">
                Could not retrieve system metrics at this time
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Metrics;
