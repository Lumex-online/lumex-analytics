import type { BreakdownItem, DashboardFiltersInput, DashboardKey } from "@lumex/shared-types";
import {
  getLumexDataset,
  type LumexAnalyticsRow
} from "@lumex/lumex-source";

function matchesSelection<T>(value: T, selected?: T[] | T) {
  if (Array.isArray(selected)) {
    return selected.length === 0 || selected.includes(value);
  }

  return selected === undefined || selected === value;
}

export function filterAnalyticsRows(filters: DashboardFiltersInput) {
  const dataset = getLumexDataset();

  return dataset.rows.filter((row) => {
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

export function filterInventoryRows(filters: DashboardFiltersInput) {
  const dataset = getLumexDataset();

  return dataset.inventory.filter((row) => {
    if (filters.warehouseKeys && filters.warehouseKeys.length > 0) {
      if (row.warehouseKey === null || !filters.warehouseKeys.includes(row.warehouseKey)) {
        return false;
      }
    }

    if (filters.vendorKeys && filters.vendorKeys.length > 0) {
      if (row.vendorKey === null || !filters.vendorKeys.includes(row.vendorKey)) {
        return false;
      }
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

    return true;
  });
}

export function sumRows(
  rows: LumexAnalyticsRow[],
  field: keyof Pick<
    LumexAnalyticsRow,
    "salesValue" | "purchaseValue" | "revenueCostValue" | "memoGivenValue" | "memoConvertedValue" | "quantity"
  >
) {
  return rows.reduce((sum, row) => sum + row[field], 0);
}

export function conversionRate(rows: LumexAnalyticsRow[]) {
  const memoGiven = sumRows(rows, "memoGivenValue");
  if (memoGiven === 0) {
    return 0;
  }

  return sumRows(rows, "memoConvertedValue") / memoGiven;
}

export function getBuyerName(buyerKey: number | null) {
  if (buyerKey === null) {
    return "Unassigned";
  }

  return getLumexDataset().buyers.find((buyer) => buyer.key === buyerKey)?.name ?? `Buyer ${buyerKey}`;
}

export function getBuyer(buyerKey: number | null) {
  if (buyerKey === null) {
    return undefined;
  }

  return getLumexDataset().buyers.find((buyer) => buyer.key === buyerKey);
}

export function getWarehouseName(warehouseKey: number | null) {
  if (warehouseKey === null) {
    return "Unassigned";
  }

  return (
    getLumexDataset().warehouses.find((warehouse) => warehouse.key === warehouseKey)?.name ??
    `Warehouse ${warehouseKey}`
  );
}

export function getSubAdminName(subAdminKey: number | null) {
  if (subAdminKey === null) {
    return "Unassigned";
  }

  return (
    getLumexDataset().subAdmins.find((subAdmin) => subAdmin.key === subAdminKey)?.name ??
    `Sub Admin ${subAdminKey}`
  );
}

export function getVendorName(vendorKey: number | null) {
  if (vendorKey === null) {
    return "Unassigned";
  }

  return getLumexDataset().vendors.find((vendor) => vendor.key === vendorKey)?.name ?? `Vendor ${vendorKey}`;
}

export function getVendor(vendorKey: number | null) {
  if (vendorKey === null) {
    return undefined;
  }

  return getLumexDataset().vendors.find((vendor) => vendor.key === vendorKey);
}

export function getProduct(productKey: number) {
  return getLumexDataset().products.find((product) => product.key === productKey);
}

export function buildBreakdown<T>(
  rows: T[],
  groupBy: (row: T) => string,
  labelBy: (key: string) => string,
  measure: (row: T) => number
): BreakdownItem[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const key = groupBy(row);
    totals.set(key, (totals.get(key) ?? 0) + measure(row));
  }

  return [...totals.entries()]
    .map(([key, value]) => ({ key, label: labelBy(key), value: Number(value.toFixed(2)) }))
    .sort((left, right) => right.value - left.value);
}

function sortDateBreakdown(rows: LumexAnalyticsRow[], valueBy: (row: LumexAnalyticsRow) => number) {
  const byDate = new Map<string, number>();

  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + valueBy(row));
  }

  return [...byDate.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, value]) => ({ date, value: Number(value.toFixed(2)) }));
}

export function primaryChartForDashboard(dashboard: DashboardKey, rows: LumexAnalyticsRow[]) {
  if (dashboard === "buyers") {
    const breakdown = buildBreakdown(
      rows.filter((row) => row.salesValue > 0 && row.buyerKey !== null),
      (row) => String(row.buyerKey),
      (key) => getBuyerName(Number(key)),
      (row) => row.salesValue
    ).slice(0, 8);

    return {
      categories: breakdown.map((entry) => entry.label),
      series: [{ name: "Sales", data: breakdown.map((entry) => entry.value) }]
    };
  }

  if (dashboard === "warehouses") {
    const warehouseKeys = [...new Set(rows.map((row) => row.warehouseKey).filter((value): value is number => value !== null))];
    const totals = warehouseKeys.map((warehouseKey) => {
      const warehouseRows = rows.filter((row) => row.warehouseKey === warehouseKey);
      return {
        warehouseKey,
        name: getWarehouseName(warehouseKey),
        sales: sumRows(warehouseRows, "salesValue"),
        purchase: sumRows(warehouseRows, "purchaseValue"),
        memo: sumRows(warehouseRows, "memoGivenValue")
      };
    }).sort((left, right) => right.sales - left.sales);

    return {
      categories: totals.map((entry) => entry.name),
      series: [
        { name: "Sales", data: totals.map((entry) => entry.sales) },
        { name: "Purchase", data: totals.map((entry) => entry.purchase) },
        { name: "Memo", data: totals.map((entry) => entry.memo) }
      ]
    };
  }

  if (dashboard === "sku_analytics") {
    const byShape = buildBreakdown(
      rows.filter((row) => row.salesValue > 0),
      (row) => row.shape,
      (key) => key,
      (row) => row.salesValue
    );

    return {
      categories: byShape.map((entry) => entry.label),
      series: [{ name: "Sales by Shape", data: byShape.map((entry) => entry.value) }]
    };
  }

  if (dashboard === "memos") {
    const memoTrend = sortDateBreakdown(rows, (row) => row.memoGivenValue);

    return {
      categories: memoTrend.map((entry) => entry.date),
      series: [{ name: "Memo Given", data: memoTrend.map((entry) => entry.value) }]
    };
  }

  const trend = sortDateBreakdown(rows, (row) => row.salesValue);
  const purchaseByDate = new Map(sortDateBreakdown(rows, (row) => row.purchaseValue).map((entry) => [entry.date, entry.value]));

  return {
    categories: trend.map((entry) => entry.date),
    series: [
      { name: "Sales", data: trend.map((entry) => entry.value) },
      { name: "Purchase", data: trend.map((entry) => purchaseByDate.get(entry.date) ?? 0) }
    ]
  };
}
