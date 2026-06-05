import { DashboardPage } from "./DashboardPage";

export function BuyersPage() {
  return (
    <DashboardPage
      dashboardKey="buyers"
      title="Buyer Performance"
      description="Buyer-wise sales, memo activity, and conversion visibility limited to the buyers, warehouses, and sub-admin scope assigned to the current user."
    />
  );
}
