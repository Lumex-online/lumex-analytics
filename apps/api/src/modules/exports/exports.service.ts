import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import { applyScopeToFilters } from "@lumex/analytics-core";
import type { DashboardFiltersInput, ResolvedScope } from "@lumex/shared-types";
import { ObjectId, type Document, type Filter } from "mongodb";
import { getMongoDb, getSourceDb } from "../../database/mongo.js";

type RawDoc = Record<string, any>;
type ExportSourceType = "sales" | "purchase" | "memo";

interface ExportAnalyticsRow {
  documentId: string;
  date?: string;
  stockNumber?: string;
  sourceType: ExportSourceType;
  orderDate?: Date;
  warehouseKey?: number | null;
  buyerKey?: number | null;
  buyer?: { name?: string } | null;
  subAdminKeys?: number[];
  vendorKey?: number | null;
  productKey?: number | null;
  salesValue?: number;
  shape?: string;
  size?: string;
  color?: string;
  clarity?: string;
  productType?: string;
  status?: string;
  quantity?: number;
  purchaseValue?: number;
}

interface ExportSalesDocument {
  documentId: string;
  totalValue: number;
}

interface ExportFilterIndex {
  documentIds: Set<string>;
  stockNumbersByDocumentId: Map<string, Set<string>>;
  rowsByDocumentId: Map<string, ExportAnalyticsRow[]>;
}

const PURCHASE_COLUMNS = [
  "ORDER DATE",
  "ORDER NUMBER",
  "Vendor name",
  "Invoice Date",
  "INVOICE NO",
  "Status",
  "Terms",
  "Total carat",
  "Net ($)",
  "GROSS($)",
  "Exchange Rate",
  "Exchange Rate Source",
  "Net (Rs)",
  "GROSS(Rs)",
  "Month",
  "Payment Date",
  "Payment reference (UTR)",
  "Source"
] as const;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function asArray(value: unknown): RawDoc[] {
  return Array.isArray(value) ? value : [];
}

function parseDateAtUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function buildExportMatch(sourceTypes: ExportSourceType[], filters: DashboardFiltersInput): Filter<Document> {
  const match: Filter<Document> = {
    sourceType: sourceTypes.length === 1 ? sourceTypes[0] : { $in: sourceTypes }
  };

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
    match.orderDate = {
      ...(filters.dateRange.from ? { $gte: parseDateAtUtcMidnight(filters.dateRange.from) } : {}),
      ...(filters.dateRange.to ? { $lte: parseDateAtUtcMidnight(filters.dateRange.to) } : {})
    };
  }

  return match;
}

async function buildExportFilterIndex(
  scope: ResolvedScope,
  filters: DashboardFiltersInput,
  sourceTypes: ExportSourceType[]
): Promise<ExportFilterIndex> {
  const scoped = applyScopeToFilters(scope, {
    ...filters,
    viewMode: "scoped"
  });
  const db = await getMongoDb();
  const rows = await db
    .collection<ExportAnalyticsRow>("analytics_rows")
    .find(buildExportMatch(sourceTypes, scoped.filters), {
      projection: {
        documentId: 1,
        date: 1,
        stockNumber: 1,
        sourceType: 1,
        orderDate: 1,
        buyer: 1,
        salesValue: 1,
        purchaseValue: 1,
        quantity: 1,
        productType: 1
      }
    })
    .toArray();
  const documentIds = new Set<string>();
  const stockNumbersByDocumentId = new Map<string, Set<string>>();
  const rowsByDocumentId = new Map<string, ExportAnalyticsRow[]>();

  for (const row of rows) {
    if (!row.documentId) {
      continue;
    }

    documentIds.add(row.documentId);
    const documentRows = rowsByDocumentId.get(row.documentId) ?? [];
    documentRows.push(row);
    rowsByDocumentId.set(row.documentId, documentRows);

    const stockNumber = row.stockNumber?.trim();
    if (stockNumber) {
      const stockNumbers = stockNumbersByDocumentId.get(row.documentId) ?? new Set<string>();
      stockNumbers.add(stockNumber);
      stockNumbersByDocumentId.set(row.documentId, stockNumbers);
    }
  }

  return { documentIds, stockNumbersByDocumentId, rowsByDocumentId };
}

function rawDocumentId(doc: RawDoc): string {
  return String(doc._id ?? fmtDate(doc.createdAt) ?? fmtDate(doc.updatedAt) ?? "unknown");
}

function purchaseDocumentId(doc: RawDoc, source: "warehouse" | "loose" | "order" | "memo"): string {
  const id = rawDocumentId(doc);
  if (source === "warehouse") return `warehouse-purchase:${id}`;
  if (source === "loose") return `loose-purchase:${id}`;
  if (source === "memo") return `memo:${id}`;
  return `order-purchase:${id}`;
}

