import { applyScopeToFilters, canAccessDashboard } from "@lumex/analytics-core";
import type {
  DashboardChartResponse,
  DashboardFiltersInput,
  DashboardKey,
  DashboardSummaryResponse,
  KpiCard
} from "@lumex/shared-types";
import {
  buildBreakdown,
  conversionRate,
  getBuyer,
  filterAnalyticsRows,
  getBuyerName,
  getProduct,
  getWarehouseName,
  primaryChartForDashboard,
  sumRows
} from "./bootstrap.analytics.js";
import { env } from "../../config/env.js";
import { getMongoDb } from "../../database/mongo.js";
import {
  buildBreakdown as buildMongoBreakdown,
  conversionRate as mongoConversionRate,
  filterAnalyticsRowsMongo,
  getBuyerNameFromMaps,
  getDimensionMapsMongo,
  getWarehouseNameFromMaps,
  primaryChartForDashboardMongo,
  sumRows as sumMongoRows,
  type MongoAnalyticsRow,
  type MongoDimensionMaps
} from "./mongo-analytics.js";
import type { PermissionService } from "../permissions/permissions.service.js";

function percent(value: number) {
  return Number((value * 100).toFixed(2));
}

function buildKpis(dashboard: DashboardKey, rows: ReturnType<typeof filterAnalyticsRows>): KpiCard[] {
  const totalSales = sumRows(rows, "salesValue");
  const totalPurchase = sumRows(rows, "purchaseValue");
  const memoGiven = sumRows(rows, "memoGivenValue");
  const convertedMemoValue = sumRows(rows, "memoConvertedValue");
  const uniqueBuyerKeys = [
    ...new Set(
      rows
        .filter((row) => row.buyerKey !== null && (row.salesValue > 0 || row.memoGivenValue > 0))
        .map((row) => row.buyerKey)
    )
  ];
  const totalBuyers = uniqueBuyerKeys.length;
  const verifiedBuyers = uniqueBuyerKeys.filter((buyerKey) => getBuyer(buyerKey)?.isVerified).length;
  const uniqueWarehouses = new Set(rows.map((row) => row.warehouseKey).filter((value) => value !== null)).size;
  const uniqueSkus = new Set(rows.map((row) => row.productKey)).size;
  const byBuyer = buildBreakdown(
    rows,
    (row) => String(row.buyerKey),
    (key) => getBuyerName(Number(key)),
    (row) => row.salesValue
  );
  const byWarehouse = buildBreakdown(
    rows,
    (row) => String(row.warehouseKey),
    (key) => getWarehouseName(Number(key)),
    (row) => row.salesValue
  );
  const bySku = buildBreakdown(
    rows,
    (row) => String(row.productKey),
    (key) => getProduct(Number(key))?.sku ?? key,
    (row) => row.salesValue
  );

  switch (dashboard) {
    case "overview":
      return [
        { key: "totalSales", label: "Total Sales", value: totalSales, unit: "currency" },
        { key: "totalPurchase", label: "Total Purchase", value: totalPurchase, unit: "currency" },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "totalBuyers", label: "Total Buyers", value: totalBuyers, unit: "count" },
        { key: "verifiedBuyers", label: "Verified Buyers", value: verifiedBuyers, unit: "count" },
        { key: "memoConversionRate", label: "Memo Conversion", value: percent(conversionRate(rows)), unit: "percent" },
        { key: "activeWarehouses", label: "Active Warehouses", value: uniqueWarehouses, unit: "count" }
      ];
    case "sales":
      return [
        { key: "totalSales", label: "Total Sales", value: totalSales, unit: "currency" },
        { key: "buyerWiseSales", label: "Buyer-wise Sales", value: byBuyer[0]?.value ?? 0, unit: "currency", changeLabel: byBuyer[0]?.label ? `Top buyer: ${byBuyer[0].label}` : undefined },
        { key: "warehouseWiseSales", label: "Warehouse-wise Sales", value: byWarehouse[0]?.value ?? 0, unit: "currency", changeLabel: byWarehouse[0]?.label ? `Top warehouse: ${byWarehouse[0].label}` : undefined },
        { key: "totalSkus", label: "SKU Sold", value: uniqueSkus, unit: "count" }
      ];
    case "purchase":
      return [
        { key: "totalPurchase", label: "Total Purchase", value: totalPurchase, unit: "currency" },
        { key: "warehouseWisePurchase", label: "Warehouse-wise Purchase", value: byWarehouse[0]?.value ?? 0, unit: "currency", changeLabel: byWarehouse[0]?.label ? `Top warehouse: ${byWarehouse[0].label}` : undefined },
        { key: "activeWarehouses", label: "Purchasing Warehouses", value: uniqueWarehouses, unit: "count" }
      ];
    case "sku_analytics":
      return [
        { key: "totalSalesBySku", label: "Total Sales by SKU", value: totalSales, unit: "currency" },
        { key: "uniqueSkus", label: "Unique SKU Sold", value: uniqueSkus, unit: "count" },
        { key: "topSkuSales", label: "Top SKU Sales", value: bySku[0]?.value ?? 0, unit: "currency", changeLabel: bySku[0]?.label ? `Top SKU: ${bySku[0].label}` : undefined },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" }
      ];
    case "buyers":
      return [
        { key: "buyerWiseSales", label: "Buyer-wise Sales", value: totalSales, unit: "currency" },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "memoConversionRate", label: "Memo Conversion", value: percent(conversionRate(rows)), unit: "percent" },
        { key: "buyerCount", label: "Buyer Count", value: totalBuyers, unit: "count" }
      ];
    case "memos":
      return [
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "convertedMemoValue", label: "Converted Memo", value: convertedMemoValue, unit: "currency" },
        { key: "openMemoValue", label: "Open Memo", value: memoGiven - convertedMemoValue, unit: "currency" },
        { key: "memoConversionRate", label: "Memo Conversion", value: percent(conversionRate(rows)), unit: "percent" }
      ];
    case "warehouses":
      return [
        { key: "warehouseWiseSales", label: "Warehouse-wise Sales", value: totalSales, unit: "currency" },
        { key: "warehouseWisePurchase", label: "Warehouse-wise Purchase", value: totalPurchase, unit: "currency" },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "warehouseCount", label: "Warehouse Count", value: uniqueWarehouses, unit: "count" }
      ];
  }
}

