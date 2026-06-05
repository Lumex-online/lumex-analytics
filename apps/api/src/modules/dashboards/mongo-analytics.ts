import type { Db, Document, Filter } from "mongodb";
import type {
  BreakdownItem,
  DashboardFiltersInput,
  DashboardKey,
  ProductOption
} from "@lumex/shared-types";
import type {
  LumexAnalyticsRow,
  LumexInventoryRow,
  LumexReturnDocument,
  LumexReturnRow,
  LumexSalesDocument
} from "@lumex/lumex-source";

export interface MongoEmbeddedBuyer {
  key: number;
  code: string;
  name: string;
  country: string;
  location: string;
  isVerified: boolean;
}

export interface MongoEmbeddedWarehouse {
  key: number;
  code: string;
  name: string;
}

export interface MongoEmbeddedSubAdmin {
  key: number;
  code: string;
  name: string;
}

export interface MongoEmbeddedVendor {
  key: number;
  code: string;
  name: string;
  country: string;
  isVerified: boolean;
}

export interface MongoAnalyticsRow extends LumexAnalyticsRow {
  orderDate: Date;
  sourceTable: string;
  warehouse: MongoEmbeddedWarehouse | null;
  buyer: MongoEmbeddedBuyer | null;
  subAdmin: MongoEmbeddedSubAdmin | null;
  subAdmins: MongoEmbeddedSubAdmin[];
  vendor: MongoEmbeddedVendor | null;
  product: ProductOption;
}

export interface MongoInventoryRow extends LumexInventoryRow {
  itemId: string;
  warehouse: MongoEmbeddedWarehouse | null;
  vendor: MongoEmbeddedVendor | null;
  snapshotAt: Date;
}

export interface MongoReturnRow extends LumexReturnRow {
  orderDate: Date;
  returnDate: Date;
  warehouse: MongoEmbeddedWarehouse | null;
  buyer: MongoEmbeddedBuyer | null;
  subAdmin: MongoEmbeddedSubAdmin | null;
  subAdmins: MongoEmbeddedSubAdmin[];
  vendor: MongoEmbeddedVendor | null;
  product: ProductOption;
}

export interface MongoSalesDocument extends LumexSalesDocument {
  _id: string;
}

export interface MongoReturnDocument extends LumexReturnDocument {
  _id: string;
  orderDate: Date;
}

export interface MongoDatasetMetadata {
  _id: "current";
  buyerMasterCount: number;
  verifiedBuyerMasterCount: number;
  verifiedBuyerKeys: number[];
  vendorMasterCount: number;
  verifiedVendorMasterCount: number;
  verifiedVendorKeys: number[];
  hasUserVerificationData: boolean;
  minDate: string;
  maxDate: string;
}

export interface MongoDimensionMaps {
  buyers: Map<number, MongoEmbeddedBuyer>;
  vendors: Map<number, MongoEmbeddedVendor>;
  warehouses: Map<number, MongoEmbeddedWarehouse>;
  subAdmins: Map<number, MongoEmbeddedSubAdmin>;
  products: Map<number, ProductOption>;
}

function matchesSelection<T>(value: T, selected?: T[] | T) {
  if (Array.isArray(selected)) {
    return selected.length === 0 || selected.includes(value);
  }

  return selected === undefined || selected === value;
}

export function parseDateAtUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function buildFactMatch(filters: DashboardFiltersInput, dateField = "orderDate"): Filter<Document> {
  const match: Filter<Document> = {};

  if (filters.warehouseKeys && filters.warehouseKeys.length > 0) {
    match.warehouseKey = { $in: filters.warehouseKeys };
  }
  if (filters.buyerKeys && filters.buyerKeys.length > 0) {
    match.buyerKey = { $in: filters.buyerKeys };
  }
  if (filters.subAdminKeys && filters.subAdminKeys.length > 0) {
    match.subAdminKeys = { $in: filters.subAdminKeys };
  }
  if (filters.vendorKeys && filters.vendorKeys.length > 0) {
    match.vendorKey = { $in: filters.vendorKeys };
  }
  if (filters.skuKeys && filters.skuKeys.length > 0) {
    match.productKey = { $in: filters.skuKeys };
  }
  if (filters.shape) {
    match.shape = filters.shape.toUpperCase();
  }
  if (filters.size) {
    match.size = filters.size;
  }
  if (filters.color) {
    match.color = filters.color;
  }
  if (filters.clarity) {
    match.clarity = filters.clarity;
  }
  if (filters.productType) {
    match.productType = filters.productType;
  }
  if (filters.status) {
    match.status = filters.status;
  }
  if (filters.dateRange?.from || filters.dateRange?.to) {
    match[dateField] = {
      ...(filters.dateRange.from ? { $gte: parseDateAtUtcMidnight(filters.dateRange.from) } : {}),
      ...(filters.dateRange.to ? { $lte: parseDateAtUtcMidnight(filters.dateRange.to) } : {})
    };
  }

  return match;
}

