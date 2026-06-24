import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { EmbeddedAnalyticsLayout } from "./layouts/EmbeddedAnalyticsLayout";
import { hasEmbedToken, isLocalAnalyticsEnv } from "./lib/analyticsAuth";
import { AdminAccessPage } from "./pages/AdminAccessPage";
import { NoAccessPage } from "./pages/NoAccessPage";
import { OperationalDashboardPage } from "./pages/OperationalDashboardPage";

function RequireAnalyticsAccess({ children }: { children: ReactNode }) {
  if (!isLocalAnalyticsEnv() && !hasEmbedToken()) {
    return <NoAccessPage />;
  }

  return children;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: "/dashboard",
        element: (
          <RequireAnalyticsAccess>
            <OperationalDashboardPage />
          </RequireAnalyticsAccess>
        )
      },
      { path: "/overview", element: <Navigate to="/dashboard" replace /> },
      { path: "/sales", element: <Navigate to="/dashboard" replace /> },
      { path: "/purchase", element: <Navigate to="/dashboard" replace /> },
      { path: "/sku-analytics", element: <Navigate to="/dashboard" replace /> },
      { path: "/memos", element: <Navigate to="/dashboard" replace /> },
      { path: "/buyers", element: <Navigate to="/dashboard" replace /> },
      { path: "/warehouses", element: <Navigate to="/dashboard" replace /> },
      {
        path: "/admin/access",
        element: (
          <RequireAnalyticsAccess>
            <AdminAccessPage />
          </RequireAnalyticsAccess>
        )
      },
      { path: "/no-access", element: <NoAccessPage /> }
    ]
  },
  {
    path: "/embed",
    element: <EmbeddedAnalyticsLayout />,
    children: [
      { index: true, element: <Navigate to="/embed/dashboard" replace /> },
      {
        path: "/embed/dashboard",
        element: (
          <RequireAnalyticsAccess>
            <OperationalDashboardPage embedded />
          </RequireAnalyticsAccess>
        )
      },
      {
        path: "/embed/admin/access",
        element: (
          <RequireAnalyticsAccess>
            <AdminAccessPage embedded />
          </RequireAnalyticsAccess>
        )
      }
    ]
  }
]);
