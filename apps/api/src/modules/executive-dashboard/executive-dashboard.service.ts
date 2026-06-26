import { applyScopeToFilters } from "@lumex/analytics-core";
import type {
  BreakdownItem,
  DashboardFiltersInput,
  DualValueBreakdownItem,
  ExecutiveAlert,
  ExecutiveDashboardResponse,
  ExecutiveKpi,
  HeatmapMatrix,
  ParetoBreakdownItem,
  RateBreakdownItem,
  ResolvedScope
} from "@lumex/shared-types";
import {
  buildBreakdown,
  filterAnalyticsRows,
  filterInventoryRows,
  getBuyer,
  getBuyerName,
  getProduct,
  getSubAdminName,
  getVendor,
  getVendorName,
  getWarehouseName,
  sumRows
} from "../dashboards/bootstrap.analytics.js";
import {
  getLumexDataset,
  type LumexAnalyticsRow,
  type LumexReturnRow
} from "@lumex/lumex-source";
import { env } from "../../config/env.js";
import { getMongoDb } from "../../database/mongo.js";
import {
  filterAnalyticsRowsMongo,
  filterInventoryRowsMongo,
  filterReturnRowsMongo,
  getDatasetMetadataMongo,
  getDimensionMapsMongo,
  getReturnDocumentsByIdsMongo,
  getSalesDocumentsByIdsMongo,
  summarizeSalesDocumentsMongo,
  type MongoAnalyticsRow,
  type MongoInventoryRow,
  type MongoReturnDocument,
  type MongoReturnRow
} from "../dashboards/mongo-analytics.js";
import type { KpiTargetService } from "../kpi-targets/kpi-targets.service.js";
import type { PermissionService } from "../permissions/permissions.service.js";

function round(value: number) {
  return Number(value.toFixed(2));
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return round(((current - previous) / previous) * 100);
}

function conversionRate(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daySpan(from: string, to: string) {
  const start = toUtcDate(from).getTime();
  const end = toUtcDate(to).getTime();
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function previousDateRange(filters: DashboardFiltersInput) {
  const dataset = getLumexDataset();
  const from = filters.dateRange?.from ?? dataset.minDate;
  const to = filters.dateRange?.to ?? dataset.maxDate;
  const days = daySpan(from, to);
  const previousEnd = new Date(toUtcDate(from).getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);

  return {
    from: formatDate(previousStart),
    to: formatDate(previousEnd),
    label: `${formatDate(previousStart)} to ${formatDate(previousEnd)}`
  };
}

function previousDateRangeWithBounds(filters: DashboardFiltersInput, minDate: string, maxDate: string) {
  const from = filters.dateRange?.from ?? minDate;
  const to = filters.dateRange?.to ?? maxDate;
  const days = daySpan(from, to);
  const previousEnd = new Date(toUtcDate(from).getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);

  return {
    from: formatDate(previousStart),
    to: formatDate(previousEnd),
    label: `${formatDate(previousStart)} to ${formatDate(previousEnd)}`
  };
}

function enumerateDates(from: string, to: string) {
  const dates: string[] = [];
  const cursor = toUtcDate(from);
  const end = toUtcDate(to);

  while (cursor <= end) {
    dates.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function distinctCount<T>(items: T[], keyBy: (item: T) => string | number | null | undefined) {
  return new Set(
    items
      .map(keyBy)
      .filter((value): value is string | number => value !== null && value !== undefined && value !== "")
  ).size;
}

function matchesSelection<T>(value: T, selected?: T[] | T) {
  if (Array.isArray(selected)) {
    return selected.length === 0 || selected.includes(value);
  }

  return selected === undefined || selected === value;
}

function topN<T>(items: T[], count: number) {
  return items.slice(0, count);
}

function summarizeSalesDocuments(documentIds: Iterable<string>) {
  const documentById = new Map(
    getLumexDataset().salesDocuments.map((document) => [document.documentId, document])
  );
  const uniqueDocumentIds = [...new Set(documentIds)];
  let total = 0;
  let tax = 0;
  let vat = 0;
  let count = 0;

  for (const documentId of uniqueDocumentIds) {
    const document = documentById.get(documentId);
    if (!document) {
      continue;
    }

    total += document.totalValue;
    tax += document.taxValue;
    vat += document.vatValue;
    count += 1;
  }

  return {
    total: round(total),
    tax: round(tax),
    vat: round(vat),
    count
  };
}

function sumSalesDocumentsByDate(rows: LumexAnalyticsRow[]) {
  const documentById = new Map(
    getLumexDataset().salesDocuments.map((document) => [document.documentId, document])
  );
  const dateByDocumentId = new Map<string, string>();

  for (const row of rows) {
    if (!dateByDocumentId.has(row.documentId)) {
      dateByDocumentId.set(row.documentId, row.date);
    }
  }

  const totalsByDate = new Map<string, number>();

  for (const [documentId, date] of dateByDocumentId.entries()) {
    const document = documentById.get(documentId);
    if (!document) {
      continue;
    }

    totalsByDate.set(date, round((totalsByDate.get(date) ?? 0) + document.totalValue));
  }

  return totalsByDate;
}

function distinctSalesDocumentsByDate(rows: LumexAnalyticsRow[]) {
  const salesDocumentIds = new Set(getLumexDataset().salesDocuments.map((document) => document.documentId));
  const keysByDate = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!salesDocumentIds.has(row.documentId)) {
      continue;
    }

    const keys = keysByDate.get(row.date) ?? new Set<string>();
    keys.add(row.documentId);
    keysByDate.set(row.date, keys);
  }

  return new Map([...keysByDate.entries()].map(([date, keys]) => [date, keys.size]));
}

function sumRowsByDate(
  rows: LumexAnalyticsRow[],
  field: keyof Pick<LumexAnalyticsRow, "salesValue" | "purchaseValue" | "memoGivenValue" | "memoConvertedValue">
) {
  const totalsByDate = new Map<string, number>();

  for (const row of rows) {
    totalsByDate.set(row.date, round((totalsByDate.get(row.date) ?? 0) + row[field]));
  }

  return totalsByDate;
}

function sumReturnDocumentsByDate(rows: LumexReturnRow[]) {
  const documentById = new Map(
    getLumexDataset().returnDocuments.map((document) => [document.documentId, document])
  );
  const dateByDocumentId = new Map<string, string>();

  for (const row of rows) {
    if (!dateByDocumentId.has(row.documentId)) {
      dateByDocumentId.set(row.documentId, row.date);
    }
  }

  const totalsByDate = new Map<string, number>();

  for (const [documentId, date] of dateByDocumentId.entries()) {
    const document = documentById.get(documentId);
    if (!document) {
      continue;
    }

    totalsByDate.set(date, round((totalsByDate.get(date) ?? 0) + document.totalValue));
  }

  return totalsByDate;
}

function distinctCountByDate<T>(
  rows: T[],
  dateBy: (row: T) => string,
  keyBy: (row: T) => string | number | null | undefined
) {
  const keysByDate = new Map<string, Set<string | number>>();

  for (const row of rows) {
    const key = keyBy(row);
    if (key === null || key === undefined || key === "") {
      continue;
    }

    const date = dateBy(row);
    const keys = keysByDate.get(date) ?? new Set<string | number>();
    keys.add(key);
    keysByDate.set(date, keys);
  }

  return new Map([...keysByDate.entries()].map(([date, keys]) => [date, keys.size]));
}

function buildRateBreakdown(
  rows: LumexAnalyticsRow[],
  groupBy: (row: LumexAnalyticsRow) => string,
  labelBy: (key: string) => string
) {
  const totals = new Map<string, { numerator: number; denominator: number }>();

  for (const row of rows) {
    const key = groupBy(row);
    const current = totals.get(key) ?? { numerator: 0, denominator: 0 };
    current.denominator += 1;
    if (row.memoConvertedValue > 0) {
      current.numerator += 1;
    }
    totals.set(key, current);
  }

  return [...totals.entries()]
    .map(([key, value]) => ({
      key,
      label: labelBy(key),
      numeratorValue: value.numerator,
      denominatorValue: value.denominator,
      rate: round(conversionRate(value.numerator, value.denominator) * 100)
    }))
    .sort((left, right) => right.rate - left.rate);
}

function buildDualValueBreakdown(
  rows: LumexAnalyticsRow[],
  groupBy: (row: LumexAnalyticsRow) => string,
  labelBy: (key: string) => string
) {
  const totals = new Map<string, { sales: number; purchase: number; ordered: number; fulfilled: number }>();

  for (const row of rows) {
    const key = groupBy(row);
    const current = totals.get(key) ?? { sales: 0, purchase: 0, ordered: 0, fulfilled: 0 };
    current.sales += row.salesValue;
    current.purchase += row.purchaseValue;
    current.ordered += row.orderedUnits ?? 0;
    current.fulfilled += row.fulfilledUnits ?? 0;
    totals.set(key, current);
  }

  return [...totals.entries()]
    .map(([key, value]) => ({
      key,
      label: labelBy(key),
      primaryValue: round(value.sales),
      secondaryValue: round(value.purchase),
      fulfilmentRatio: round(conversionRate(value.fulfilled, value.ordered) * 100)
    }))
    .sort((left, right) => (right.primaryValue + right.secondaryValue) - (left.primaryValue + left.secondaryValue));
}

function buildFulfilmentBreakdown(rows: LumexAnalyticsRow[]) {
  const labels: Record<string, string> = {
    stone: "Certified Stones",
    loose_lot: "Loose Lots",
    own_shape: "Own Shape"
  };
  const totals = new Map<string, { ordered: number; fulfilled: number }>();

  for (const row of rows) {
    if (!(row.productType in labels)) {
      continue;
    }

    const ordered = row.orderedUnits ?? 0;
    const fulfilled = row.fulfilledUnits ?? 0;
    if (ordered <= 0 && fulfilled <= 0) {
      continue;
    }

    const current = totals.get(row.productType) ?? { ordered: 0, fulfilled: 0 };
    current.ordered += ordered;
    current.fulfilled += fulfilled;
    totals.set(row.productType, current);
  }

  return [...totals.entries()]
    .filter(([, value]) => value.fulfilled > 0)
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key,
      numeratorValue: round(value.fulfilled),
      denominatorValue: round(value.ordered),
      rate: round(conversionRate(value.fulfilled, value.ordered) * 100)
    }))
    .sort((left, right) => right.rate - left.rate);
}