function buildMongoKpis(dashboard: DashboardKey, rows: MongoAnalyticsRow[], maps: MongoDimensionMaps): KpiCard[] {
  const totalSales = sumMongoRows(rows, "salesValue");
  const totalPurchase = sumMongoRows(rows, "purchaseValue");
  const memoGiven = sumMongoRows(rows, "memoGivenValue");
  const convertedMemoValue = sumMongoRows(rows, "memoConvertedValue");
  const uniqueBuyerKeys = [
    ...new Set(
      rows
        .filter((row) => row.buyerKey !== null && (row.salesValue > 0 || row.memoGivenValue > 0))
        .map((row) => row.buyerKey)
    )
  ];
  const totalBuyers = uniqueBuyerKeys.length;
  const verifiedBuyers = uniqueBuyerKeys.filter((buyerKey) => buyerKey !== null && maps.buyers.get(buyerKey)?.isVerified).length;
  const uniqueWarehouses = new Set(rows.map((row) => row.warehouseKey).filter((value) => value !== null)).size;
  const uniqueSkus = new Set(rows.map((row) => row.productKey)).size;
  const byBuyer = buildMongoBreakdown(
    rows,
    (row) => String(row.buyerKey),
    (key) => getBuyerNameFromMaps(maps, key === "null" ? null : Number(key)),
    (row) => row.salesValue
  );
  const byWarehouse = buildMongoBreakdown(
    rows,
    (row) => String(row.warehouseKey),
    (key) => getWarehouseNameFromMaps(maps, key === "null" ? null : Number(key)),
    (row) => row.salesValue
  );
  const bySku = buildMongoBreakdown(
    rows,
    (row) => String(row.productKey),
    (key) => maps.products.get(Number(key))?.sku ?? key,
    (row) => row.salesValue
  );

  switch (dashboard) {
    case "overview":
      return [
        { key: "totalSales", label: "Total Sales", value: totalSales, unit: "currency" },
        { key: "totalPurchase", label: "Total Purchase", value: totalPurchase, unit: "currency" },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "totalBuyers", label: "Total Buyers", value: totalBuyers, unit: "count" },
        { key: "verifiedBuyers", label: "Verified Buyers", value: verifiedBuyers, unit: "count" },
        { key: "memoConversionRate", label: "Memo Conversion", value: percent(mongoConversionRate(rows)), unit: "percent" },
        { key: "activeWarehouses", label: "Active Warehouses", value: uniqueWarehouses, unit: "count" }
      ];
    case "sales":
      return [
        { key: "totalSales", label: "Total Sales", value: totalSales, unit: "currency" },
        { key: "buyerWiseSales", label: "Buyer-wise Sales", value: byBuyer[0]?.value ?? 0, unit: "currency", changeLabel: byBuyer[0]?.label ? `Top buyer: ${byBuyer[0].label}` : undefined },
        { key: "warehouseWiseSales", label: "Warehouse-wise Sales", value: byWarehouse[0]?.value ?? 0, unit: "currency", changeLabel: byWarehouse[0]?.label ? `Top warehouse: ${byWarehouse[0].label}` : undefined },
        { key: "totalSkus", label: "SKU Sold", value: uniqueSkus, unit: "count" }
      ];
    case "purchase":
      return [
        { key: "totalPurchase", label: "Total Purchase", value: totalPurchase, unit: "currency" },
        { key: "warehouseWisePurchase", label: "Warehouse-wise Purchase", value: byWarehouse[0]?.value ?? 0, unit: "currency", changeLabel: byWarehouse[0]?.label ? `Top warehouse: ${byWarehouse[0].label}` : undefined },
        { key: "activeWarehouses", label: "Purchasing Warehouses", value: uniqueWarehouses, unit: "count" }
      ];
    case "sku_analytics":
      return [
        { key: "totalSalesBySku", label: "Total Sales by SKU", value: totalSales, unit: "currency" },
        { key: "uniqueSkus", label: "Unique SKU Sold", value: uniqueSkus, unit: "count" },
        { key: "topSkuSales", label: "Top SKU Sales", value: bySku[0]?.value ?? 0, unit: "currency", changeLabel: bySku[0]?.label ? `Top SKU: ${bySku[0].label}` : undefined },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" }
      ];
    case "buyers":
      return [
        { key: "buyerWiseSales", label: "Buyer-wise Sales", value: totalSales, unit: "currency" },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "memoConversionRate", label: "Memo Conversion", value: percent(mongoConversionRate(rows)), unit: "percent" },
        { key: "buyerCount", label: "Buyer Count", value: totalBuyers, unit: "count" }
      ];
    case "memos":
      return [
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "convertedMemoValue", label: "Converted Memo", value: convertedMemoValue, unit: "currency" },
        { key: "openMemoValue", label: "Open Memo", value: memoGiven - convertedMemoValue, unit: "currency" },
        { key: "memoConversionRate", label: "Memo Conversion", value: percent(mongoConversionRate(rows)), unit: "percent" }
      ];
    case "warehouses":
      return [
        { key: "warehouseWiseSales", label: "Warehouse-wise Sales", value: totalSales, unit: "currency" },
        { key: "warehouseWisePurchase", label: "Warehouse-wise Purchase", value: totalPurchase, unit: "currency" },
        { key: "memoGiven", label: "Memo Given", value: memoGiven, unit: "currency" },
        { key: "warehouseCount", label: "Warehouse Count", value: uniqueWarehouses, unit: "count" }
      ];
  }
}

