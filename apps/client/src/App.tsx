import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import {
  createBrowserRouter,
  createRoutesStub,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, RequireAuth } from "./context/AuthContext";

// The intersection of what createBrowserRouter and createRoutesStub both accept:
// Component-based routes with optional children. By returning this narrow shape
// from createAppRoutes, prod and test share one route definition with no
// structural widening or casts.
type StubRoutes = Parameters<typeof createRoutesStub>[0];
export type AppRouteObject = StubRoutes[number];

export type AppPages = {
  Index: ComponentType;
  Dashboard: ComponentType;
  Queues: ComponentType;
  QueueDetail: ComponentType;
  Topics: ComponentType;
  TopicDetail: ComponentType;
  NotFound: ComponentType;
  Metrics: ComponentType;
  Intake: ComponentType;
  AdminIntake: ComponentType;
};

function AuthLayout(): ReactNode {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function protect(Page: ComponentType): ComponentType {
  const Protected = () => (
    <RequireAuth>
      <Page />
    </RequireAuth>
  );
  Protected.displayName = `Protected(${Page.displayName ?? Page.name ?? "Page"})`;
  return Protected;
}

// One route tree, consumed by both the production RouterProvider (lazy pages +
// browser history) and App.test.tsx (eager pages in createRoutesStub). The
// AuthProvider sits in a layout route so any router context — BrowserRouter in
// prod, MemoryRouter inside the stub — sits above it for useNavigate.
export function createAppRoutes(P: AppPages): AppRouteObject[] {
  return [
    {
      Component: AuthLayout,
      children: [
        { index: true, Component: P.Index },
        { path: "dashboard", Component: protect(P.Dashboard) },
        { path: "metrics", Component: protect(P.Metrics) },
        { path: "queues", Component: protect(P.Queues) },
        { path: "queues/:id", Component: protect(P.QueueDetail) },
        { path: "topics", Component: protect(P.Topics) },
        { path: "topics/:id", Component: protect(P.TopicDetail) },
        { path: "intake", Component: protect(P.Intake) },
        { path: "admin/intake", Component: protect(P.AdminIntake) },
        { path: "*", Component: P.NotFound },
      ],
    },
  ];
}

const lazyPages: AppPages = {
  Index: lazy(() => import("./pages/Index")),
  Dashboard: lazy(() => import("./pages/Dashboard")),
  Queues: lazy(() => import("./pages/Queues")),
  QueueDetail: lazy(() => import("./pages/QueueDetail")),
  Topics: lazy(() => import("./pages/Topics")),
  TopicDetail: lazy(() => import("./pages/TopicDetail")),
  NotFound: lazy(() => import("./pages/NotFound")),
  Metrics: lazy(() => import("./pages/Metrics")),
  Intake: lazy(() => import("./pages/Intake")),
  AdminIntake: lazy(() => import("./pages/AdminIntake")),
};

// createBrowserRouter accepts RouteObject[], which is a strict superset of the
// Component-only shape we return. Cast at the one call site where the widening
// is structurally safe; keeps createAppRoutes itself free of casts.
const router = createBrowserRouter(createAppRoutes(lazyPages) as RouteObject[]);

function App() {
  return (
    <>
      <Toaster theme="system" className="toaster group" />
      <Suspense fallback={<div aria-live="polite">Loading route…</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </>
  );
}

export default App;
