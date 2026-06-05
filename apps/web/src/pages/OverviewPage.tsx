import { DashboardPage } from "./DashboardPage";

export function OverviewPage() {
  return (
    <DashboardPage
      dashboardKey="overview"
      title="Executive Overview"
      description="Top-line sales, purchase, memo, buyer, and warehouse performance with warehouse, buyer, and sub-admin scope enforced server-side."
    />
  );
}