export class DashboardService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly analyticsStore = env.ANALYTICS_STORE
  ) {}

  async getSummary(
    sourceUserId: number,
    dashboard: DashboardKey,
    filters: DashboardFiltersInput
  ): Promise<DashboardSummaryResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (!canAccessDashboard(scope, dashboard)) {
      return { code: "ACCESS_DENIED", message: "Dashboard is not available for this user." };
    }

    if (dashboard === "purchase" && !scope.allowPurchaseVisibility) {
      return { code: "ACCESS_DENIED", message: "Purchase analytics is not enabled for this user." };
    }

    if (dashboard === "memos" && !scope.allowMemoVisibility) {
      return { code: "ACCESS_DENIED", message: "Memo analytics is not enabled for this user." };
    }

    if (dashboard === "sku_analytics" && !scope.allowSkuAnalytics) {
      return { code: "ACCESS_DENIED", message: "SKU analytics is not enabled for this user." };
    }

    const scoped = applyScopeToFilters(scope, filters);

    let kpis: KpiCard[];
    if (this.analyticsStore === "mongo") {
      const db = await getMongoDb();
      const [rows, maps] = await Promise.all([
        filterAnalyticsRowsMongo(db, scoped.filters),
        getDimensionMapsMongo(db)
      ]);
      kpis = buildMongoKpis(dashboard, rows, maps);
    } else {
      const rows = filterAnalyticsRows(scoped.filters);
      kpis = buildKpis(dashboard, rows);
    }

    return {
      dashboard,
      kpis,
      lastUpdatedAt: new Date().toISOString(),
      appliedScope: scoped.appliedScope
    };
  }

  async getChart(
    sourceUserId: number,
    dashboard: DashboardKey,
    chartKey: string,
    filters: DashboardFiltersInput
  ): Promise<DashboardChartResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (!canAccessDashboard(scope, dashboard)) {
      return { code: "ACCESS_DENIED", message: "Dashboard is not available for this user." };
    }

    const scoped = applyScopeToFilters(scope, filters);
    const db = this.analyticsStore === "mongo" ? await getMongoDb() : null;
    const rows = db ? await filterAnalyticsRowsMongo(db, scoped.filters) : filterAnalyticsRows(scoped.filters);
    const chart = db
      ? primaryChartForDashboardMongo(dashboard, rows as MongoAnalyticsRow[], await getDimensionMapsMongo(db))
      : primaryChartForDashboard(dashboard, rows as ReturnType<typeof filterAnalyticsRows>);

    return {
      chartKey,
      categories: chart.categories,
      series: chart.series,
      totals: {
        totalSales: db ? sumMongoRows(rows as MongoAnalyticsRow[], "salesValue") : sumRows(rows as ReturnType<typeof filterAnalyticsRows>, "salesValue"),
        totalPurchase: db ? sumMongoRows(rows as MongoAnalyticsRow[], "purchaseValue") : sumRows(rows as ReturnType<typeof filterAnalyticsRows>, "purchaseValue"),
        memoGiven: db ? sumMongoRows(rows as MongoAnalyticsRow[], "memoGivenValue") : sumRows(rows as ReturnType<typeof filterAnalyticsRows>, "memoGivenValue")
      },
      appliedScope: scoped.appliedScope
    };
  }
}
