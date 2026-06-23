import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import type { ResolvedScope } from "@lumex/shared-types";
import { getMongoDb, getSourceDb } from "../../database/mongo.js";

type RawDoc = Record<string, any>;

const PURCHASE_COLUMNS = [
  "ORDER DATE",
  "ORDER NUMBER",
  "Vendor name",
  "Invoice Date",
  "INVOICE NO",
  "Status",
  "Terms",
  "Total carat",
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

/**
 * One purchase row per (document × vendor) — POs and invoices are keyed by vendorID, and PARTY
 * is the vendor. Works for warehouse/loose procurement and for the vendor PO raised on a sales order.
 */
function buildRowsForDoc(
  doc: RawDoc,
  source: string,
  getVendor: (id: string) => { name: string; country: string },
  productFilter?: (product: RawDoc) => boolean
): RawDoc[] {
  const exchangeRate = num(doc.exchange_rate) || num(doc.cost?.exchange_rate) || 1;
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
    group.netUsd += purchaseUnitPrice(product) * carat;
    group.pcs += num(product.number_of_stone ?? product.Pcs ?? product.qty ?? 1);
    groups.set(vendorId, group);
  }

  return [...groups.entries()].map(([vendorId, group]) => {
    // Invoice number + date come only from the invoice the vendor uploaded (blank until uploaded).
    const invoice = invoiceList.find((entry) => String(entry.vendorID) === vendorId) ?? singleInvoice ?? undefined;
    const vendor = getVendor(vendorId);
    const netInr = round(group.netUsd * exchangeRate);
    const grossInr = round(netInr * (1 + purchaseTaxRate(vendor.country, vatDeclarationGiven)));
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
      "Net (Rs)": netInr,
      "GROSS(Rs)": grossInr, // Net + GST/VAT derived from the vendor's location
      Month: monthLabel(doc.createdAt),
      "Payment Date": paid ? addDays(invoice?.date, terms) : "",
      "Payment reference (UTR)": invoice?.utr_no ?? "",
      Source: source
    };
  });
}