function buildInventoryMatch(filters: DashboardFiltersInput): Filter<Document> {
  const match: Filter<Document> = {};

  if (filters.warehouseKeys && filters.warehouseKeys.length > 0) {
    match.warehouseKey = { $in: filters.warehouseKeys };
  }
  if (filters.vendorKeys && filters.vendorKeys.length > 0) {
    match.vendorKey = { $in: filters.vendorKeys };
  }
  if (filters.shape) {
    match.shape = filters.shape.toUpperCase();
  }
  if (filters.size) {
    match.size = filters.size;
  }
  if (filters.color) {
    match.color = filters.color;
  }
  if (filters.clarity) {
    match.clarity = filters.clarity;
  }

  return match;
}

export async function filterAnalyticsRowsMongo(db: Db, filters: DashboardFiltersInput): Promise<MongoAnalyticsRow[]> {
  return db.collection<MongoAnalyticsRow>("analytics_rows")
    .find(buildFactMatch(filters))
    .toArray();
}

export async function filterInventoryRowsMongo(db: Db, filters: DashboardFiltersInput): Promise<MongoInventoryRow[]> {
  return db.collection<MongoInventoryRow>("analytics_inventory")
    .find(buildInventoryMatch(filters))
    .toArray();
}

export async function filterReturnRowsMongo(db: Db, filters: DashboardFiltersInput): Promise<MongoReturnRow[]> {
  return db.collection<MongoReturnRow>("analytics_return_rows")
    .find(buildFactMatch(filters))
    .toArray();
}

export async function getDatasetMetadataMongo(db: Db): Promise<MongoDatasetMetadata> {
  const metadata = await db.collection<MongoDatasetMetadata>("analytics_dataset_metadata").findOne({ _id: "current" });
  if (metadata) {
    return metadata;
  }

  return {
    _id: "current",
    buyerMasterCount: 0,
    verifiedBuyerMasterCount: 0,
    verifiedBuyerKeys: [],
    vendorMasterCount: 0,
    verifiedVendorMasterCount: 0,
    verifiedVendorKeys: [],
    hasUserVerificationData: false,
    minDate: "1970-01-01",
    maxDate: "1970-01-01"
  };
}

export async function getDimensionMapsMongo(db: Db): Promise<MongoDimensionMaps> {
  const [buyers, vendors, warehouses, subAdmins, products] = await Promise.all([
    db.collection<MongoEmbeddedBuyer>("analytics_buyers").find({}).toArray(),
    db.collection<MongoEmbeddedVendor>("analytics_vendors").find({}).toArray(),
    db.collection<MongoEmbeddedWarehouse>("analytics_warehouses").find({}).toArray(),
    db.collection<MongoEmbeddedSubAdmin>("analytics_sub_admins").find({}).toArray(),
    db.collection<ProductOption>("analytics_products").find({}).toArray()
  ]);

  return {
    buyers: new Map(buyers.map((buyer) => [buyer.key, buyer])),
    vendors: new Map(vendors.map((vendor) => [vendor.key, vendor])),
    warehouses: new Map(warehouses.map((warehouse) => [warehouse.key, warehouse])),
    subAdmins: new Map(subAdmins.map((subAdmin) => [subAdmin.key, subAdmin])),
    products: new Map(products.map((product) => [product.key, product]))
  };
}

export async function getDistinctRowValuesMongo(db: Db) {
  const [productTypes, statuses] = await Promise.all([
    db.collection("analytics_rows").distinct("productType"),
    db.collection("analytics_rows").distinct("status")
  ]);

  return {
    productTypes: productTypes.filter((value): value is string => typeof value === "string").sort(),
    statuses: statuses.filter((value): value is string => typeof value === "string").sort()
  };
}

export async function getSalesDocumentsByIdsMongo(db: Db, documentIds: Iterable<string>) {
  const ids = [...new Set(documentIds)];
  if (ids.length === 0) {
    return [] as MongoSalesDocument[];
  }

  return db.collection<MongoSalesDocument>("analytics_sales_documents")
    .find({ _id: { $in: ids } })
    .toArray();
}

export async function getReturnDocumentsByIdsMongo(db: Db, documentIds: Iterable<string>) {
  const ids = [...new Set(documentIds)];
  if (ids.length === 0) {
    return [] as MongoReturnDocument[];
  }

  return db.collection<MongoReturnDocument>("analytics_return_documents")
    .find({ _id: { $in: ids } })
    .toArray();
}

