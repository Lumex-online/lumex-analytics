import type {
  AppliedScope,
  DashboardKey,
  DashboardFiltersInput,
  MetricGroup,
  ResolvedScope
} from "@lumex/shared-types";

export interface MetricDefinition {
  key: string;
  label: string;
  group: MetricGroup;
  unit?: "currency" | "count" | "weight" | "percent";
}

export const metricRegistry: MetricDefinition[] = [
  { key: "totalSales", label: "Total Sales", group: "sales", unit: "currency" },
  { key: "totalPurchase", label: "Total Purchase", group: "purchase", unit: "currency" },
  { key: "memoGiven", label: "Memo Given", group: "memo", unit: "currency" },
  { key: "memoConversionRate", label: "Memo Conversion", group: "memo", unit: "percent" },
  { key: "totalSalesBySku", label: "Total Sales by SKU", group: "sku_analytics", unit: "currency" },
  { key: "buyerWiseSales", label: "Buyer-wise Sales", group: "buyer_analytics", unit: "currency" },
  { key: "warehouseWiseSales", label: "Warehouse-wise Sales", group: "warehouse_analytics", unit: "currency" }
];

export function applyScopeToFilters(
  scope: ResolvedScope,
  filters: DashboardFiltersInput
): { filters: DashboardFiltersInput; appliedScope: AppliedScope } {
  const requestedWarehouseKeys = filters.warehouseKeys ?? [];
  const requestedBuyerKeys = filters.buyerKeys ?? [];
  const requestedSubAdminKeys = filters.subAdminKeys ?? [];
  const allowedWarehouseKeys = scope.warehouseKeys === "ALL" ? null : scope.warehouseKeys;
  const allowedBuyerKeys = scope.buyerKeys === "ALL" ? null : scope.buyerKeys;
  const allowedSubAdminKeys = scope.subAdminKeys === "ALL" ? null : scope.subAdminKeys;
  const warehouseKeys =
    allowedWarehouseKeys === null
      ? requestedWarehouseKeys
      : requestedWarehouseKeys.length > 0
        ? requestedWarehouseKeys.filter((key) => allowedWarehouseKeys.includes(key))
        : allowedWarehouseKeys;
  const buyerKeys =
    allowedBuyerKeys === null
      ? requestedBuyerKeys
      : requestedBuyerKeys.length > 0
        ? requestedBuyerKeys.filter((key) => allowedBuyerKeys.includes(key))
        : allowedBuyerKeys;
  const subAdminKeys =
    allowedSubAdminKeys === null
      ? requestedSubAdminKeys
      : requestedSubAdminKeys.length > 0
        ? requestedSubAdminKeys.filter((key) => allowedSubAdminKeys.includes(key))
        : allowedSubAdminKeys;

  return {
    filters: {
      ...filters,
      warehouseKeys: allowedWarehouseKeys === null ? requestedWarehouseKeys : warehouseKeys,
      buyerKeys: allowedBuyerKeys === null ? requestedBuyerKeys : buyerKeys,
      subAdminKeys: allowedSubAdminKeys === null ? requestedSubAdminKeys : subAdminKeys
    },
    appliedScope: {
      warehouseKeys: scope.warehouseKeys,
      buyerKeys: scope.buyerKeys,
      subAdminKeys: scope.subAdminKeys,
      limitedByPermissions:
        scope.warehouseKeys !== "ALL" ||
        scope.buyerKeys !== "ALL" ||
        scope.subAdminKeys !== "ALL"
    }
  };
}

export function canAccessDashboard(scope: ResolvedScope, dashboard: DashboardKey): boolean {
  return scope.dashboards.includes(dashboard);
}

export function canAccessMetric(scope: ResolvedScope, metricGroup: MetricGroup): boolean {
  return scope.metricGroups.includes(metricGroup);
}