async function buildPurchaseRows(): Promise<RawDoc[]> {
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
  for (const doc of warehouse as RawDoc[]) rows.push(...buildRowsForDoc(doc, "Warehouse Purchase", getVendor));
  for (const doc of loose as RawDoc[]) rows.push(...buildRowsForDoc(doc, "Loose Lots Purchase", getVendor));
  for (const doc of [...orders, ...looseOrders, ...ownShapeOrders] as RawDoc[]) {
    rows.push(...buildRowsForDoc(doc, "Order PO", getVendor));
  }
  // Converted memos: count only the products that have actually converted (is_order === true),
  // so a partially-converted memo contributes only its converted stones.
  for (const doc of memos as RawDoc[]) {
    rows.push(...buildRowsForDoc(doc, "Converted Memo", getVendor, (product) => product.is_order === true));
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

type SalesSource = "order" | "loose" | "own_shape";

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
  if (source === "loose") return "loose lot";
  if (source === "own_shape") return "own shape";
  if (doc.combine?.is_memo === true) return "memo";
  if (doc.combine?.is_combine === true) return "combine";
  if (asArray(doc.combine_products).length > 0) return "combine";
  return "normal";
}

function salesItems(doc: RawDoc, source: SalesSource): RawDoc[] {
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
  combineChildren: Map<string, string[]>
): SalesResult[] {
  let pcs = 0;
  let carat = 0;
  let transferRaw = 0;
  let saleRaw = 0;
  for (const item of salesItems(doc, source)) {
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
  const saleTotal = round(num(doc.cost?.total)) || round(saleRaw);

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

async function buildSalesRows(scope: ResolvedScope): Promise<SalesResult[]> {
  const db = await getSourceDb();

  const buyers = (await db
    .collection("buyer_master")
    .find({}, { projection: { company_name: 1, firstname: 1, lastname: 1, user_id: 1 } })
    .toArray()) as RawDoc[];
  const buyerMap = new Map<string, string>();
  // Normalize any buyer reference (user_master id or buyer id) -> the canonical buyer_master _id used as sourceBuyerId.
  const canonicalBuyerId = new Map<string, string>();
  for (const buyer of buyers) {
    const name = String(buyer.company_name ?? `${buyer.firstname ?? ""} ${buyer.lastname ?? ""}`.trim());
    buyerMap.set(String(buyer._id), name);
    canonicalBuyerId.set(String(buyer._id), String(buyer._id));
    if (buyer.user_id) {
      buyerMap.set(String(buyer.user_id), name);
      canonicalBuyerId.set(String(buyer.user_id), String(buyer._id));
    }
  }
  const buyerName = (id: unknown) => buyerMap.get(String(id)) ?? "";

  // Sub-admin scoping: resolve the analytics buyer/warehouse keys to source ids. "ALL" => no restriction.
  const warehouseDocs = (await db.collection("warehouse_master").find({}).toArray()) as RawDoc[];
  const resolveWarehouseSourceId = buildWarehouseResolver(warehouseDocs);
  let allowedBuyerSourceIds: Set<string> | null = null;
  let allowedWarehouseSourceIds: Set<string> | null = null;
  if (scope.buyerKeys !== "ALL" || scope.warehouseKeys !== "ALL") {
    const analytics = await getMongoDb();
    if (scope.buyerKeys !== "ALL") {
      const rows = await analytics
        .collection("analytics_buyers")
        .find({ key: { $in: scope.buyerKeys } }, { projection: { sourceBuyerId: 1 } })
        .toArray();
      allowedBuyerSourceIds = new Set(rows.map((row) => String(row.sourceBuyerId)).filter(Boolean));
    }
    if (scope.warehouseKeys !== "ALL") {
      const rows = await analytics
        .collection("analytics_warehouses")
        .find({ key: { $in: scope.warehouseKeys } }, { projection: { sourceWarehouseId: 1 } })
        .toArray();
      allowedWarehouseSourceIds = new Set(rows.map((row) => String(row.sourceWarehouseId)).filter(Boolean));
    }
  }
  const isVisible = (result: SalesResult): boolean => {
    if (result.sheet === "Sales to Buyer") {
      if (!allowedBuyerSourceIds) {
        return true;
      }
      const id = canonicalBuyerId.get(result.buyerSourceId) ?? result.buyerSourceId;
      return allowedBuyerSourceIds.has(id);
    }
    if (!allowedWarehouseSourceIds) {
      return true;
    }
    const warehouseId = resolveWarehouseSourceId(result.warehouseDest);
    return warehouseId !== null && allowedWarehouseSourceIds.has(warehouseId);
  };

  const hasInvoice = { $or: INVOICE_FIELDS.map((field) => ({ [field]: { $ne: "" } })) };

  const [orders, looseOrders, ownShapeOrders] = await Promise.all([
    db.collection("order_master").find(hasInvoice).toArray(),
    db.collection("loose_lots_order_master").find(hasInvoice).toArray(),
    db.collection("own_shape_order_master").find(hasInvoice).toArray()
  ]);

  // Reverse index: combine order_number -> the order_numbers of the originals combined into it.
  const combineChildren = new Map<string, string[]>();
  for (const docs of [orders, looseOrders, ownShapeOrders] as RawDoc[][]) {
    for (const doc of docs) {
      for (const activity of asArray(doc.combine_activity)) {
        const ref = String(activity.ref ?? "").trim();
        if (ref) {
          const list = combineChildren.get(ref) ?? [];
          list.push(String(doc.order_number ?? ""));
          combineChildren.set(ref, list);
        }
      }
    }
  }

  const results: SalesResult[] = [];
  const sources: Array<[RawDoc[], SalesSource]> = [
    [orders as RawDoc[], "order"],
    [looseOrders as RawDoc[], "loose"],
    [ownShapeOrders as RawDoc[], "own_shape"]
  ];
  for (const [docs, source] of sources) {
    for (const doc of docs) {
      // Show the combine itself (is_combine:true = the consolidated x+y order). Hide the original
      // orders that were combined into a combine (they carry combine_activity) — the combine
      // represents them under one invoice, so they must not also appear separately.
      if (asArray(doc.combine_activity).length > 0 && doc.combine?.is_combine !== true) {
        continue;
      }
      // Skip canceled orders and anything without a real (non-empty) invoice number.
      if (isCanceled(doc) || !pickInvoice(doc)) {
        continue;
      }
      results.push(...buildSalesRowsForDoc(doc, source, buyerName, combineChildren).filter(isVisible));
    }
  }
  return results;
}

export class ExportsService {
  async buildPurchaseWorkbook(): Promise<Buffer> {
    const rows = await buildPurchaseRows();
    return writeXlsxFile([
      { sheet: "Purchase", data: sheetData(PURCHASE_COLUMNS, rows) }
    ]).toBuffer();
  }

  async buildSalesWorkbook(scope: ResolvedScope): Promise<Buffer> {
    const results = await buildSalesRows(scope);
    const toBuyer = results.filter((result) => result.sheet === "Sales to Buyer").map((result) => result.row);
    const transfers = results.filter((result) => result.sheet === "Internal Transfer").map((result) => result.row);

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