function productStockIdentifier(product: RawDoc): string | null {
  const value = product.Stock_No ?? product.Certificate_No ?? product.lotid ?? product.item_no;
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function matchesExportDocument(index: ExportFilterIndex, documentId: string): boolean {
  return index.documentIds.has(documentId);
}

function matchesExportProduct(index: ExportFilterIndex, documentId: string, product: RawDoc): boolean {
  if (!matchesExportDocument(index, documentId)) {
    return false;
  }

  const allowedStockNumbers = index.stockNumbersByDocumentId.get(documentId);
  if (!allowedStockNumbers || allowedStockNumbers.size === 0) {
    return true;
  }

  const stockNumber = productStockIdentifier(product);
  return stockNumber ? allowedStockNumbers.has(stockNumber) : true;
}

function analyticsPurchaseValueForProduct(
  index: ExportFilterIndex,
  documentId: string,
  product: RawDoc
): number | null {
  const stockNumber = productStockIdentifier(product);
  if (!stockNumber) {
    return null;
  }

  const matches = (index.rowsByDocumentId.get(documentId) ?? []).filter((row) => row.stockNumber === stockNumber);
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((sum, row) => sum + num(row.purchaseValue), 0);
}

// Effective vendor price per carat, in priority order:
//   1. negotiated_percentage (if not null/0) -> base price reduced by that percentage
//   2. negotiated_price (if not null/0)       -> that price directly
//   3. base price (vendor_price / price_per_carat)
function purchaseUnitPrice(product: RawDoc): number {
  const base = num(product.vendor_price) || num(product.price_per_carat) || num(product.vendor_price_init);

  const percentage = num(product.negotiated_percentage);
  if (percentage > 0) {
    return base * (1 - percentage / 100);
  }

  const negotiated = num(product.negotiated_price);
  if (negotiated > 0) {
    return negotiated;
  }

  return base;
}

// True when the order carries a given VAT declaration (waives UAE VAT).
function hasVatDeclaration(doc: RawDoc): boolean {
  const status = doc.vat_declaration?.status;
  return status === true || status === "yes" || status === "true";
}

// GST/VAT on the vendor PO is derived from the vendor's location (it is never stored):
// India = 1.5% (CGST+SGST for Maharashtra, IGST otherwise — same total), UAE = 5% VAT
// (waived when a VAT declaration is given), else none.
function purchaseTaxRate(country: string, vatDeclarationGiven: boolean): number {
  const code = country.trim().toUpperCase();
  if (code === "IN") return 0.015;
  if (code === "AE") return vatDeclarationGiven ? 0 : 0.05;
  return 0;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtDate(value: unknown): string {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function monthLabel(value: unknown): string {
  const date = toDate(value);
  return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "";
}

function addDays(value: unknown, days: number): string {
  const date = toDate(value);
  if (!date || !days) return "";
  return fmtDate(new Date(date.getTime() + days * 86_400_000));
}

interface VendorGroup {
  carat: number;
  netUsd: number;
  pcs: number;
}

interface ExchangeRateRecord {
  amount?: number;
  createdAt?: Date | string;
}

interface ExchangeRateResolution {
  rate: number;
  source: string;
}

type ExchangeRateResolver = (date: unknown) => ExchangeRateResolution;

function exchangeRateDate(value: unknown): number {
  return toDate(value)?.getTime() ?? 0;
}

function buildExchangeRateResolver(records: ExchangeRateRecord[]): ExchangeRateResolver {
  const rates = records
    .map((record) => ({
      rate: num(record.amount),
      time: exchangeRateDate(record.createdAt)
    }))
    .filter((record) => record.rate > 0 && record.time > 0)
    .sort((left, right) => left.time - right.time);

  return (dateValue: unknown) => {
    const targetTime = exchangeRateDate(dateValue);
    if (!targetTime || rates.length === 0) {
      return { rate: 1, source: "missing/default" };
    }

    let selected: { rate: number; time: number } | null = null;
    for (const rate of rates) {
      if (rate.time > targetTime) {
        break;
      }
      selected = rate;
    }

    return selected
      ? { rate: selected.rate, source: "exchange_rates_master.amount" }
      : { rate: 1, source: "missing/default" };
  };
}

function resolvePurchaseExchangeRate(
  doc: RawDoc,
  invoice: RawDoc | undefined,
  fallbackResolver: ExchangeRateResolver
): ExchangeRateResolution {
  const docRate = num(doc.exchange_rate);
  if (docRate > 0) {
    return { rate: docRate, source: "doc.exchange_rate" };
  }

  const costRate = num(doc.cost?.exchange_rate);
  if (costRate > 0) {
    return { rate: costRate, source: "doc.cost.exchange_rate" };
  }

  const invoiceRate = num(invoice?.exchange_rate);
  if (invoiceRate > 0) {
    return { rate: invoiceRate, source: "invoice.exchange_rate" };
  }

  return fallbackResolver(invoice?.date ?? doc.createdAt ?? doc.updatedAt);
}

function purchaseMoney(
  netUsd: number,
  taxRate: number,
  exchangeRate: number
): { netUsd: number; grossUsd: number; netInr: number; grossInr: number } {
  const roundedNetUsd = round(netUsd);
  const grossUsd = round(roundedNetUsd * (1 + taxRate));

  return {
    netUsd: roundedNetUsd,
    grossUsd,
    netInr: round(roundedNetUsd * exchangeRate),
    grossInr: round(grossUsd * exchangeRate)
  };
}

/**
 * One purchase row per (document × vendor) — POs and invoices are keyed by vendorID, and PARTY
 * is the vendor. Works for warehouse/loose procurement and for the vendor PO raised on a sales order.
 */
function buildRowsForDoc(
  doc: RawDoc,
  source: string,
  getVendor: (id: string) => { name: string; country: string },
  resolveFallbackExchangeRate: ExchangeRateResolver,
  productFilter?: (product: RawDoc) => boolean,
  productPurchaseValue?: (product: RawDoc) => number | null
): RawDoc[] {
  const vatDeclarationGiven = hasVatDeclaration(doc);
  const invoiceList = asArray(doc.invoice);
  // Loose-lots purchase stores a single invoice object (one vendor) instead of an array.
  const singleInvoice =
    !Array.isArray(doc.invoice) && doc.invoice && typeof doc.invoice === "object" ? (doc.invoice as RawDoc) : null;

  const groups = new Map<string, VendorGroup>();
  for (const product of asArray(doc.products)) {
    if (productFilter && !productFilter(product)) {
      continue; // e.g. converted memos: only count products with is_order === true
    }
    const vendorId = String(product.vendorID ?? doc.vendorID ?? "");
    const carat = num(product.Carat ?? product.total_carat);
    const group = groups.get(vendorId) ?? { carat: 0, netUsd: 0, pcs: 0 };
    group.carat += carat;
    group.netUsd += productPurchaseValue?.(product) ?? purchaseUnitPrice(product) * carat;
    group.pcs += num(product.number_of_stone ?? product.Pcs ?? product.qty ?? 1);
    groups.set(vendorId, group);
  }

  return [...groups.entries()].map(([vendorId, group]) => {
    // Invoice number + date come only from the invoice the vendor uploaded (blank until uploaded).
    const invoice = invoiceList.find((entry) => String(entry.vendorID) === vendorId) ?? singleInvoice ?? undefined;
    const vendor = getVendor(vendorId);
    const exchangeRate = resolvePurchaseExchangeRate(doc, invoice, resolveFallbackExchangeRate);
    const money = purchaseMoney(
      group.netUsd,
      purchaseTaxRate(vendor.country, vatDeclarationGiven),
      exchangeRate.rate
    );
    // Payment terms (net days) drive the due date; loose lots keep terms on the doc itself.
    const terms = num(invoice?.terms) || num(doc.terms);
    // A payment is real only once the vendor invoice is marked "Payment Done" (sets utr_no). No paid-on
    // date is stored, so we surface the due date (invoice date + terms) for paid rows only.
    const paid = String(invoice?.status ?? "") === "Payment Done";
    return {
      "ORDER DATE": fmtDate(doc.createdAt),
      "ORDER NUMBER": doc.order_number ?? "",
      "Vendor name": vendor.name,
      "Invoice Date": fmtDate(invoice?.date),
      "INVOICE NO": invoice?.invoice_no ?? "",
      Status: String(invoice?.status ?? ""),
      Terms: terms || "",
      "Total carat": round(group.carat),
      "Net ($)": money.netUsd,
      "GROSS($)": money.grossUsd,
      "Exchange Rate": exchangeRate.rate,
      "Exchange Rate Source": exchangeRate.source,
      "Net (Rs)": money.netInr,
      "GROSS(Rs)": money.grossInr, // Net + GST/VAT derived from the vendor's location
      Month: monthLabel(doc.createdAt),
      "Payment Date": paid ? addDays(invoice?.date, terms) : "",
      "Payment reference (UTR)": invoice?.utr_no ?? "",
      Source: source
    };
  });
}

async function buildPurchaseRows(index: ExportFilterIndex): Promise<RawDoc[]> {
  const db = await getSourceDb();

  const vendors = (await db
    .collection("vendor_master")
    .find({}, { projection: { company_name: 1, firstname: 1, lastname: 1, country: 1 } })
    .toArray()) as RawDoc[];
  const vendorMap = new Map<string, { name: string; country: string }>(
    vendors.map((vendor) => [
      String(vendor._id),
      {
        name: String(vendor.company_name ?? `${vendor.firstname ?? ""} ${vendor.lastname ?? ""}`.trim()),
        country: String(vendor.country ?? "")
      }
    ])
  );
  const getVendor = (id: string) => vendorMap.get(id) ?? { name: "", country: "" };
  const exchangeRates = (await db
    .collection<ExchangeRateRecord>("exchange_rates_master")
    .find({}, { projection: { amount: 1, createdAt: 1 } })
    .toArray()) as ExchangeRateRecord[];
  const resolveFallbackExchangeRate = buildExchangeRateResolver(exchangeRates);

  // PO raised to a vendor: array form (order/warehouse) or non-empty string (loose).
  const hasPo = {
    $or: [{ "po_invoice.0": { $exists: true } }, { po_invoice: { $type: "string", $ne: "" } }]
  };

  const [warehouse, loose, orders, looseOrders, ownShapeOrders, memos] = await Promise.all([
    db.collection("warehouse_purchase_master").find({}).toArray(),
    db.collection("loose_lots_purchase_master").find({}).toArray(),
    db.collection("order_master").find(hasPo).toArray(),
    db.collection("loose_lots_order_master").find(hasPo).toArray(),
    db.collection("own_shape_order_master").find(hasPo).toArray(),
    db.collection("memo_master").find({ "products.is_order": true }).toArray()
  ]);

  const rows: RawDoc[] = [];
  for (const doc of warehouse as RawDoc[]) {
    const documentId = purchaseDocumentId(doc, "warehouse");
    if (matchesExportDocument(index, documentId)) {
      rows.push(
        ...buildRowsForDoc(
          doc,
          "Warehouse Purchase",
          getVendor,
          resolveFallbackExchangeRate,
          (product) => matchesExportProduct(index, documentId, product),
          (product) => analyticsPurchaseValueForProduct(index, documentId, product)
        )
      );
    }
  }
  for (const doc of loose as RawDoc[]) {
    const documentId = purchaseDocumentId(doc, "loose");
    if (matchesExportDocument(index, documentId)) {
      rows.push(
        ...buildRowsForDoc(
          doc,
          "Loose Lots Purchase",
          getVendor,
          resolveFallbackExchangeRate,
          (product) => matchesExportProduct(index, documentId, product),
          (product) => analyticsPurchaseValueForProduct(index, documentId, product)
        )
      );
    }
  }
  for (const doc of [...orders, ...looseOrders, ...ownShapeOrders] as RawDoc[]) {
    const documentId = purchaseDocumentId(doc, "order");
    if (matchesExportDocument(index, documentId)) {
      rows.push(
        ...buildRowsForDoc(
          doc,
          "Order PO",
          getVendor,
          resolveFallbackExchangeRate,
          (product) => matchesExportProduct(index, documentId, product),
          (product) => analyticsPurchaseValueForProduct(index, documentId, product)
        )
      );
    }
  }
  // Converted memos: count only the products that have actually converted (is_order === true),
  // so a partially-converted memo contributes only its converted stones.
  for (const doc of memos as RawDoc[]) {
    const documentId = purchaseDocumentId(doc, "memo");
    if (matchesExportDocument(index, documentId)) {
      rows.push(
        ...buildRowsForDoc(
          doc,
          "Converted Memo",
          getVendor,
          resolveFallbackExchangeRate,
          (product) => product.is_order === true && matchesExportProduct(index, documentId, product),
          (product) => analyticsPurchaseValueForProduct(index, documentId, product)
        )
      );
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Sales export — one row per invoiced order, split into two sheets by destination.
// ---------------------------------------------------------------------------

const SALES_COLUMNS = [
  "Date",
  "Order Number",
  "Invoice Number",
  "Invoice Date",
  "Buyer Name",
  "Order Type",
  "Terms",
  "Pcs",
  "Total Carat",
  "Total($)",
  "Date of receipt",
  "Ref"
] as const;

// Route-specific invoice fields; an order is "invoiced" (= shipped/delivered) once any is set.
// Priority order picks a single number, preferring the final/export leg.
const INVOICE_FIELDS = [
  "invoice_ind_exp",
  "invoice_dub_exp",
  "invoice_dub_ldexp",
  "invoice_dub_loexp",
  "invoice_usa_exp",
  "invoice_ind_loc",
  "invoice_dub_loc",
  "invoice_usa_loc"
];

type SalesSource = "order" | "loose_master" | "loose" | "own_shape";

function salesDocumentId(doc: RawDoc, source: SalesSource): string {
  const id = rawDocumentId(doc);
  if (source === "loose_master") return `loose-master:${id}`;
  if (source === "loose") return `loose-order:${id}`;
  if (source === "own_shape") return `own-shape-order:${id}`;
  return `order:${id}`;
}

interface SalesSourceConfig {
  collection: string;
  documentPrefix: string;
  source: SalesSource;
}

interface SalesSourceDocument {
  doc: RawDoc;
  source: SalesSource;
}

const SALES_SOURCE_CONFIGS: SalesSourceConfig[] = [
  { collection: "order_master", documentPrefix: "order", source: "order" },
  { collection: "loose_lots_master", documentPrefix: "loose-master", source: "loose_master" },
  { collection: "loose_lots_order_master", documentPrefix: "loose-order", source: "loose" },
  { collection: "own_shape_order_master", documentPrefix: "own-shape-order", source: "own_shape" }
];

function pickInvoice(doc: RawDoc): string {
  for (const field of INVOICE_FIELDS) {
    const value = doc[field];
    if (value && String(value).trim()) {
      return String(value);
    }
  }
  return "";
}

// Internal warehouse transfer when the combine destination is a warehouse (not "buyer").
function isInternalTransfer(doc: RawDoc): boolean {
  const to = String(doc.combine?.to ?? "").trim().toLowerCase();
  return to !== "" && to !== "buyer";
}

const BUYER_SHIP_STATUS = /order shipped|order delivered|out for delivery/i;
const INTERNAL_MOVE_STATUS = /ldspl to/i;

function salesOrderType(doc: RawDoc, source: SalesSource): string {
  if (source === "loose" || source === "loose_master") return "loose lot";
  if (source === "own_shape") return "own shape";
  if (doc.combine?.is_memo === true) return "memo";
  if (doc.combine?.is_combine === true) return "combine";
  if (asArray(doc.combine_products).length > 0) return "combine";
  return "normal";
}

function salesItems(doc: RawDoc, source: SalesSource): RawDoc[] {
  if (source === "loose_master") return asArray(doc.entries);
  if (source === "loose" || source === "own_shape") return asArray(doc.stocks);
  const products = asArray(doc.products);
  return products.length > 0 ? products : asArray(doc.combine_products);
}

function isCanceled(doc: RawDoc): boolean {
  return asArray(doc.status_list).some((entry) => /cancel/i.test(String(entry?.order_status)));
}

function deliveredDate(doc: RawDoc): string {
  const list = asArray(doc.status_list);
  for (let i = list.length - 1; i >= 0; i--) {
    if (/deliver/i.test(String(list[i]?.order_status))) {
      return fmtDate(list[i]?.date);
    }
  }
  return "";
}

// Sales invoices are generated at the ship event, so the invoice date = that status entry's date.
function statusDate(doc: RawDoc, regex: RegExp): string {
  const entry = asArray(doc.status_list).find((s) => regex.test(String(s?.order_status ?? "")));
  return entry ? fmtDate(entry.date) : "";
}

interface SalesResult {
  sheet: "Sales to Buyer" | "Internal Transfer";
  row: RawDoc;
  buyerSourceId: string; // order's buyer id — used to scope buyer legs to a sub-admin's assigned buyers
  warehouseDest: string; // internal-transfer destination code (LDD/LD/LO/US/combine.to) — used for warehouse scoping
}

// Route codes (ldspl/ld/ldd/lo) -> physical warehouse aliases, mirroring lumex-source's mapping.
const WAREHOUSE_ALIAS_MAP: Record<string, string> = {
  ldspl: "mumbai",
  "dubai ld": "dubai",
  ld: "dubai",
  "dubai ldd": "dubai",
  ldd: "dubai",
  "dubai lo": "dubai lo",
  lo: "dubai lo",
  us: "new york",
  usa: "new york"
};

function normWarehouseAlias(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

// Resolve a warehouse code (route alias, name, city, optional_value or raw id) -> warehouse_master _id.
// warehouse_name is the authoritative match (unique); city/optional_value/id only fill gaps and never
// override — otherwise "Dubai LO" (city "Dubai") would clobber the "dubai" alias that means "Dubai".
function buildWarehouseResolver(warehouseDocs: RawDoc[]): (code: unknown) => string | null {
  const byName = new Map<string, string>();
  const byAlias = new Map<string, string>();
  for (const warehouse of warehouseDocs) {
    const id = String(warehouse._id);
    const name = normWarehouseAlias(warehouse.warehouse_name);
    if (name && !byName.has(name)) {
      byName.set(name, id);
    }
    const aliases = [
      id.toLowerCase(),
      normWarehouseAlias(warehouse.city),
      ...asArray(warehouse.optional_value).map((value) => normWarehouseAlias(value))
    ].filter((value): value is string => Boolean(value));
    for (const alias of aliases) {
      if (!byAlias.has(alias)) {
        byAlias.set(alias, id);
      }
    }
  }
  return (code: unknown) => {
    const ref = normWarehouseAlias(code);
    if (!ref) {
      return null;
    }
    const target = WAREHOUSE_ALIAS_MAP[ref] ?? ref;
    return byName.get(target) ?? byAlias.get(target) ?? null;
  };
}

// An order can carry several invoice legs (e.g. Ldspl->LDD export EXO, then LDD->buyer LDDEXO).
// Emit one row per populated leg, classifying each leg into the right sheet.
function buildSalesRowsForDoc(
  doc: RawDoc,
  source: SalesSource,
  buyerName: (id: unknown) => string,
  combineChildren: Map<string, string[]>,
  itemFilter?: (item: RawDoc) => boolean
): SalesResult[] {
  const items = salesItems(doc, source);
  const selectedItems = itemFilter ? items.filter(itemFilter) : items;
  if (selectedItems.length === 0) {
    return [];
  }

  let pcs = 0;
  let carat = 0;
  let transferRaw = 0;
  let saleRaw = 0;
  for (const item of selectedItems) {
    const itemCarat = num(item.Carat ?? item.available_carats ?? item.total_carat);
    pcs += num(item.qty ?? item.Pcs ?? item.available_pcs ?? item.number_of_stone) || 1;
    carat += itemCarat;
    transferRaw += num(item.transfer_price) * itemCarat;
    // Mirror the order controller's line total: product.total || round(round(price*qty,2)*carat,2).
    const pricePerCarat = num(item.Price) || num(item.Price_Per_Carat) || num(item.price_per_carat) || num(item.DiscountPrice);
    const qty = num(item.qty) || 1;
    saleRaw += num(item.total) || round(round(pricePerCarat * qty) * itemCarat);
  }
  const transferValue = round(transferRaw); // warehouse (internal) invoice value = Σ transfer_price × Carat
  // Buyer invoice value = order sale total; converted memos leave cost.total at 0, so fall back to the
  // same per-line computation the order controller uses (Σ round(round(price*qty)*carat)).
  const saleTotal = selectedItems.length === items.length ? round(num(doc.cost?.total)) || round(saleRaw) : round(saleRaw);

  const orderType = salesOrderType(doc, source);
  const actualBuyer = buyerName(doc.user_id ?? doc.buyer_id);
  const buyerSourceId = String(doc.user_id ?? doc.buyer_id ?? "");
  const ref =
    doc.combine?.is_combine === true
      ? (combineChildren.get(String(doc.order_number)) ?? []).join(", ")
      : String(doc.ref ?? "");

  const statuses = asArray(doc.status_list).map((entry) => String(entry?.order_status ?? ""));
  const reachedBuyer = statuses.some((status) => BUYER_SHIP_STATUS.test(status));
  const ldsplWarehouse = (statuses.find((status) => INTERNAL_MOVE_STATUS.test(status))?.match(/ldspl to (\w+)/i)?.[1] ?? "").toUpperCase();
  // An onward export leg means the goods first moved Ldspl -> a Dubai/USA warehouse (the EXO leg is internal).
  const onwardWarehouse = doc.invoice_dub_exp
    ? "LDD"
    : doc.invoice_dub_ldexp
    ? "LD"
    : doc.invoice_dub_loexp
    ? "LO"
    : doc.invoice_usa_exp
    ? "US"
    : "";
  const combineInternal = isInternalTransfer(doc);
  const combineLabel = `${String(doc.combine?.from ?? "").toUpperCase()}>${String(doc.combine?.to ?? "").toUpperCase()}`;

  const make = (
    invoice: unknown,
    sheet: SalesResult["sheet"],
    buyerLabel: string,
    warehouseDest = ""
  ): SalesResult => ({
    sheet,
    buyerSourceId,
    warehouseDest,
    row: {
      Date: fmtDate(doc.createdAt),
      "Order Number": doc.order_number ?? "",
      "Invoice Number": String(invoice),
      // Invoice issued at the leg's ship event: internal = Ldspl-to-warehouse move, buyer = order shipped.
      "Invoice Date": sheet === "Internal Transfer" ? statusDate(doc, INTERNAL_MOVE_STATUS) : statusDate(doc, BUYER_SHIP_STATUS),
      "Buyer Name": buyerLabel,
      "Order Type": orderType,
      // Buyer orders carry no payment-terms field today; auto-fills if a `terms` is ever stored on the order.
      Terms: num(doc.terms) || "",
      Pcs: pcs,
      "Total Carat": round(carat),
      // Internal-transfer legs invoice the warehouse at transfer value; buyer legs at the sale total.
      "Total($)": sheet === "Internal Transfer" ? transferValue : saleTotal,
      "Date of receipt": deliveredDate(doc),
      Ref: ref
    }
  });

  const results: SalesResult[] = [];
  for (const field of INVOICE_FIELDS) {
    const invoice = doc[field];
    if (!invoice || !String(invoice).trim()) {
      continue;
    }

    if (field === "invoice_ind_exp") {
      // India export (EXO). Internal Ldspl->warehouse leg if goods moved to a warehouse; a direct
      // export sale only if it actually shipped to the buyer.
      if (onwardWarehouse) {
        results.push(make(invoice, "Internal Transfer", `LDSPL>${onwardWarehouse}`, onwardWarehouse));
      } else if (reachedBuyer) {
        results.push(make(invoice, "Sales to Buyer", combineInternal ? combineLabel : actualBuyer));
      } else if (ldsplWarehouse) {
        results.push(make(invoice, "Internal Transfer", `LDSPL>${ldsplWarehouse}`, ldsplWarehouse));
      } else {
        results.push(
          make(
            invoice,
            combineInternal ? "Internal Transfer" : "Sales to Buyer",
            combineInternal ? combineLabel : actualBuyer,
            combineInternal ? String(doc.combine?.to ?? "") : ""
          )
        );
      }
    } else {
      // Local sale (LSO/LDLSO/EVLSO) or warehouse->buyer export (LDDEXO/LDEXO/LOEXO/EVEXO) => Sales to Buyer.
      results.push(make(invoice, "Sales to Buyer", actualBuyer));
    }
  }
  return results;
}

function splitSalesDocumentId(documentId: string) {
  const separatorIndex = documentId.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const prefix = documentId.slice(0, separatorIndex);
  const rawId = documentId.slice(separatorIndex + 1);
  const config = SALES_SOURCE_CONFIGS.find((entry) => entry.documentPrefix === prefix);
  return config && rawId ? { ...config, rawId } : null;
}

function mongoIdValue(rawId: string) {
  return new ObjectId(rawId);
}

function firstAnalyticsRow(rows: ExportAnalyticsRow[]): ExportAnalyticsRow | undefined {
  return rows[0];
}

function analyticsQuantity(rows: ExportAnalyticsRow[]) {
  return rows.reduce((sum, row) => sum + num(row.quantity), 0);
}

function itemCarat(item: RawDoc) {
  return num(item.Carat ?? item.available_carats ?? item.total_carat);
}

function itemQuantity(item: RawDoc) {
  return num(item.qty ?? item.Pcs ?? item.available_pcs ?? item.number_of_stone) || 1;
}

function sourceDocumentStats(doc: RawDoc, source: SalesSource) {
  return itemStats(salesItems(doc, source));
}

function itemStats(items: RawDoc[]) {
  return items.reduce(
    (stats, item) => ({
      pcs: stats.pcs + itemQuantity(item),
      carat: stats.carat + itemCarat(item)
    }),
    { pcs: 0, carat: 0 }
  );
}

function analyticsDate(rows: ExportAnalyticsRow[]) {
  const row = firstAnalyticsRow(rows);
  if (row?.date) {
    return row.date;
  }
  return row?.orderDate ? fmtDate(row.orderDate) : "";
}

function analyticsBuyerName(rows: ExportAnalyticsRow[]) {
  return rows.map((row) => row.buyer?.name?.trim()).find((name): name is string => Boolean(name)) ?? "";
}

function fallbackOrderType(rows: ExportAnalyticsRow[]) {
  const productType = firstAnalyticsRow(rows)?.productType;
  if (productType === "loose_lot") {
    return "loose lot";
  }
  if (productType === "own_shape") {
    return "own shape";
  }
  return "normal";
}

function buildDashboardSalesRow(
  documentId: string,
  totalValue: number,
  sourceDocument: SalesSourceDocument | undefined,
  analyticsRows: ExportAnalyticsRow[],
  buyerName: (id: unknown) => string
): RawDoc {
  const doc = sourceDocument?.doc;
  const source = sourceDocument?.source;
  const sourceStats = doc && source ? sourceDocumentStats(doc, source) : null;
  const buyerLabel = doc
    ? buyerName(doc.user_id ?? doc.buyer_id) || analyticsBuyerName(analyticsRows)
    : analyticsBuyerName(analyticsRows);

  return {
    Date: doc ? fmtDate(doc.createdAt) : analyticsDate(analyticsRows),
    "Order Number": doc?.order_number ?? documentId,
    "Invoice Number": doc ? pickInvoice(doc) : "",
    "Invoice Date": doc ? statusDate(doc, BUYER_SHIP_STATUS) : "",
    "Buyer Name": buyerLabel,
    "Order Type": doc && source ? salesOrderType(doc, source) : fallbackOrderType(analyticsRows),
    Terms: num(doc?.terms) || "",
    Pcs: sourceStats ? sourceStats.pcs : analyticsQuantity(analyticsRows),
    "Total Carat": sourceStats ? round(sourceStats.carat) : 0,
    "Total($)": totalValue,
    "Date of receipt": doc ? deliveredDate(doc) : "",
    Ref: doc?.ref ?? ""
  };
}

function itemStockCandidates(item: RawDoc): string[] {
  return [
    item.Stock_No,
    item.stockNumber,
    item.stock_no,
    item.Certificate_No,
    item.lotid,
    item.item_no,
    item._id
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function selectedSalesItems(doc: RawDoc, source: SalesSource, selectedStockNumbers?: Set<string>): RawDoc[] {
  const items = salesItems(doc, source);
  if (!selectedStockNumbers?.size) {
    return items;
  }

  const selected = new Set([...selectedStockNumbers].map((value) => String(value).trim()).filter(Boolean));
  const matchedItems = items.filter((item) => itemStockCandidates(item).some((candidate) => selected.has(candidate)));
  return matchedItems.length > 0 ? matchedItems : items;
}

function itemSalesValue(item: RawDoc): number {
  const carat = itemCarat(item);
  const pricePerCarat = num(item.Price) || num(item.Price_Per_Carat) || num(item.price_per_carat) || num(item.DiscountPrice);
  const quantity = num(item.qty) || 1;
  return num(item.total) || round(round(pricePerCarat * quantity) * carat);
}

function internalTransferValue(doc: RawDoc, items: RawDoc[]): number {
  const transferValue = round(
    items.reduce((sum, item) => sum + num(item.transfer_price) * itemCarat(item), 0)
  );
  if (transferValue > 0) {
    return transferValue;
  }

  const costTotal = round(num(doc.cost?.total));
  if (costTotal > 0) {
    return costTotal;
  }

  return round(items.reduce((sum, item) => sum + itemSalesValue(item), 0));
}

function internalTransferLeg(doc: RawDoc): { invoice: string; label: string; destination: string } | null {
  const invoice = String(doc.invoice_ind_exp ?? "").trim();
  if (!invoice) {
    return null;
  }

  const onwardWarehouse = doc.invoice_dub_exp
    ? "LDD"
    : doc.invoice_dub_ldexp
    ? "LD"
    : doc.invoice_dub_loexp
    ? "LO"
    : doc.invoice_usa_exp
    ? "US"
    : "";
  if (onwardWarehouse) {
    return { invoice, label: `LDSPL>${onwardWarehouse}`, destination: onwardWarehouse };
  }

  const statuses = asArray(doc.status_list).map((entry) => String(entry?.order_status ?? ""));
  const ldsplWarehouse = (statuses.find((status) => INTERNAL_MOVE_STATUS.test(status))?.match(/ldspl to (\w+)/i)?.[1] ?? "").toUpperCase();
  if (ldsplWarehouse) {
    return { invoice, label: `LDSPL>${ldsplWarehouse}`, destination: ldsplWarehouse };
  }

  if (isInternalTransfer(doc)) {
    const from = String(doc.combine?.from ?? "").toUpperCase();
    const to = String(doc.combine?.to ?? "").toUpperCase();
    return { invoice, label: `${from}>${to}`, destination: to };
  }

  return null;
}

function buildInternalTransferRow(
  sourceDocument: SalesSourceDocument,
  selectedStockNumbers?: Set<string>
): SalesResult | null {
  const { doc, source } = sourceDocument;
  const leg = internalTransferLeg(doc);
  if (!leg) {
    return null;
  }

  const items = selectedSalesItems(doc, source, selectedStockNumbers);
  if (items.length === 0) {
    return null;
  }

  const stats = itemStats(items);
  return {
    sheet: "Internal Transfer",
    buyerSourceId: String(doc.user_id ?? doc.buyer_id ?? ""),
    warehouseDest: leg.destination,
    row: {
      Date: fmtDate(doc.createdAt),
      "Order Number": doc.order_number ?? "",
      "Invoice Number": leg.invoice,
      "Invoice Date": statusDate(doc, INTERNAL_MOVE_STATUS),
      "Buyer Name": leg.label,
      "Order Type": salesOrderType(doc, source),
      Terms: num(doc.terms ?? doc.payment_terms) || "",
      Pcs: stats.pcs,
      "Total Carat": round(stats.carat),
      "Total($)": internalTransferValue(doc, items),
      "Date of receipt": deliveredDate(doc),
      Ref: doc.ref ?? ""
    }
  };
}

async function loadSalesSourceDocuments(documentIds: Set<string>): Promise<Map<string, SalesSourceDocument>> {
  const db = await getSourceDb();
  const idsByConfig = new Map<SalesSourceConfig, string[]>();

  for (const documentId of documentIds) {
    const parsed = splitSalesDocumentId(documentId);
    if (!parsed) {
      continue;
    }

    const config = SALES_SOURCE_CONFIGS.find((entry) => entry.documentPrefix === parsed.documentPrefix);
    if (!config) {
      continue;
    }

    const ids = idsByConfig.get(config) ?? [];
    ids.push(parsed.rawId);
    idsByConfig.set(config, ids);
  }

  const sourceDocuments = new Map<string, SalesSourceDocument>();
  await Promise.all(
    [...idsByConfig.entries()].map(async ([config, rawIds]) => {
      const objectIds = rawIds.filter((rawId) => ObjectId.isValid(rawId)).map(mongoIdValue);
      if (objectIds.length === 0) {
        return;
      }

      const docs = await db
        .collection(config.collection)
        .find({ _id: { $in: objectIds } })
        .toArray();

      for (const doc of docs as RawDoc[]) {
        sourceDocuments.set(salesDocumentId(doc, config.source), { doc, source: config.source });
      }
    })
  );

  return sourceDocuments;
}

async function loadSalesDocumentTotals(documentIds: Set<string>): Promise<Map<string, number>> {
  const db = await getMongoDb();
  const documents = await db
    .collection<ExportSalesDocument>("analytics_sales_documents")
    .find({ documentId: { $in: [...documentIds] } }, { projection: { documentId: 1, totalValue: 1 } })
    .toArray();

  return new Map(documents.map((document) => [document.documentId, num(document.totalValue)]));
}

async function buildSalesRows(index: ExportFilterIndex): Promise<SalesResult[]> {
  const db = await getSourceDb();

  const buyers = (await db
    .collection("buyer_master")
    .find({}, { projection: { company_name: 1, firstname: 1, lastname: 1, user_id: 1 } })
    .toArray()) as RawDoc[];
  const buyerMap = new Map<string, string>();
  for (const buyer of buyers) {
    const name = String(buyer.company_name ?? `${buyer.firstname ?? ""} ${buyer.lastname ?? ""}`.trim());
    buyerMap.set(String(buyer._id), name);
    if (buyer.user_id) {
      buyerMap.set(String(buyer.user_id), name);
    }
  }
  const buyerName = (id: unknown) => buyerMap.get(String(id)) ?? "";

  const [sourceDocuments, documentTotals] = await Promise.all([
    loadSalesSourceDocuments(index.documentIds),
    loadSalesDocumentTotals(index.documentIds)
  ]);

  return [...index.documentIds]
    .sort((left, right) => {
      const leftRows = index.rowsByDocumentId.get(left) ?? [];
      const rightRows = index.rowsByDocumentId.get(right) ?? [];
      return analyticsDate(leftRows).localeCompare(analyticsDate(rightRows)) || left.localeCompare(right);
    })
    .map((documentId) => ({
      sheet: "Sales to Buyer" as const,
      buyerSourceId: "",
      warehouseDest: "",
      row: buildDashboardSalesRow(
        documentId,
        documentTotals.get(documentId) ?? 0,
        sourceDocuments.get(documentId),
        index.rowsByDocumentId.get(documentId) ?? [],
        buyerName
      )
    }));

}

async function buildInternalTransferRows(index: ExportFilterIndex): Promise<SalesResult[]> {
  const sourceDocuments = await loadSalesSourceDocuments(index.documentIds);
  return [...index.documentIds]
    .sort((left, right) => {
      const leftRows = index.rowsByDocumentId.get(left) ?? [];
      const rightRows = index.rowsByDocumentId.get(right) ?? [];
      return analyticsDate(leftRows).localeCompare(analyticsDate(rightRows)) || left.localeCompare(right);
    })
    .map((documentId) => {
      const sourceDocument = sourceDocuments.get(documentId);
      return sourceDocument
        ? buildInternalTransferRow(sourceDocument, index.stockNumbersByDocumentId.get(documentId))
        : null;
    })
    .filter((row): row is SalesResult => Boolean(row));
}

export class ExportsService {
  async buildPurchaseWorkbook(scope: ResolvedScope, filters: DashboardFiltersInput): Promise<Buffer> {
    const index = await buildExportFilterIndex(scope, filters, ["purchase", "memo"]);
    const rows = await buildPurchaseRows(index);
    return writeXlsxFile([
      { sheet: "Purchase", data: sheetData(PURCHASE_COLUMNS, rows) }
    ]).toBuffer();
  }

  async buildSalesWorkbook(scope: ResolvedScope, filters: DashboardFiltersInput): Promise<Buffer> {
    const index = await buildExportFilterIndex(scope, filters, ["sales"]);
    const results = await buildSalesRows(index);
    const transferResults = await buildInternalTransferRows(index);
    const toBuyer = results.filter((result) => result.sheet === "Sales to Buyer").map((result) => result.row);
    const transfers = transferResults.map((result) => result.row);

    return writeXlsxFile([
      { sheet: "Sales to Buyer", data: sheetData(SALES_COLUMNS, toBuyer) },
      { sheet: "Internal Transfer", data: sheetData(SALES_COLUMNS, transfers) }
    ]).toBuffer();
  }
}

function sheetData(columns: readonly string[], rows: RawDoc[]): SheetData {
  return [
    [...columns],
    ...rows.map((row) => columns.map((column) => toCellValue(row[column])))
  ];
}

function toCellValue(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  return String(value);
}
