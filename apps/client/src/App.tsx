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

const routeLoadingFallback = <div aria-live="polite">Loading route…</div>;

const toasterClassNames = {
  toast:
    "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
  description: "group-[.toast]:text-muted-foreground",
  actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
  cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
} as const;

function App() {
  return (
    <>
      <Toaster
        theme="system"
        className="toaster group"
        toastOptions={{ classNames: toasterClassNames }}
      />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
