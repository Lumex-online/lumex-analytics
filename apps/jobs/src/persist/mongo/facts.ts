import type { Db } from "mongodb";
import type { LumexAnalyticsRow, LumexDataset, LumexInventoryRow, LumexReturnRow } from "@lumex/lumex-source";
import { bulkWriteReplace, bulkWriteUpsert } from "./batch.js";
import {
  buildDimensionMaps,
  embeddedBuyer,
  embeddedProduct,
  embeddedSubAdmin,
  embeddedSubAdmins,
  embeddedVendor,
  embeddedWarehouse,
  parseDateAtUtcMidnight,
  sourceTableForRow
} from "./common.js";

function analyticsRowId(row: LumexAnalyticsRow): string {
  return `${row.sourceType}:${sourceTableForRow(row)}:${row.id}`;
}

function toAnalyticsRowDocument(dataset: LumexDataset, batchId: number) {
  const maps = buildDimensionMaps(dataset);
  return (row: LumexAnalyticsRow) => {
    const now = new Date();
    const sourceTable = sourceTableForRow(row);
    return {
      _id: analyticsRowId(row),
      id: row.id,
      documentId: row.documentId,
      date: row.date,
      orderDate: parseDateAtUtcMidnight(row.date),
      sourceType: row.sourceType,
      sourceTable,
      warehouseKey: row.warehouseKey,
      buyerKey: row.buyerKey,
      subAdminKey: row.subAdminKey,
      subAdminKeys: row.subAdminKeys,
      vendorKey: row.vendorKey,
      productKey: row.productKey,
      warehouse: embeddedWarehouse(maps, row.warehouseKey),
      buyer: embeddedBuyer(maps, row.buyerKey),
      subAdmin: embeddedSubAdmin(maps, row.subAdminKey),
      subAdmins: embeddedSubAdmins(maps, row.subAdminKeys),
      vendor: embeddedVendor(maps, row.vendorKey),
      product: embeddedProduct(maps, row.productKey),
      salesValue: row.salesValue,
      purchaseValue: row.purchaseValue,
      revenueCostValue: row.revenueCostValue,
      memoGivenValue: row.memoGivenValue,
      memoConvertedValue: row.memoConvertedValue,
      quantity: row.quantity,
      productType: row.productType,
      shape: row.shape,
      size: row.size,
      color: row.color,
      clarity: row.clarity,
      stockNumber: row.stockNumber,
      qcStatus: row.qcStatus,
      status: row.status,
      orderedUnits: row.orderedUnits,
      fulfilledUnits: row.fulfilledUnits,
      etlBatchId: batchId,
      createdAt: now,
      updatedAt: now
    };
  };
}

function toReturnRowDocument(dataset: LumexDataset, batchId: number) {
  const maps = buildDimensionMaps(dataset);
  return (row: LumexReturnRow) => {
    const now = new Date();
    return {
      _id: row.id,
      id: row.id,
      documentId: row.documentId,
      date: row.date,
      orderDate: parseDateAtUtcMidnight(row.date),
      returnDate: parseDateAtUtcMidnight(row.date),
      warehouseKey: row.warehouseKey,
      buyerKey: row.buyerKey,
      subAdminKey: row.subAdminKey,
      subAdminKeys: row.subAdminKeys,
      vendorKey: row.vendorKey,
      productKey: row.productKey,
      warehouse: embeddedWarehouse(maps, row.warehouseKey),
      buyer: embeddedBuyer(maps, row.buyerKey),
      subAdmin: embeddedSubAdmin(maps, row.subAdminKey),
      subAdmins: embeddedSubAdmins(maps, row.subAdminKeys),
      vendor: embeddedVendor(maps, row.vendorKey),
      product: embeddedProduct(maps, row.productKey),
      returnValue: row.returnValue,
      quantity: row.quantity,
      productType: row.productType,
      shape: row.shape,
      size: row.size,
      color: row.color,
      clarity: row.clarity,
      stockNumber: row.stockNumber,
      qcStatus: row.qcStatus,
      reason: row.reason,
      refundMethod: row.refundMethod,
      returnType: row.returnType,
      etlBatchId: batchId,
      createdAt: now,
      updatedAt: now
    };
  };
}

