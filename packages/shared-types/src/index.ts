export type DashboardKey =
  | "overview"
  | "sales"
  | "purchase"
  | "sku_analytics"
  | "buyers"
  | "memos"
  | "warehouses";

export type MetricGroup =
  | "sales"
  | "memo"
  | "purchase"
  | "financial_totals"
  | "sku_analytics"
  | "buyer_analytics"
  | "warehouse_analytics";

export type AnalyticsRole =
  | "founder"
  | "admin"
  | "sub_admin"
  | "buyer_user";

export type AccessMode = "full_access" | "scoped_access";

export interface UserIdentity {
  sourceUserId: number;
  websiteUserId?: string;
  email: string;
  fullName: string;
  websiteRole: string;
  analyticsRole: AnalyticsRole;
}

export interface WarehouseOption {
  key: number;
  sourceWarehouseId?: string;
  code: string;
  name: string;
}

export interface BuyerOption {
  key: number;
  sourceBuyerId?: string;
  code: string;
  name: string;
  location: string;
  country: string;
  isVerified: boolean;
  warehouseKeys: number[];
}

export interface SubAdminOption {
  key: number;
  sourceSubAdminId?: string;
  code: string;
  name: string;
}

export interface VendorOption {
  key: number;
  code: string;
  name: string;
  country: string;
  isVerified: boolean;
}

export interface ProductOption {
  key: number;
  sku: string;
  name: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
}

export interface FilterVisibility {
  warehouses: boolean;
  buyers: boolean;
  subAdmins: boolean;
  vendors: boolean;
  skus: boolean;
  shape: boolean;
  size: boolean;
  color: boolean;
  clarity: boolean;
  purchase: boolean;
  memo: boolean;
}