function summarizeFulfilment(rows: LumexAnalyticsRow[]) {
  const totals = rows.reduce(
    (summary, row) => ({
      ordered: summary.ordered + (row.orderedUnits ?? 0),
      fulfilled: summary.fulfilled + (row.fulfilledUnits ?? 0)
    }),
    { ordered: 0, fulfilled: 0 }
  );

  return {
    ordered: round(totals.ordered),
    fulfilled: round(totals.fulfilled),
    rate: round(conversionRate(totals.fulfilled, totals.ordered) * 100)
  };
}

function filterReturnRows(filters: DashboardFiltersInput) {
  const dataset = getLumexDataset();

  return dataset.returnRows.filter((row) => {
    if (filters.warehouseKeys && filters.warehouseKeys.length > 0) {
      if (row.warehouseKey === null || !filters.warehouseKeys.includes(row.warehouseKey)) {
        return false;
      }
    }

    if (filters.buyerKeys && filters.buyerKeys.length > 0) {
      if (row.buyerKey === null || !filters.buyerKeys.includes(row.buyerKey)) {
        return false;
      }
    }

    if (filters.subAdminKeys && filters.subAdminKeys.length > 0) {
      if (!row.subAdminKeys.some((key) => filters.subAdminKeys?.includes(key))) {
        return false;
      }
    }

    if (filters.vendorKeys && filters.vendorKeys.length > 0) {
      if (row.vendorKey === null || !filters.vendorKeys.includes(row.vendorKey)) {
        return false;
      }
    }

    if (!matchesSelection(row.productKey, filters.skuKeys)) {
      return false;
    }

    if (!matchesSelection(row.shape, filters.shape?.toUpperCase())) {
      return false;
    }

    if (!matchesSelection(row.size, filters.size)) {
      return false;
    }

    if (!matchesSelection(row.color, filters.color)) {
      return false;
    }

    if (!matchesSelection(row.clarity, filters.clarity)) {
      return false;
    }

    if (!matchesSelection(row.productType, filters.productType)) {
      return false;
    }

    if (filters.dateRange?.from && row.date < filters.dateRange.from) {
      return false;
    }

    if (filters.dateRange?.to && row.date > filters.dateRange.to) {
      return false;
    }

    return true;
  });
}

function buildReturnRateBreakdown(
  returnRows: LumexReturnRow[],
  salesRows: LumexAnalyticsRow[],
  groupByReturn: (row: LumexReturnRow) => string,
  groupBySales: (row: LumexAnalyticsRow) => string,
  labelBy: (key: string) => string
) {
  const numerators = new Map<string, number>();
  const denominators = new Map<string, number>();

  for (const row of returnRows) {
    const key = groupByReturn(row);
    numerators.set(key, (numerators.get(key) ?? 0) + row.returnValue);
  }

  for (const row of salesRows) {
    const key = groupBySales(row);
    denominators.set(key, (denominators.get(key) ?? 0) + row.salesValue);
  }

  return [...numerators.entries()]
    .map(([key, value]) => ({
      key,
      label: labelBy(key),
      value: round(conversionRate(value, denominators.get(key) ?? 0) * 100)
    }))
    .sort((left, right) => right.value - left.value);
}

function buildPareto(items: BreakdownItem[]): ParetoBreakdownItem[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let running = 0;

  return items.map((item) => {
    running += item.value;
    return {
      ...item,
      cumulativePercent: total === 0 ? 0 : round((running / total) * 100)
    };
  });
}

