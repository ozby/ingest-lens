import React, { useState, useEffect } from "react";
import { IServerMetrics } from "@repo/types";
import { Activity, Clock, MailCheck, Server, XCircle } from "lucide-react";
import MetricsCard from "./MetricsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components";
import { formatDistanceToNow } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import apiService from "@/services/api";
import { toast } from "sonner";
import { IActivityDataPoint } from "@repo/types";

interface ServerMetricsComponentProps {
  metrics: IServerMetrics;
}

const ServerMetricsComponent: React.FC<ServerMetricsComponentProps> = ({ metrics }) => {
  const [activityData, setActivityData] = useState<IActivityDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivityData = async () => {
      try {
        setIsLoading(true);
        // If activityHistory is already included in metrics, use that
        if (metrics.activityHistory && metrics.activityHistory.length > 0) {
          setActivityData(metrics.activityHistory);
        } else {
          // Otherwise make a separate API call for activity data
          const historyData = await apiService.getServerActivityHistory();
          setActivityData(historyData || []);
        }
      } catch (error) {
        console.error("Failed to fetch activity data", error);
        toast.error("Failed to load system activity data");
        // Fallback to empty array if fetch fails
        setActivityData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivityData();
  }, [metrics]);

  const chartData = React.useMemo(() => {
    if (activityData.length > 0) return activityData;

    const data = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const time = new Date(now);
      time.setHours(now.getHours() - i);

      data.push({
        time: time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        requests: 0,
        messages: 0,
        errors: 0,
      });
    }

    return data;
  }, [activityData]);
  const isSyntheticActivity = chartData.length > 0 && activityData.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard
          title="Total Requests"
          value={metrics.totalRequests.toLocaleString()}
          icon={Activity}
        />
        <MetricsCard
          title="Active Connections"
          value={metrics.activeConnections}
          icon={Server}
          iconColor="text-blue-500"
        />
        <MetricsCard
          title="Messages Processed"
          value={metrics.messagesProcessed.toLocaleString()}
          icon={MailCheck}
          iconColor="text-green-500"
        />
        <MetricsCard
          title="Error Count"
          value={metrics.errorCount}
          icon={XCircle}
          iconColor="text-red-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">System Activity</CardTitle>
            {isLoading && <p className="text-sm text-muted-foreground">Loading activity data...</p>}
            {isSyntheticActivity ? (
              <p className="text-sm text-amber-700" role="note">
                Demo sample activity shown until measured history is available.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground" role="note">
                Activity history is measured from the current dashboard payload.
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -10,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    stackId="2"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="errors"
                    stackId="3"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">System Info</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-100">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Uptime</div>
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(metrics.startTime), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-100">
                  <Activity className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Average Response Time</div>
                  <div className="text-sm text-muted-foreground">
                    {metrics.avgResponseTime.toFixed(2)} ms
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="text-sm font-medium mb-2">Activity Source</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
                  {isSyntheticActivity
                    ? "Demo sample derived in the client because the worker has no measured activity history yet."
                    : "Measured activity history from the worker response."}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ServerMetricsComponent;