export async function summarizeSalesDocumentsMongo(db: Db, documentIds: Iterable<string>) {
  const docs = await getSalesDocumentsByIdsMongo(db, documentIds);
  return {
    total: round(docs.reduce((sum, document) => sum + document.totalValue, 0)),
    tax: round(docs.reduce((sum, document) => sum + document.taxValue, 0)),
    vat: round(docs.reduce((sum, document) => sum + document.vatValue, 0)),
    count: docs.length
  };
}

export function round(value: number) {
  return Number(value.toFixed(2));
}

export function sumRows(
  rows: Pick<
    LumexAnalyticsRow,
    "salesValue" | "purchaseValue" | "revenueCostValue" | "memoGivenValue" | "memoConvertedValue" | "quantity"
  >[],
  field: keyof Pick<
    LumexAnalyticsRow,
    "salesValue" | "purchaseValue" | "revenueCostValue" | "memoGivenValue" | "memoConvertedValue" | "quantity"
  >
) {
  return rows.reduce((sum, row) => sum + row[field], 0);
}

export function conversionRate(rows: Pick<LumexAnalyticsRow, "memoGivenValue" | "memoConvertedValue">[]) {
  const memoGiven = rows.reduce((sum, row) => sum + row.memoGivenValue, 0);
  if (memoGiven === 0) {
    return 0;
  }

  return rows.reduce((sum, row) => sum + row.memoConvertedValue, 0) / memoGiven;
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
    .map(([key, value]) => ({ key, label: labelBy(key), value: round(value) }))
    .sort((left, right) => right.value - left.value);
}

function sortDateBreakdown(rows: MongoAnalyticsRow[], valueBy: (row: MongoAnalyticsRow) => number) {
  const byDate = new Map<string, number>();

  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + valueBy(row));
  }

  return [...byDate.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, value]) => ({ date, value: round(value) }));
}

export function getBuyerNameFromMaps(maps: MongoDimensionMaps, buyerKey: number | null) {
  if (buyerKey === null) {
    return "Unassigned";
  }
  return maps.buyers.get(buyerKey)?.name ?? `Buyer ${buyerKey}`;
}

export function getWarehouseNameFromMaps(maps: MongoDimensionMaps, warehouseKey: number | null) {
  if (warehouseKey === null) {
    return "Unassigned";
  }
  return maps.warehouses.get(warehouseKey)?.name ?? `Warehouse ${warehouseKey}`;
}

export function getSubAdminNameFromMaps(maps: MongoDimensionMaps, subAdminKey: number | null) {
  if (subAdminKey === null) {
    return "Unassigned";
  }
  return maps.subAdmins.get(subAdminKey)?.name ?? `Sub Admin ${subAdminKey}`;
}

export function getVendorNameFromMaps(maps: MongoDimensionMaps, vendorKey: number | null) {
  if (vendorKey === null) {
    return "Unassigned";
  }
  return maps.vendors.get(vendorKey)?.name ?? `Vendor ${vendorKey}`;
}

export function primaryChartForDashboardMongo(
  dashboard: DashboardKey,
  rows: MongoAnalyticsRow[],
  maps: MongoDimensionMaps
) {
  if (dashboard === "buyers") {
    const breakdown = buildBreakdown(
      rows.filter((row) => row.salesValue > 0 && row.buyerKey !== null),
      (row) => String(row.buyerKey),
      (key) => getBuyerNameFromMaps(maps, Number(key)),
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
        name: getWarehouseNameFromMaps(maps, warehouseKey),
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

export function filterReturnRowsInMemory(rows: MongoReturnRow[], filters: DashboardFiltersInput) {
  return rows.filter((row) => {
    if (filters.warehouseKeys && filters.warehouseKeys.length > 0 && (row.warehouseKey === null || !filters.warehouseKeys.includes(row.warehouseKey))) {
      return false;
    }
    if (filters.buyerKeys && filters.buyerKeys.length > 0 && (row.buyerKey === null || !filters.buyerKeys.includes(row.buyerKey))) {
      return false;
    }
    if (filters.subAdminKeys && filters.subAdminKeys.length > 0 && !row.subAdminKeys.some((key) => filters.subAdminKeys?.includes(key))) {
      return false;
    }
    if (filters.vendorKeys && filters.vendorKeys.length > 0 && (row.vendorKey === null || !filters.vendorKeys.includes(row.vendorKey))) {
      return false;
    }
    if (!matchesSelection(row.productKey, filters.skuKeys)) return false;
    if (!matchesSelection(row.shape, filters.shape?.toUpperCase())) return false;
    if (!matchesSelection(row.size, filters.size)) return false;
    if (!matchesSelection(row.color, filters.color)) return false;
    if (!matchesSelection(row.clarity, filters.clarity)) return false;
    if (!matchesSelection(row.productType, filters.productType)) return false;
    if (filters.dateRange?.from && row.date < filters.dateRange.from) return false;
    if (filters.dateRange?.to && row.date > filters.dateRange.to) return false;
    return true;
  });
}