export interface ResolvedScope {
  user: UserIdentity;
  accessMode: AccessMode;
  allowGlobalTotals: boolean;
  allowExport: boolean;
  allowDrilldown: boolean;
  allowPurchaseVisibility: boolean;
  allowMemoVisibility: boolean;
  allowSkuAnalytics: boolean;
  allowManageOrganizationTargets: boolean;
  allowManageOwnTargets: boolean;
  dashboards: DashboardKey[];
  metricGroups: MetricGroup[];
  warehouseKeys: number[] | "ALL";
  buyerKeys: number[] | "ALL";
  subAdminKeys: number[] | "ALL";
  filterVisibility: FilterVisibility;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardFiltersInput {
  dateRange?: DateRange;
  warehouseKeys?: number[];
  buyerKeys?: number[];
  subAdminKeys?: number[];
  vendorKeys?: number[];
  skuKeys?: number[];
  shape?: string;
  size?: string;
  color?: string;
  clarity?: string;
  productType?: string;
  status?: string;
  viewMode?: "scoped" | "global_totals";
}

export interface AppliedScope {
  warehouseKeys: number[] | "ALL";
  buyerKeys: number[] | "ALL";
  subAdminKeys: number[] | "ALL";
  limitedByPermissions: boolean;
}

export interface KpiCard {
  key: string;
  label: string;
  value: number;
  unit?: "currency" | "count" | "weight" | "percent";
  changeLabel?: string;
}

export interface DashboardSummaryResponse {
  dashboard: DashboardKey;
  kpis: KpiCard[];
  lastUpdatedAt: string;
  appliedScope: AppliedScope;
}

export interface ChartSeries {
  name: string;
  data: number[];
}

export interface DashboardChartResponse {
  chartKey: string;
  categories: string[];
  series: ChartSeries[];
  totals?: Record<string, number>;
  appliedScope: AppliedScope;
}

export interface DrilldownRequest {
  filters: DashboardFiltersInput;
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
  page?: number;
  pageSize?: number;
}

export interface DrilldownResponse<T = Record<string, unknown>> {
  columns: string[];
  rows: T[];
  totalRows: number;
  exportAllowed: boolean;
}

export interface DashboardFiltersMetadata {
  dashboard: DashboardKey;
  warehouses: WarehouseOption[];
  buyers: BuyerOption[];
  subAdmins: SubAdminOption[];
  vendors: VendorOption[];
  skus: ProductOption[];
  shapes: string[];
  sizes: string[];
  colors: string[];
  clarities: string[];
  productTypes: string[];
  statuses: string[];
  defaults: DashboardFiltersInput;
  filterVisibility: FilterVisibility;
}

export interface PermissionMetadataResponse {
  user: UserIdentity;
  dashboards: DashboardKey[];
  metricGroups: MetricGroup[];
  warehouseScope: number[] | "ALL";
  buyerScope: number[] | "ALL";
  subAdminScope: number[] | "ALL";
  allowGlobalTotals: boolean;
  allowExport: boolean;
  allowDrilldown: boolean;
  allowPurchaseVisibility: boolean;
  allowMemoVisibility: boolean;
  allowSkuAnalytics: boolean;
  allowManageOrganizationTargets: boolean;
  allowManageOwnTargets: boolean;
  filterVisibility: FilterVisibility;
}

export interface AnalyticsAccessPolicy {
  sourceUserId: number;
  analyticsRole: AnalyticsRole;
  accessMode: AccessMode;
  allowGlobalTotals: boolean;
  allowExport: boolean;
  allowDrilldown: boolean;
  allowPurchaseVisibility: boolean;
  allowMemoVisibility: boolean;
  allowSkuAnalytics: boolean;
  allowManageOrganizationTargets: boolean;
  allowManageOwnTargets: boolean;
  warehouseKeys: number[] | "ALL";
  buyerKeys: number[] | "ALL";
  subAdminKeys: number[] | "ALL";
  dashboards: DashboardKey[];
  metricGroups: MetricGroup[];
  filterVisibility: FilterVisibility;
  isActive: boolean;
}

export interface AdminAccessPolicyResponse {
  policies: AnalyticsAccessPolicy[];
  users: UserIdentity[];
  warehouses: WarehouseOption[];
  buyers: BuyerOption[];
  subAdmins: SubAdminOption[];
  vendors: VendorOption[];
  skus: ProductOption[];
}

export type AdminWarehouseScopeMode = "all" | "custom";

export type AdminBuyerScopeMode = "all" | "associated";

export interface UpdateSubAdminAccessInput {
  isActive: boolean;
  warehouseScopeMode: AdminWarehouseScopeMode;
  warehouseKeys: number[];
  buyerScopeMode: AdminBuyerScopeMode;
  allowManageOrganizationTargets: boolean;
  allowManageOwnTargets: boolean;
}

export type KpiTargetMetricKey = "totalSales";

export type KpiTargetScope = "organization" | "own";

export interface KpiTargetDefinition {
  metricKey: KpiTargetMetricKey;
  scope: KpiTargetScope;
  dateRange: DateRange;
  targetValue: number;
  updatedAt: string;
  updatedBySourceUserId: number | null;
}

export interface KpiTargetManagementResponse {
  capabilities: {
    canManageOrganizationTargets: boolean;
    canManageOwnTargets: boolean;
  };
  targets: KpiTargetDefinition[];
}

export interface UpdateKpiTargetInput {
  metricKey: KpiTargetMetricKey;
  scope: KpiTargetScope;
  dateRange: DateRange;
  targetValue: number;
}

export interface DeleteKpiTargetInput {
  metricKey: KpiTargetMetricKey;
  scope: KpiTargetScope;
  dateRange: DateRange;
}

export interface BreakdownItem {
  key: string;
  label: string;
  value: number;
}

export interface SkuAnalyticsSummaryResponse {
  totalSales: number;
  totalSalesBySku: BreakdownItem[];
  byShape: BreakdownItem[];
  bySize: BreakdownItem[];
  byColor: BreakdownItem[];
  byClarity: BreakdownItem[];
  appliedScope: AppliedScope;
}

export interface MemoConversionBuyerRow {
  buyerKey: number;
  buyerName: string;
  memoGivenValue: number;
  convertedMemoValue: number;
  conversionRate: number;
}

export interface MemoConversionSummaryResponse {
  memoGivenValue: number;
  convertedMemoValue: number;
  conversionRate: number;
  buyers: MemoConversionBuyerRow[];
  appliedScope: AppliedScope;
}

export interface ExecutiveKpi {
  key: string;
  label: string;
  value: number;
  unit?: "currency" | "count" | "weight" | "percent";
  changePct: number | null;
  note?: string;
  isPending?: boolean;
  targetValue?: number;
  targetScope?: KpiTargetScope;
  targetDateRange?: DateRange;
  targetVariance?: number;
}

export interface RateBreakdownItem {
  key: string;
  label: string;
  numeratorValue: number;
  denominatorValue: number;
  rate: number;
}

export interface DualValueBreakdownItem {
  key: string;
  label: string;
  primaryValue: number;
  secondaryValue: number;
  fulfilmentRatio?: number;
}

export interface ParetoBreakdownItem extends BreakdownItem {
  cumulativePercent: number;
}

export interface HeatmapMatrix {
  rowLabels: string[];
  columnLabels: string[];
  values: number[][];
}

export interface ExecutiveAlert {
  id: string;
  tone: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface ExecutiveDashboardResponse {
  lastUpdatedAt: string;
  appliedScope: AppliedScope;
  comparisonLabel: string;
  dataAvailability: {
    returns: boolean;
    verifiedBuyers: boolean;
  };
  kpis: ExecutiveKpi[];
  salesTrend: {
    categories: string[];
    sales: number[];
    purchase: number[];
    orders: number[];
    buyers: number[];
  };
  revenueDistribution: {
    byWarehouse: BreakdownItem[];
    byVendor: BreakdownItem[];
    byBuyer: BreakdownItem[];
    ordersByCountry: BreakdownItem[];
    buyersByCountry: BreakdownItem[];
    vendorsByCountry: BreakdownItem[];
  };
  inventory: {
    inStockStones: number;
    verifiedStones: number;
    notVerifiedStones: number;
    byWarehouse: BreakdownItem[];
    aging: BreakdownItem[];
    movementFunnel: BreakdownItem[];
  };
  memoConversion: {
    funnel: BreakdownItem[];
    byBuyer: RateBreakdownItem[];
    byWarehouse: RateBreakdownItem[];
  };
  buyerPerformance: {
    byBuyer: BreakdownItem[];
    bySubAdmin: BreakdownItem[];
    pareto: ParetoBreakdownItem[];
  };
  skuPerformance: {
    certifiedMemoMatrix: HeatmapMatrix;
    certifiedMemoSalesBySku: BreakdownItem[];
    looseLotsMatrix: HeatmapMatrix;
    looseLotsSalesBySku: BreakdownItem[];
    ownShapeMatrix: HeatmapMatrix;
    ownShapeSalesBySku: BreakdownItem[];
    topCombinations: BreakdownItem[];
  };
  purchaseVendor: {
    purchaseVsSalesByVendor: DualValueBreakdownItem[];
    fulfilmentByType: RateBreakdownItem[];
    qcStatus: BreakdownItem[];
  };
  returns: {
    available: boolean;
    note?: string;
    summary: {
      totalValue: number;
      orderCount: number;
      quantity: number;
      netSalesAfterReturns: number;
    };
    trend: {
      categories: string[];
      values: number[];
    };
    byBuyer: BreakdownItem[];
    byVendor: BreakdownItem[];
    byWarehouse: BreakdownItem[];
    byReason: BreakdownItem[];
    byRefundMethod: BreakdownItem[];
    byReturnType: BreakdownItem[];
    qcStatus: BreakdownItem[];
  };
  alerts: ExecutiveAlert[];
}