function toInventoryDocument(dataset: LumexDataset, batchId: number, snapshotAt: Date) {
  const maps = buildDimensionMaps(dataset);
  return (row: LumexInventoryRow) => ({
    _id: `${row.warehouseKey}:${row.stockNumber}`,
    id: row.id,
    createdAt: row.createdAt,
    warehouseKey: row.warehouseKey,
    vendorKey: row.vendorKey,
    itemId: row.stockNumber,
    stockNumber: row.stockNumber,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    inStock: row.inStock,
    isVerify: row.isVerify,
    hold: row.hold,
    warehouse: embeddedWarehouse(maps, row.warehouseKey),
    vendor: embeddedVendor(maps, row.vendorKey),
    snapshotAt,
    etlBatchId: batchId,
    updatedAt: new Date()
  });
}

function toInventorySnapshotDocument(dataset: LumexDataset, batchId: number, snapshotAt: Date) {
  const maps = buildDimensionMaps(dataset);
  const snapshotHour = snapshotAt.toISOString().slice(0, 13);
  const snapshotDay = snapshotAt.toISOString().slice(0, 10);
  return (row: LumexInventoryRow) => ({
    _id: `${snapshotHour}:${row.warehouseKey}:${row.stockNumber}`,
    snapshotDate: snapshotAt,
    snapshotDay,
    id: row.id,
    warehouseKey: row.warehouseKey,
    vendorKey: row.vendorKey,
    itemId: row.stockNumber,
    stockNumber: row.stockNumber,
    shape: row.shape,
    size: row.size,
    color: row.color,
    clarity: row.clarity,
    inStock: row.inStock,
    isVerify: row.isVerify,
    hold: row.hold,
    warehouse: embeddedWarehouse(maps, row.warehouseKey),
    vendor: embeddedVendor(maps, row.vendorKey),
    etlBatchId: batchId,
    createdAt: new Date()
  });
}

async function persistRows(db: Db, dataset: LumexDataset, batchId: number, sourceType: LumexAnalyticsRow["sourceType"]) {
  const rows = dataset.rows.filter((row) => row.sourceType === sourceType);
  await bulkWriteUpsert(db.collection("analytics_rows"), rows, toAnalyticsRowDocument(dataset, batchId));
  return rows.length;
}

export async function persistSalesFacts(db: Db, dataset: LumexDataset, batchId: number): Promise<number> {
  const count = await persistRows(db, dataset, batchId, "sales");
  await bulkWriteUpsert(
    db.collection("analytics_sales_documents"),
    dataset.salesDocuments,
    (document) => ({
      _id: document.documentId,
      documentId: document.documentId,
      totalValue: document.totalValue,
      taxValue: document.taxValue,
      vatValue: document.vatValue,
      etlBatchId: batchId,
      updatedAt: new Date()
    })
  );
  await persistReturnFacts(db, dataset, batchId);
  return count;
}

export async function persistMemoFacts(db: Db, dataset: LumexDataset, batchId: number): Promise<number> {
  return persistRows(db, dataset, batchId, "memo");
}

export async function persistPurchaseFacts(db: Db, dataset: LumexDataset, batchId: number): Promise<number> {
  return persistRows(db, dataset, batchId, "purchase");
}

export async function persistReturnFacts(db: Db, dataset: LumexDataset, batchId: number): Promise<number> {
  await bulkWriteUpsert(db.collection("analytics_return_rows"), dataset.returnRows, toReturnRowDocument(dataset, batchId));
  await bulkWriteUpsert(
    db.collection("analytics_return_documents"),
    dataset.returnDocuments,
    (document) => ({
      _id: document.documentId,
      documentId: document.documentId,
      date: document.date,
      orderDate: parseDateAtUtcMidnight(document.date),
      warehouseKey: document.warehouseKey,
      buyerKey: document.buyerKey,
      totalValue: document.totalValue,
      quantity: document.quantity,
      reason: document.reason,
      refundMethod: document.refundMethod,
      returnType: document.returnType,
      etlBatchId: batchId,
      updatedAt: new Date()
    })
  );
  return dataset.returnRows.length;
}

export async function persistInventorySnapshot(db: Db, dataset: LumexDataset, batchId: number): Promise<number> {
  const snapshotAt = new Date();
  await bulkWriteReplace(db.collection("analytics_inventory"), dataset.inventory, toInventoryDocument(dataset, batchId, snapshotAt));
  await db.collection("analytics_inventory").deleteMany({ etlBatchId: { $ne: batchId } });
  await bulkWriteReplace(
    db.collection("analytics_inventory_snapshots"),
    dataset.inventory,
    toInventorySnapshotDocument(dataset, batchId, snapshotAt)
  );
  return dataset.inventory.length;
}