function buildHeatmap(rows: LumexAnalyticsRow[]): HeatmapMatrix {
  const cellTotals = new Map<string, { rowKey: string; columnKey: string; value: number }>();

  for (const row of rows) {
    const rowKey = `${row.shape}|${row.size}`;
    const columnKey = `${row.color}|${row.clarity}`;
    const cellKey = `${rowKey}::${columnKey}`;
    const current = cellTotals.get(cellKey);
    const quantity = Math.max(row.quantity, 0);

    if (current) {
      current.value += quantity;
      continue;
    }

    cellTotals.set(cellKey, { rowKey, columnKey, value: quantity });
  }

  const topCells = [...cellTotals.values()]
    .sort((left, right) => {
      if (right.value !== left.value) {
        return right.value - left.value;
      }

      return `${left.rowKey}::${left.columnKey}`.localeCompare(`${right.rowKey}::${right.columnKey}`);
    })
    .slice(0, 10);
  const rowTotals = new Map<string, number>();
  const columnTotals = new Map<string, number>();

  for (const cell of topCells) {
    rowTotals.set(cell.rowKey, (rowTotals.get(cell.rowKey) ?? 0) + cell.value);
    columnTotals.set(cell.columnKey, (columnTotals.get(cell.columnKey) ?? 0) + cell.value);
  }

  const rowKeys = [...rowTotals.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([key]) => key);
  const columnKeys = [...columnTotals.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([key]) => key);
  const matrix = rowKeys.map(() => columnKeys.map(() => 0));
  const rowIndex = new Map(rowKeys.map((key, index) => [key, index]));
  const columnIndex = new Map(columnKeys.map((key, index) => [key, index]));

  for (const cell of topCells) {
    const currentRow = rowIndex.get(cell.rowKey);
    const currentColumn = columnIndex.get(cell.columnKey);
    if (currentRow === undefined || currentColumn === undefined) {
      continue;
    }

    const rowValues = matrix[currentRow];
    if (!rowValues) {
      continue;
    }

    rowValues[currentColumn] = cell.value;
  }

  return {
    rowLabels: rowKeys.map((key) => key.replace("|", " / ")),
    columnLabels: columnKeys.map((key) => key.replace("|", " / ")),
    values: matrix
  };
}

function applyExecutiveScope(scope: ResolvedScope, filters: DashboardFiltersInput) {
  const useGlobalTotalsView =
    scope.user.analyticsRole === "sub_admin" && filters.viewMode === "global_totals";
  const effectiveScope = useGlobalTotalsView
    ? {
        ...scope,
        warehouseKeys: "ALL" as const,
        buyerKeys: "ALL" as const,
        subAdminKeys: "ALL" as const
      }
    : scope;
  const normalizedFilters = useGlobalTotalsView
    ? {
        ...filters,
        warehouseKeys: undefined,
        buyerKeys: undefined,
        subAdminKeys: undefined
      }
    : filters;

  return applyScopeToFilters(effectiveScope, normalizedFilters);
}

