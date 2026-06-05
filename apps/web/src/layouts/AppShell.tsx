import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import type { DashboardKey } from "@lumex/shared-types";
import { apiClient } from "../api/client";
import { StatePanel } from "../components/StatePanel";

const dashboardLinks: { key: DashboardKey; label: string; path: string }[] = [
  { key: "overview", label: "LO Business Dashboard", path: "/dashboard" }
];

export function AppShell() {
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiClient.getMyPermissions()
  });

  if (permissionsQuery.isLoading) {
    return <StatePanel title="Loading analytics scope" detail="Resolving permissions from the source account system." />;
  }

  if (permissionsQuery.isError || !permissionsQuery.data) {
    return <StatePanel title="Analytics unavailable" detail="The dashboard could not resolve your access policy." tone="error" />;
  }

  const permissions = permissionsQuery.data;
  const showAdminAccess =
    permissions.user.analyticsRole === "founder" ||
    permissions.user.analyticsRole === "admin" ||
    permissions.allowManageOrganizationTargets ||
    permissions.allowManageOwnTargets;
  const adminLinkLabel =
    permissions.user.analyticsRole === "founder" || permissions.user.analyticsRole === "admin"
      ? "Admin Access"
      : "Targets";

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="brand">
          <h1>Lumex.Online Analytics</h1>
        </div>

        <div className="user-card">
          <div>
            <strong>{permissions.user.fullName}</strong>
            <p>{permissions.user.email}</p>
          </div>
          <span className="pill">{permissions.user.analyticsRole}</span>
        </div>

        <nav className="nav">
          {dashboardLinks
            .filter((link) => permissions.dashboards.includes(link.key))
            .map((link) => (
              <NavLink
                key={link.key}
                to={link.path}
                className={({ isActive }) => (isActive ? "nav__link nav__link--active" : "nav__link")}
              >
                {link.label}
              </NavLink>
            ))}
          {showAdminAccess ? (
            <NavLink
              to="/admin/access"
              className={({ isActive }) => (isActive ? "nav__link nav__link--active" : "nav__link")}
            >
              {adminLinkLabel}
            </NavLink>
          ) : null}
        </nav>
      </aside>

      <main className="shell__content">
        <Outlet />
      </main>
    </div>
  );
}
