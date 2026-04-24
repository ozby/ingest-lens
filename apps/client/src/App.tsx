import { Toaster, Sonner } from "@repo/ui/components";
import { TooltipProvider } from "@repo/ui/components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./context/AuthContext";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Queues from "./pages/Queues";
import QueueDetail from "./pages/QueueDetail";
import Topics from "./pages/Topics";
import TopicDetail from "./pages/TopicDetail";
import NotFound from "./pages/NotFound";
import Metrics from "./pages/Metrics";
import Intake from "./pages/Intake";
import AdminIntake from "./pages/AdminIntake";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />

            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/metrics"
              element={
                <RequireAuth>
                  <Metrics />
                </RequireAuth>
              }
            />

            <Route
              path="/queues"
              element={
                <RequireAuth>
                  <Queues />
                </RequireAuth>
              }
            />

            <Route
              path="/queues/:id"
              element={
                <RequireAuth>
                  <QueueDetail />
                </RequireAuth>
              }
            />

            <Route
              path="/topics"
              element={
                <RequireAuth>
                  <Topics />
                </RequireAuth>
              }
            />

            <Route
              path="/topics/:id"
              element={
                <RequireAuth>
                  <TopicDetail />
                </RequireAuth>
              }
            />

            <Route
              path="/intake"
              element={
                <RequireAuth>
                  <Intake />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/intake"
              element={
                <RequireAuth>
                  <AdminIntake />
                </RequireAuth>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