export class ExecutiveDashboardService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly kpiTargetService: KpiTargetService,
    private readonly analyticsStore = env.ANALYTICS_STORE
  ) {}

  private async getMongoSummary(
    sourceUserId: number,
    scope: ResolvedScope,
    filters: DashboardFiltersInput
  ): Promise<ExecutiveDashboardResponse> {
    const db = await getMongoDb();
    const metadata = await getDatasetMetadataMongo(db);
    const scoped = applyExecutiveScope(scope, filters);
    const previousRange = previousDateRangeWithBounds(scoped.filters, metadata.minDate, metadata.maxDate);
    const previousFilters = {
      ...scoped.filters,
      dateRange: {
        from: previousRange.from,
        to: previousRange.to
      }
    };
    const [currentRows, currentInventory, previousRows, currentReturnRows, previousReturnRows, maps] = await Promise.all([
      filterAnalyticsRowsMongo(db, scoped.filters),
      filterInventoryRowsMongo(db, scoped.filters),
      filterAnalyticsRowsMongo(db, previousFilters),
      filterReturnRowsMongo(db, scoped.filters),
      filterReturnRowsMongo(db, previousFilters),
      getDimensionMapsMongo(db)
    ]);
    const currentSalesRows = currentRows.filter((row) => row.sourceType === "sales");
    const previousSalesRows = previousRows.filter((row) => row.sourceType === "sales");
    const currentPurchaseRows = currentRows.filter((row) => row.purchaseValue > 0);
    const previousPurchaseRows = previousRows.filter((row) => row.purchaseValue > 0);
    const currentMemoRows = currentRows.filter((row) => row.memoGivenValue > 0);
    const previousMemoRows = previousRows.filter((row) => row.memoGivenValue > 0);
    const currentReturnDocumentIds = new Set(currentReturnRows.map((row) => row.documentId));
    const previousReturnDocumentIds = new Set(previousReturnRows.map((row) => row.documentId));
    const [currentSalesSummary, previousSalesSummary, currentReturnDocuments, previousReturnDocuments, returnsCount] = await Promise.all([
      summarizeSalesDocumentsMongo(db, currentSalesRows.map((row) => row.documentId)),
      summarizeSalesDocumentsMongo(db, previousSalesRows.map((row) => row.documentId)),
      getReturnDocumentsByIdsMongo(db, currentReturnDocumentIds),
      getReturnDocumentsByIdsMongo(db, previousReturnDocumentIds),
      db.collection("analytics_return_documents").estimatedDocumentCount()
    ]);
    const currentSalesDocuments = await getSalesDocumentsByIdsMongo(db, currentSalesRows.map((row) => row.documentId));
    const totalSales = currentSalesSummary.total;
    const totalReturns = round(currentReturnDocuments.reduce((sum, document) => sum + document.totalValue, 0));
    const totalPurchase = round(sumRows(currentPurchaseRows, "purchaseValue"));
    const totalRevenueCost = round(sumRows(currentRows, "revenueCostValue"));
    const previousSales = previousSalesSummary.total;
    const previousReturns = round(previousReturnDocuments.reduce((sum, document) => sum + document.totalValue, 0));
    const previousPurchase = round(sumRows(previousPurchaseRows, "purchaseValue"));
    const previousRevenueCost = round(sumRows(previousRows, "revenueCostValue"));
    const netRevenue = round(totalSales - totalReturns - totalRevenueCost);
    const previousNetRevenue = round(previousSales - previousReturns - previousRevenueCost);
    const currentOrderCount = currentSalesSummary.count;
    const previousOrderCount = previousSalesSummary.count;
    const avgOrderValue = currentOrderCount === 0 ? 0 : round(totalSales / currentOrderCount);
    const previousAvgOrderValue = previousOrderCount === 0 ? 0 : round(previousSales / previousOrderCount);
    const currentFulfilment = summarizeFulfilment(currentRows);
    const previousFulfilment = summarizeFulfilment(previousRows);
    const convertedMemoCount = currentMemoRows.filter((row) => row.memoConvertedValue > 0).length;
    const previousConvertedMemoCount = previousMemoRows.filter((row) => row.memoConvertedValue > 0).length;
    const returnRate = round(conversionRate(totalReturns, totalSales) * 100);
    const previousReturnRate = round(conversionRate(previousReturns, previousSales) * 100);
    const memoConversionPct = round(conversionRate(convertedMemoCount, currentMemoRows.length) * 100);
    const previousMemoConversionPct = round(conversionRate(previousConvertedMemoCount, previousMemoRows.length) * 100);
    const buyerKeysInScope = [
      ...new Set(currentRows.filter((row) => row.buyerKey !== null).map((row) => row.buyerKey as number))
    ];
    const visibleVerifiedBuyerCount = buyerKeysInScope.filter((buyerKey) => metadata.verifiedBuyerKeys.includes(buyerKey)).length;
    const kpis: ExecutiveKpi[] = [
      { key: "totalSales", label: "Total Sales", value: totalSales, unit: "currency", changePct: percentChange(totalSales, previousSales) },
      { key: "totalPurchase", label: "Total Purchase", value: totalPurchase, unit: "currency", changePct: percentChange(totalPurchase, previousPurchase) },
      { key: "netRevenue", label: "Net Revenue", value: netRevenue, unit: "currency", changePct: percentChange(netRevenue, previousNetRevenue) },
      { key: "avgOrderValue", label: "Avg Order Value", value: avgOrderValue, unit: "currency", changePct: percentChange(avgOrderValue, previousAvgOrderValue) },
      { key: "ordersCount", label: "Orders Count", value: currentOrderCount, unit: "count", changePct: percentChange(currentOrderCount, previousOrderCount) },
      { key: "memoConversionRate", label: "Memo Conversion %", value: memoConversionPct, unit: "percent", changePct: percentChange(memoConversionPct, previousMemoConversionPct), note: "Stock-linked conversion" },
      { key: "fulfilmentRatio", label: "Fulfilment Ratio", value: currentFulfilment.rate, unit: "percent", changePct: percentChange(currentFulfilment.rate, previousFulfilment.rate), note: "Stones QC passed, loose pcs available, own shape shipped" },
      { key: "returnRate", label: "Return %", value: returnRate, unit: "percent", changePct: percentChange(returnRate, previousReturnRate) },
      { key: "totalBuyers", label: "Total Buyers", value: metadata.buyerMasterCount, unit: "count", changePct: 0 },
      { key: "verifiedBuyers", label: "Verified Buyers", value: metadata.verifiedBuyerMasterCount, unit: "count", changePct: 0 },
      { key: "totalVendors", label: "Total Vendors", value: metadata.vendorMasterCount, unit: "count", changePct: 0 },
      { key: "verifiedVendors", label: "Verified Vendors", value: metadata.verifiedVendorMasterCount, unit: "count", changePct: 0 }
    ];
    const currentRange = scoped.filters.dateRange ?? { from: metadata.minDate, to: metadata.maxDate };
    const totalSalesTarget = await this.kpiTargetService.getApplicableTarget(
      sourceUserId,
      scope,
      { ...scoped.filters, dateRange: currentRange },
      "totalSales"
    );
    if (totalSalesTarget) {
      const totalSalesKpi = kpis.find((kpi) => kpi.key === "totalSales");
      if (totalSalesKpi) {
        totalSalesKpi.targetValue = totalSalesTarget.targetValue;
        totalSalesKpi.targetScope = totalSalesTarget.scope;
        totalSalesKpi.targetDateRange = totalSalesTarget.dateRange;
        totalSalesKpi.targetVariance = round(totalSales - totalSalesTarget.targetValue);
      }
    }

    const trendDates = enumerateDates(currentRange.from, currentRange.to);
    const salesDocumentById = new Map(currentSalesDocuments.map((document) => [document.documentId, document]));
    const dateBySalesDocumentId = new Map<string, string>();
    for (const row of currentSalesRows) {
      if (!dateBySalesDocumentId.has(row.documentId)) {
        dateBySalesDocumentId.set(row.documentId, row.date);
      }
    }
    const salesByDate = new Map<string, number>();
    for (const [documentId, date] of dateBySalesDocumentId.entries()) {
      salesByDate.set(date, round((salesByDate.get(date) ?? 0) + (salesDocumentById.get(documentId)?.totalValue ?? 0)));
    }
    const ordersByDate = distinctCountByDate(currentSalesRows, (row) => row.date, (row) => row.documentId);
    const purchaseByDate = sumRowsByDate(currentPurchaseRows, "purchaseValue");
    const returnValueByDate = new Map<string, number>();
    for (const document of currentReturnDocuments) {
      returnValueByDate.set(document.date, round((returnValueByDate.get(document.date) ?? 0) + document.totalValue));
    }
    const salesTrend = {
      categories: trendDates,
      sales: trendDates.map((date) => salesByDate.get(date) ?? 0),
      purchase: trendDates.map((date) => purchaseByDate.get(date) ?? 0),
      orders: trendDates.map((date) => ordersByDate.get(date) ?? 0),
      buyers: trendDates.map(() => visibleVerifiedBuyerCount)
    };
    const returnTrend = {
      categories: trendDates,
      values: trendDates.map((date) => returnValueByDate.get(date) ?? 0)
    };
    const buyerName = (buyerKey: number | null) => buyerKey === null ? "Unassigned" : maps.buyers.get(buyerKey)?.name ?? `Buyer ${buyerKey}`;
    const warehouseName = (warehouseKey: number | null) => warehouseKey === null ? "Unassigned" : maps.warehouses.get(warehouseKey)?.name ?? `Warehouse ${warehouseKey}`;
    const vendorName = (vendorKey: number | null) => vendorKey === null ? "Unassigned" : maps.vendors.get(vendorKey)?.name ?? `Vendor ${vendorKey}`;
    const subAdminName = (subAdminKey: number | null) => subAdminKey === null ? "Unassigned" : maps.subAdmins.get(subAdminKey)?.name ?? `Sub Admin ${subAdminKey}`;
    const byWarehouse = topN(buildBreakdown(currentSalesRows, (row) => String(row.warehouseKey), (key) => warehouseName(key === "null" ? null : Number(key)), (row) => row.salesValue), 8);
    const byVendor = topN(buildBreakdown(currentSalesRows.filter((row) => row.vendorKey !== null), (row) => String(row.vendorKey), (key) => vendorName(Number(key)), (row) => row.salesValue), 8);
    const byBuyer = topN(buildBreakdown(currentSalesRows.filter((row) => row.buyerKey !== null), (row) => String(row.buyerKey), (key) => buyerName(Number(key)), (row) => row.salesValue), 10);
    const ordersByCountry = topN(buildBreakdown([...new Map(currentSalesRows.map((row) => [row.documentId, row])).values()], (row) => maps.buyers.get(row.buyerKey ?? -1)?.country ?? "Unknown", (key) => key, () => 1), 6);
    const buyersByCountry = topN(buildBreakdown(buyerKeysInScope.map((buyerKey) => ({ buyerKey, country: maps.buyers.get(buyerKey)?.country ?? "Unknown" })), (row) => row.country, (key) => key, () => 1), 6);
    const vendorKeysInScope = [...new Set(currentRows.filter((row) => row.vendorKey !== null).map((row) => row.vendorKey as number))];
    const vendorsByCountry = topN(buildBreakdown(vendorKeysInScope.map((vendorKey) => ({ vendorKey, country: maps.vendors.get(vendorKey)?.country ?? "Unknown" })), (row) => row.country, (key) => key, () => 1), 6);
    const inStockInventory = currentInventory.filter((row) => row.inStock);
    const verifiedInStockInventory = inStockInventory.filter((row) => row.isVerify);
    const notVerifiedInStockInventory = inStockInventory.filter((row) => !row.isVerify);
    const inventoryByWarehouse = buildBreakdown(inStockInventory, (row) => String(row.warehouseKey), (key) => warehouseName(key === "null" ? null : Number(key)), () => 1);
    const inventoryAging = [
      { key: "0-30", label: "0-30 days", value: 0 },
      { key: "31-60", label: "31-60 days", value: 0 },
      { key: "61-90", label: "61-90 days", value: 0 },
      { key: "91-180", label: "91-180 days", value: 0 },
      { key: "180+", label: "180+ days", value: 0 }
    ];
    const today = new Date();
    for (const stock of inStockInventory) {
      const age = Math.floor((today.getTime() - toUtcDate(stock.createdAt).getTime()) / 86400000);
      const bucket = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : age <= 180 ? 3 : 4;
      const agingBucket = inventoryAging[bucket];
      if (agingBucket) agingBucket.value += 1;
    }
    const movementFunnel: BreakdownItem[] = [
      { key: "inventory", label: "Inventory", value: distinctCount(inStockInventory, (row) => row.stockNumber) },
      { key: "memo", label: "Memo", value: distinctCount(currentMemoRows, (row) => row.stockNumber) },
      { key: "order", label: "Order", value: distinctCount(currentSalesRows, (row) => row.stockNumber) },
      { key: "return", label: "Return", value: distinctCount(currentReturnRows, (row) => row.stockNumber) }
    ];
    const memoConversionByBuyer = topN(buildRateBreakdown(currentMemoRows.filter((row) => row.buyerKey !== null), (row) => String(row.buyerKey), (key) => buyerName(Number(key))), 8);
    const memoConversionByWarehouse = topN(buildRateBreakdown(currentMemoRows, (row) => String(row.warehouseKey), (key) => warehouseName(key === "null" ? null : Number(key))), 8);
    const buyerSalesBreakdown = topN(buildBreakdown(currentSalesRows.filter((row) => row.buyerKey !== null), (row) => String(row.buyerKey), (key) => buyerName(Number(key)), (row) => row.salesValue), 12);
    const subAdminSalesBreakdown = topN(buildBreakdown(currentSalesRows.filter((row) => row.subAdminKey !== null), (row) => String(row.subAdminKey), (key) => subAdminName(Number(key)), (row) => row.salesValue), 8);
    const hasSkuAttributes = (row: MongoAnalyticsRow) => row.shape && row.size && row.color && row.clarity;
    const certifiedMemoRows = currentRows.filter((row) => hasSkuAttributes(row) && (row.productType === "stone" || row.productType === "memo"));
    const looseLotsRows = currentRows.filter((row) => hasSkuAttributes(row) && row.productType === "loose_lot");
    const ownShapeRows = currentRows.filter((row) => hasSkuAttributes(row) && row.productType === "own_shape");
    const skuRows = currentSalesRows.filter((row) => hasSkuAttributes(row));
    const productName = (row: MongoAnalyticsRow) => maps.products.get(row.productKey)?.name ?? `${row.shape} ${row.size} ${row.color} ${row.clarity}`;
    const certifiedMemoMatrix = buildHeatmap(certifiedMemoRows);
    const certifiedMemoSalesBySku = topN(buildBreakdown(certifiedMemoRows.filter((row) => row.salesValue > 0), productName, (key) => key, (row) => row.salesValue), 10);
    const looseLotsMatrix = buildHeatmap(looseLotsRows);
    const looseLotsSalesBySku = topN(buildBreakdown(looseLotsRows.filter((row) => row.salesValue > 0), productName, (key) => key, (row) => row.salesValue), 10);
    const ownShapeMatrix = buildHeatmap(ownShapeRows);
    const ownShapeSalesBySku = topN(buildBreakdown(ownShapeRows.filter((row) => row.salesValue > 0), productName, (key) => key, (row) => row.salesValue), 10);
    const topCombinations = topN(buildBreakdown(skuRows, (row) => `${row.shape} / ${row.size} / ${row.color} / ${row.clarity}`, (key) => key, (row) => row.salesValue), 10);
    const purchaseVsSalesByVendor = topN(buildDualValueBreakdown(currentRows.filter((row) => row.vendorKey !== null), (row) => String(row.vendorKey), (key) => vendorName(Number(key))), 8);
    const fulfilmentByType = buildFulfilmentBreakdown(currentRows);
    const qcStatus = buildBreakdown(currentRows.filter((row) => {
      const normalized = row.qcStatus.trim().toLowerCase();
      return normalized.length > 0 && normalized !== "unknown" && normalized !== "success" && normalized !== "pending";
    }), (row) => row.qcStatus, (key) => key, () => 1);
    const returnsAvailable = returnsCount > 0;
    const returnSummary = {
      totalValue: totalReturns,
      orderCount: currentReturnDocuments.length,
      quantity: round(currentReturnRows.reduce((sum, row) => sum + row.quantity, 0)),
      netSalesAfterReturns: round(totalSales - totalReturns)
    };
    const returnsByBuyer = topN(buildReturnRateBreakdown(currentReturnRows.filter((row) => row.buyerKey !== null), currentSalesRows.filter((row) => row.buyerKey !== null), (row) => String(row.buyerKey), (row) => String(row.buyerKey), (key) => buyerName(Number(key))), 8);
    const returnsByVendor = topN(buildReturnRateBreakdown(currentReturnRows.filter((row) => row.vendorKey !== null), currentSalesRows.filter((row) => row.vendorKey !== null), (row) => String(row.vendorKey), (row) => String(row.vendorKey), (key) => vendorName(Number(key))), 8);
    const returnsByWarehouse = topN(buildReturnRateBreakdown(currentReturnRows, currentSalesRows, (row) => String(row.warehouseKey), (row) => String(row.warehouseKey), (key) => warehouseName(key === "null" ? null : Number(key))), 8);
    const returnsByReason = topN(buildBreakdown(currentReturnDocuments, (document) => document.reason, (key) => key, () => 1), 8);
    const returnsByRefundMethod = topN(buildBreakdown(currentReturnDocuments, (document) => document.refundMethod, (key) => key, () => 1), 6);
    const returnsByReturnType = topN(buildBreakdown(currentReturnDocuments, (document) => document.returnType, (key) => key, () => 1), 6);
    const returnsQcStatus = topN(buildBreakdown(currentReturnRows, (row) => row.qcStatus, (key) => key, (row) => row.quantity), 8);
    const alerts: ExecutiveAlert[] = [];
    const aging180Plus = inventoryAging[4]?.value ?? 0;
    if ((kpis[0]?.changePct ?? 0) <= -15) {
      alerts.push({ id: "sales-down", tone: "critical", title: "Sales dropped sharply", detail: "Total sales are down more than 15% versus the previous comparison period." });
    }
    if (aging180Plus > 0) {
      alerts.push({ id: "aging-stock", tone: "warning", title: "Aging inventory detected", detail: `${aging180Plus} in-stock stones are older than 180 days.` });
    }
    if (returnsAvailable && returnRate >= 5) {
      alerts.push({ id: "returns-high", tone: "warning", title: "Return exposure is elevated", detail: `Return value is ${returnRate}% of sales for the selected period.` });
    }

    return {
      lastUpdatedAt: new Date().toISOString(),
      appliedScope: scoped.appliedScope,
      comparisonLabel: previousRange.label,
      dataAvailability: { returns: returnsAvailable, verifiedBuyers: metadata.hasUserVerificationData },
      kpis,
      salesTrend,
      revenueDistribution: { byWarehouse, byVendor, byBuyer, ordersByCountry, buyersByCountry, vendorsByCountry },
      inventory: {
        inStockStones: inStockInventory.length,
        verifiedStones: verifiedInStockInventory.length,
        notVerifiedStones: notVerifiedInStockInventory.length,
        byWarehouse: inventoryByWarehouse,
        aging: inventoryAging.map((item) => ({ ...item, value: round(item.value) })),
        movementFunnel
      },
      memoConversion: {
        funnel: [
          { key: "memo", label: "Memo", value: currentMemoRows.length },
          { key: "converted", label: "Order", value: convertedMemoCount }
        ],
        byBuyer: memoConversionByBuyer,
        byWarehouse: memoConversionByWarehouse
      },
      buyerPerformance: { byBuyer: buyerSalesBreakdown, bySubAdmin: subAdminSalesBreakdown, pareto: buildPareto(buyerSalesBreakdown) },
      skuPerformance: {
        certifiedMemoMatrix,
        certifiedMemoSalesBySku,
        looseLotsMatrix,
        looseLotsSalesBySku,
        ownShapeMatrix,
        ownShapeSalesBySku,
        topCombinations
      },
      purchaseVendor: { purchaseVsSalesByVendor, fulfilmentByType, qcStatus },
      returns: {
        available: returnsAvailable,
        note: returnsAvailable ? undefined : "Return source is not yet available in the current approved dataset.",
        summary: returnSummary,
        trend: returnTrend,
        byBuyer: returnsByBuyer,
        byVendor: returnsByVendor,
        byWarehouse: returnsByWarehouse,
        byReason: returnsByReason,
        byRefundMethod: returnsByRefundMethod,
        byReturnType: returnsByReturnType,
        qcStatus: returnsQcStatus
      },
      alerts
    };
  }

  async getSummary(
    sourceUserId: number,
    filters: DashboardFiltersInput
  ): Promise<ExecutiveDashboardResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (this.analyticsStore === "mongo") {
      return this.getMongoSummary(sourceUserId, scope, filters);
    }

    const scoped = applyExecutiveScope(scope, filters);
    const currentRows = filterAnalyticsRows(scoped.filters);
    const currentInventory = filterInventoryRows(scoped.filters);
    const previousRange = previousDateRange(scoped.filters);
    const previousRows = filterAnalyticsRows({
      ...scoped.filters,
      dateRange: {
        from: previousRange.from,
        to: previousRange.to
      }
    });
    const currentReturnRows = filterReturnRows(scoped.filters);
    const previousReturnRows = filterReturnRows({
      ...scoped.filters,
      dateRange: {
        from: previousRange.from,
        to: previousRange.to
      }
    });
    const currentSalesRows = currentRows.filter((row) => row.sourceType === "sales");
    const previousSalesRows = previousRows.filter((row) => row.sourceType === "sales");
    const currentPurchaseRows = currentRows.filter((row) => row.purchaseValue > 0);
    const previousPurchaseRows = previousRows.filter((row) => row.purchaseValue > 0);
    const currentMemoRows = currentRows.filter((row) => row.memoGivenValue > 0);
    const previousMemoRows = previousRows.filter((row) => row.memoGivenValue > 0);
    const currentReturnDocumentIds = new Set(currentReturnRows.map((row) => row.documentId));
    const previousReturnDocumentIds = new Set(previousReturnRows.map((row) => row.documentId));
    const currentReturnDocuments = getLumexDataset().returnDocuments.filter((document) =>
      currentReturnDocumentIds.has(document.documentId)
    );
    const previousReturnDocuments = getLumexDataset().returnDocuments.filter((document) =>
      previousReturnDocumentIds.has(document.documentId)
    );
    const currentSalesSummary = summarizeSalesDocuments(currentSalesRows.map((row) => row.documentId));
    const previousSalesSummary = summarizeSalesDocuments(previousSalesRows.map((row) => row.documentId));
    const totalSales = currentSalesSummary.total;
    const totalReturns = round(currentReturnDocuments.reduce((sum, document) => sum + document.totalValue, 0));
    const totalPurchase = round(sumRows(currentPurchaseRows, "purchaseValue"));
    const totalRevenueCost = round(sumRows(currentRows, "revenueCostValue"));
    const previousSales = previousSalesSummary.total;
    const previousReturns = round(previousReturnDocuments.reduce((sum, document) => sum + document.totalValue, 0));
    const previousPurchase = round(sumRows(previousPurchaseRows, "purchaseValue"));
    const previousRevenueCost = round(sumRows(previousRows, "revenueCostValue"));
    const netRevenue = round(totalSales - totalReturns - totalRevenueCost);
    const previousNetRevenue = round(
      previousSales - previousReturns - previousRevenueCost
    );
    const currentOrderCount = currentSalesSummary.count;
    const previousOrderCount = previousSalesSummary.count;
    const avgOrderValue = currentOrderCount === 0 ? 0 : round(totalSales / currentOrderCount);
    const previousAvgOrderValue = previousOrderCount === 0 ? 0 : round(previousSales / previousOrderCount);
    const currentFulfilment = summarizeFulfilment(currentRows);
    const previousFulfilment = summarizeFulfilment(previousRows);
    const convertedMemoCount = currentMemoRows.filter((row) => row.memoConvertedValue > 0).length;
    const previousConvertedMemoCount = previousMemoRows.filter((row) => row.memoConvertedValue > 0).length;
    const returnRate = round(conversionRate(totalReturns, totalSales) * 100);
    const previousReturnRate = round(conversionRate(previousReturns, previousSales) * 100);
    const memoConversionPct = round(conversionRate(convertedMemoCount, currentMemoRows.length) * 100);
    const previousMemoConversionPct = round(
      conversionRate(previousConvertedMemoCount, previousMemoRows.length) * 100
    );
    const buyerKeysInScope = [
      ...new Set(currentRows.filter((row) => row.buyerKey !== null).map((row) => row.buyerKey as number))
    ];
    const dataset = getLumexDataset();
    const verifiedBuyerKeys = new Set(dataset.verifiedBuyerKeys);
    const visibleVerifiedBuyerCount = buyerKeysInScope.filter((buyerKey) => verifiedBuyerKeys.has(buyerKey)).length;
    const kpis: ExecutiveKpi[] = [
      {
        key: "totalSales",
        label: "Total Sales",
        value: totalSales,
        unit: "currency",
        changePct: percentChange(totalSales, previousSales)
      },
      {
        key: "totalPurchase",
        label: "Total Purchase",
        value: totalPurchase,
        unit: "currency",
        changePct: percentChange(totalPurchase, previousPurchase)
      },
      {
        key: "netRevenue",
        label: "Net Revenue",
        value: netRevenue,
        unit: "currency",
        changePct: percentChange(netRevenue, previousNetRevenue)
      },
      {
        key: "avgOrderValue",
        label: "Avg Order Value",
        value: avgOrderValue,
        unit: "currency",
        changePct: percentChange(avgOrderValue, previousAvgOrderValue)
      },
      {
        key: "ordersCount",
        label: "Orders Count",
        value: currentOrderCount,
        unit: "count",
        changePct: percentChange(currentOrderCount, previousOrderCount)
      },
      {
        key: "memoConversionRate",
        label: "Memo Conversion %",
        value: memoConversionPct,
        unit: "percent",
        changePct: percentChange(memoConversionPct, previousMemoConversionPct),
        note: "Stock-linked conversion"
      },
      {
        key: "fulfilmentRatio",
        label: "Fulfilment Ratio",
        value: currentFulfilment.rate,
        unit: "percent",
        changePct: percentChange(currentFulfilment.rate, previousFulfilment.rate),
        note: "Stones QC passed, loose pcs available, own shape shipped"
      },
      {
        key: "returnRate",
        label: "Return %",
        value: returnRate,
        unit: "percent",
        changePct: percentChange(returnRate, previousReturnRate)
      },
      {
        key: "totalBuyers",
        label: "Total Buyers",
        value: dataset.buyerMasterCount,
        unit: "count",
        changePct: 0
      },
      {
        key: "verifiedBuyers",
        label: "Verified Buyers",
        value: dataset.verifiedBuyerMasterCount,
        unit: "count",
        changePct: 0
      },
      {
        key: "totalVendors",
        label: "Total Vendors",
        value: dataset.vendorMasterCount,
        unit: "count",
        changePct: 0
      },
      {
        key: "verifiedVendors",
        label: "Verified Vendors",
        value: dataset.verifiedVendorMasterCount,
        unit: "count",
        changePct: 0
      }
    ];

    const currentRange = scoped.filters.dateRange ?? {
      from: getLumexDataset().minDate,
      to: getLumexDataset().maxDate
    };
    const totalSalesTarget = await this.kpiTargetService.getApplicableTarget(
      sourceUserId,
      scope,
      { ...scoped.filters, dateRange: currentRange },
      "totalSales"
    );
    if (totalSalesTarget) {
      const totalSalesKpi = kpis.find((kpi) => kpi.key === "totalSales");
      if (totalSalesKpi) {
        totalSalesKpi.targetValue = totalSalesTarget.targetValue;
        totalSalesKpi.targetScope = totalSalesTarget.scope;
        totalSalesKpi.targetDateRange = totalSalesTarget.dateRange;
        totalSalesKpi.targetVariance = round(totalSales - totalSalesTarget.targetValue);
      }
    }

    const trendDates = enumerateDates(currentRange.from, currentRange.to);
    const salesByDate = sumSalesDocumentsByDate(currentSalesRows);
    const purchaseByDate = sumRowsByDate(currentPurchaseRows, "purchaseValue");
    const ordersByDate = distinctSalesDocumentsByDate(currentSalesRows);
    const returnValueByDate = sumReturnDocumentsByDate(currentReturnRows);
    const salesTrend = {
      categories: trendDates,
      sales: trendDates.map((date) => salesByDate.get(date) ?? 0),
      purchase: trendDates.map((date) => purchaseByDate.get(date) ?? 0),
      orders: trendDates.map((date) => ordersByDate.get(date) ?? 0),
      buyers: trendDates.map(() => visibleVerifiedBuyerCount)
    };
    const returnTrend = {
      categories: trendDates,
      values: trendDates.map((date) => returnValueByDate.get(date) ?? 0)
    };

    const byWarehouse = topN(
      buildBreakdown(
        currentSalesRows,
        (row) => String(row.warehouseKey),
        (key) => getWarehouseName(key === "null" ? null : Number(key)),
        (row) => row.salesValue
      ),
      8
    );
    const byVendor = topN(
      buildBreakdown(
        currentSalesRows.filter((row) => row.vendorKey !== null),
        (row) => String(row.vendorKey),
        (key) => getVendorName(Number(key)),
        (row) => row.salesValue
      ),
      8
    );
    const byBuyer = topN(
      buildBreakdown(
        currentSalesRows.filter((row) => row.buyerKey !== null),
        (row) => String(row.buyerKey),
        (key) => getBuyerName(Number(key)),
        (row) => row.salesValue
      ),
      10
    );

    const ordersByCountry = topN(
      buildBreakdown(
        [...new Map(currentSalesRows.map((row) => [row.documentId, row])).values()],
        (row) => getBuyer(row.buyerKey)?.country ?? "Unknown",
        (key) => key,
        () => 1
      ),
      6
    );
    const buyersByCountry = topN(
      buildBreakdown(
        buyerKeysInScope.map((buyerKey) => ({
          buyerKey,
          country: getBuyer(buyerKey)?.country ?? "Unknown"
        })),
        (row) => row.country,
        (key) => key,
        () => 1
      ),
      6
    );
    const vendorKeysInScope = [
      ...new Set(currentRows.filter((row) => row.vendorKey !== null).map((row) => row.vendorKey as number))
    ];
    const vendorsByCountry = topN(
      buildBreakdown(
        vendorKeysInScope.map((vendorKey) => ({
          vendorKey,
          country: getVendor(vendorKey)?.country ?? "Unknown"
        })),
        (row) => row.country,
        (key) => key,
        () => 1
      ),
      6
    );

    const inStockInventory = currentInventory.filter((row) => row.inStock);
    const verifiedInStockInventory = inStockInventory.filter((row) => row.isVerify);
    const notVerifiedInStockInventory = inStockInventory.filter((row) => !row.isVerify);
    const inventoryByWarehouse = buildBreakdown(
      inStockInventory,
      (row) => String(row.warehouseKey),
      (key) => getWarehouseName(key === "null" ? null : Number(key)),
      () => 1
    );
    const inventoryAging = [
      { key: "0-30", label: "0-30 days", value: 0 },
      { key: "31-60", label: "31-60 days", value: 0 },
      { key: "61-90", label: "61-90 days", value: 0 },
      { key: "91-180", label: "91-180 days", value: 0 },
      { key: "180+", label: "180+ days", value: 0 }
    ];
    const today = new Date();
    for (const stock of inStockInventory) {
      const age = Math.floor((today.getTime() - toUtcDate(stock.createdAt).getTime()) / 86400000);
      const bucket =
        age <= 30 ? 0 :
        age <= 60 ? 1 :
        age <= 90 ? 2 :
        age <= 180 ? 3 :
        4;
      const agingBucket = inventoryAging[bucket];
      if (agingBucket) {
        agingBucket.value += 1;
      }
    }
    const movementFunnel: BreakdownItem[] = [
      { key: "inventory", label: "Inventory", value: distinctCount(inStockInventory, (row) => row.stockNumber) },
      { key: "memo", label: "Memo", value: distinctCount(currentMemoRows, (row) => row.stockNumber) },
      { key: "order", label: "Order", value: distinctCount(currentSalesRows, (row) => row.stockNumber) },
      { key: "return", label: "Return", value: 0 }
    ];

    const memoConversionByBuyer = topN(
      buildRateBreakdown(
        currentMemoRows.filter((row) => row.buyerKey !== null),
        (row) => String(row.buyerKey),
        (key) => getBuyerName(Number(key))
      ),
      8
    );
    const memoConversionByWarehouse = topN(
      buildRateBreakdown(
        currentMemoRows,
        (row) => String(row.warehouseKey),
        (key) => getWarehouseName(key === "null" ? null : Number(key))
      ),
      8
    );

    const buyerSalesBreakdown = topN(
      buildBreakdown(
        currentSalesRows.filter((row) => row.buyerKey !== null),
        (row) => String(row.buyerKey),
        (key) => getBuyerName(Number(key)),
        (row) => row.salesValue
      ),
      12
    );
    const subAdminSalesBreakdown = topN(
      buildBreakdown(
        currentSalesRows.filter((row) => row.subAdminKey !== null),
        (row) => String(row.subAdminKey),
        (key) => getSubAdminName(Number(key)),
        (row) => row.salesValue
      ),
      8
    );

    const hasSkuAttributes = (row: LumexAnalyticsRow) => row.shape && row.size && row.color && row.clarity;
    const certifiedMemoRows = currentRows.filter(
      (row) => hasSkuAttributes(row) && (row.productType === "stone" || row.productType === "memo")
    );
    const looseLotsRows = currentRows.filter(
      (row) => hasSkuAttributes(row) && row.productType === "loose_lot"
    );
    const ownShapeRows = currentRows.filter(
      (row) => hasSkuAttributes(row) && row.productType === "own_shape"
    );
    const skuRows = currentSalesRows.filter((row) => hasSkuAttributes(row));
    const certifiedMemoMatrix = buildHeatmap(certifiedMemoRows);
    const certifiedMemoSalesBySku = topN(
      buildBreakdown(
        certifiedMemoRows.filter((row) => row.salesValue > 0),
        (row) => getProduct(row.productKey)?.name ?? `${row.shape} ${row.size} ${row.color} ${row.clarity}`,
        (key) => key,
        (row) => row.salesValue
      ),
      10
    );
    const looseLotsMatrix = buildHeatmap(looseLotsRows);
    const looseLotsSalesBySku = topN(
      buildBreakdown(
        looseLotsRows.filter((row) => row.salesValue > 0),
        (row) => getProduct(row.productKey)?.name ?? `${row.shape} ${row.size} ${row.color} ${row.clarity}`,
        (key) => key,
        (row) => row.salesValue
      ),
      10
    );
    const ownShapeMatrix = buildHeatmap(ownShapeRows);
    const ownShapeSalesBySku = topN(
      buildBreakdown(
        ownShapeRows.filter((row) => row.salesValue > 0),
        (row) => getProduct(row.productKey)?.name ?? `${row.shape} ${row.size} ${row.color} ${row.clarity}`,
        (key) => key,
        (row) => row.salesValue
      ),
      10
    );
    const topCombinations = topN(
      buildBreakdown(
        skuRows,
        (row) => `${row.shape} / ${row.size} / ${row.color} / ${row.clarity}`,
        (key) => key,
        (row) => row.salesValue
      ),
      10
    );

    const purchaseVsSalesByVendor = topN(
      buildDualValueBreakdown(
        currentRows.filter((row) => row.vendorKey !== null),
        (row) => String(row.vendorKey),
        (key) => getVendorName(Number(key))
      ),
      8
    );
    const fulfilmentByType = buildFulfilmentBreakdown(currentRows);
    const qcStatus = buildBreakdown(
      currentRows.filter((row) => {
        const normalized = row.qcStatus.trim().toLowerCase();
        return normalized.length > 0 &&
          normalized !== "unknown" &&
          normalized !== "success" &&
          normalized !== "pending";
      }),
      (row) => row.qcStatus,
      (key) => key,
      () => 1
    );
    const returnsAvailable = getLumexDataset().returnDocuments.length > 0;
    const returnSummary = {
      totalValue: totalReturns,
      orderCount: currentReturnDocuments.length,
      quantity: round(currentReturnRows.reduce((sum, row) => sum + row.quantity, 0)),
      netSalesAfterReturns: round(totalSales - totalReturns)
    };
    const returnsByBuyer = topN(
      buildReturnRateBreakdown(
        currentReturnRows.filter((row) => row.buyerKey !== null),
        currentSalesRows.filter((row) => row.buyerKey !== null),
        (row) => String(row.buyerKey),
        (row) => String(row.buyerKey),
        (key) => getBuyerName(Number(key))
      ),
      8
    );
    const returnsByVendor = topN(
      buildReturnRateBreakdown(
        currentReturnRows.filter((row) => row.vendorKey !== null),
        currentSalesRows.filter((row) => row.vendorKey !== null),
        (row) => String(row.vendorKey),
        (row) => String(row.vendorKey),
        (key) => getVendorName(Number(key))
      ),
      8
    );
    const returnsByWarehouse = topN(
      buildReturnRateBreakdown(
        currentReturnRows,
        currentSalesRows,
        (row) => String(row.warehouseKey),
        (row) => String(row.warehouseKey),
        (key) => getWarehouseName(key === "null" ? null : Number(key))
      ),
      8
    );
    const returnsByReason = topN(
      buildBreakdown(
        currentReturnDocuments,
        (document) => document.reason,
        (key) => key,
        () => 1
      ),
      8
    );
    const returnsByRefundMethod = topN(
      buildBreakdown(
        currentReturnDocuments,
        (document) => document.refundMethod,
        (key) => key,
        () => 1
      ),
      6
    );
    const returnsByReturnType = topN(
      buildBreakdown(
        currentReturnDocuments,
        (document) => document.returnType,
        (key) => key,
        () => 1
      ),
      6
    );
    const returnsQcStatus = topN(
      buildBreakdown(
        currentReturnRows,
        (row) => row.qcStatus,
        (key) => key,
        (row) => row.quantity
      ),
      8
    );

    const alerts: ExecutiveAlert[] = [];
    const aging180Plus = inventoryAging[4]?.value ?? 0;

    if ((kpis[0]?.changePct ?? 0) <= -15) {
      alerts.push({
        id: "sales-down",
        tone: "critical",
        title: "Sales dropped sharply",
        detail: "Total sales are down more than 15% versus the previous comparison period."
      });
    }

    if (aging180Plus > 0) {
      alerts.push({
        id: "aging-stock",
        tone: "warning",
        title: "Aging inventory detected",
        detail: `${aging180Plus} in-stock stones are older than 180 days.`
      });
    }

    if (returnsAvailable && returnRate >= 5) {
      alerts.push({
        id: "returns-high",
        tone: "warning",
        title: "Return exposure is elevated",
        detail: `Return value is ${returnRate}% of sales for the selected period.`
      });
    }

    return {
      lastUpdatedAt: new Date().toISOString(),
      appliedScope: scoped.appliedScope,
      comparisonLabel: previousRange.label,
      dataAvailability: {
        returns: returnsAvailable,
        verifiedBuyers: dataset.hasUserVerificationData
      },
      kpis,
      salesTrend,
      revenueDistribution: {
        byWarehouse,
        byVendor,
        byBuyer,
        ordersByCountry,
        buyersByCountry,
        vendorsByCountry
      },
      inventory: {
        inStockStones: inStockInventory.length,
        verifiedStones: verifiedInStockInventory.length,
        notVerifiedStones: notVerifiedInStockInventory.length,
        byWarehouse: inventoryByWarehouse,
        aging: inventoryAging.map((item) => ({ ...item, value: round(item.value) })),
        movementFunnel: movementFunnel.map((item) =>
          item.key === "return"
            ? { ...item, value: distinctCount(currentReturnRows, (row) => row.stockNumber) }
            : item
        )
      },
      memoConversion: {
        funnel: [
          { key: "memo", label: "Memo", value: currentMemoRows.length },
          { key: "converted", label: "Order", value: convertedMemoCount }
        ],
        byBuyer: memoConversionByBuyer,
        byWarehouse: memoConversionByWarehouse
      },
      buyerPerformance: {
        byBuyer: buyerSalesBreakdown,
        bySubAdmin: subAdminSalesBreakdown,
        pareto: buildPareto(buyerSalesBreakdown)
      },
      skuPerformance: {
        certifiedMemoMatrix,
        certifiedMemoSalesBySku,
        looseLotsMatrix,
        looseLotsSalesBySku,
        ownShapeMatrix,
        ownShapeSalesBySku,
        topCombinations
      },
      purchaseVendor: {
        purchaseVsSalesByVendor,
        fulfilmentByType,
        qcStatus
      },
      returns: {
        available: returnsAvailable,
        note: returnsAvailable ? undefined : "Return source is not yet available in the current approved dataset.",
        summary: returnSummary,
        trend: returnTrend,
        byBuyer: returnsByBuyer,
        byVendor: returnsByVendor,
        byWarehouse: returnsByWarehouse,
        byReason: returnsByReason,
        byRefundMethod: returnsByRefundMethod,
        byReturnType: returnsByReturnType,
        qcStatus: returnsQcStatus
      },
      alerts
    };
  }
}
