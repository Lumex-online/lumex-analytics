import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { EmbeddedAnalyticsLayout } from "./layouts/EmbeddedAnalyticsLayout";
import { AdminAccessPage } from "./pages/AdminAccessPage";
import { NoAccessPage } from "./pages/NoAccessPage";
import { OperationalDashboardPage } from "./pages/OperationalDashboardPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <OperationalDashboardPage /> },
      { path: "/overview", element: <Navigate to="/dashboard" replace /> },
      { path: "/sales", element: <Navigate to="/dashboard" replace /> },
      { path: "/purchase", element: <Navigate to="/dashboard" replace /> },
      { path: "/sku-analytics", element: <Navigate to="/dashboard" replace /> },
      { path: "/memos", element: <Navigate to="/dashboard" replace /> },
      { path: "/buyers", element: <Navigate to="/dashboard" replace /> },
      { path: "/warehouses", element: <Navigate to="/dashboard" replace /> },
      { path: "/admin/access", element: <AdminAccessPage /> },
      { path: "/no-access", element: <NoAccessPage /> }
    ]
  },
  {
    path: "/embed",
    element: <EmbeddedAnalyticsLayout />,
    children: [
      { index: true, element: <Navigate to="/embed/dashboard" replace /> },
      { path: "/embed/dashboard", element: <OperationalDashboardPage embedded /> },
      { path: "/embed/admin/access", element: <AdminAccessPage embedded /> }
    ]
  }
]);
