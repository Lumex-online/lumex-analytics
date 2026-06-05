import { DashboardPage } from "./DashboardPage";

export function SalesPage() {
  return (
    <DashboardPage
      dashboardKey="sales"
      title="Sales Dashboard"
      description="Sales performance across allowed buyers, warehouses, sub-admins, and SKU dimensions with drilldown-ready scope."
    />
  );
}
