import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, RequireAuth } from "./context/AuthContext";

const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Queues = lazy(() => import("./pages/Queues"));
const QueueDetail = lazy(() => import("./pages/QueueDetail"));
const Topics = lazy(() => import("./pages/Topics"));
const TopicDetail = lazy(() => import("./pages/TopicDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Metrics = lazy(() => import("./pages/Metrics"));
const Intake = lazy(() => import("./pages/Intake"));
const AdminIntake = lazy(() => import("./pages/AdminIntake"));

const routeLoadingFallback = <div aria-live="polite">Loading route…</div>;

function App() {
  return (
    <>
      <Toaster theme="system" className="toaster group" />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={routeLoadingFallback}>
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
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
