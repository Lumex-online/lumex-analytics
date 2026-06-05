import type { Db } from "mongodb";
import type { LumexDataset } from "@lumex/lumex-source";
import { bulkWriteUpsert } from "./batch.js";

export async function persistAllDimensions(db: Db, dataset: LumexDataset, batchId: number): Promise<void> {
  const updatedAt = new Date();

  await bulkWriteUpsert(
    db.collection("analytics_warehouses"),
    dataset.warehouses,
    (warehouse) => ({
      _id: warehouse.key,
      key: warehouse.key,
      sourceWarehouseId: warehouse.sourceWarehouseId,
      code: warehouse.code,
      name: warehouse.name,
      etlBatchId: batchId,
      updatedAt
    })
  );

  await bulkWriteUpsert(
    db.collection("analytics_buyers"),
    dataset.buyers,
    (buyer) => ({
      _id: buyer.key,
      key: buyer.key,
      sourceBuyerId: buyer.sourceBuyerId,
      code: buyer.code,
      name: buyer.name,
      location: buyer.location,
      country: buyer.country,
      isVerified: buyer.isVerified,
      warehouseKeys: buyer.warehouseKeys,
      etlBatchId: batchId,
      updatedAt
    })
  );

  await bulkWriteUpsert(
    db.collection("analytics_vendors"),
    dataset.vendors,
    (vendor) => ({
      _id: vendor.key,
      key: vendor.key,
      code: vendor.code,
      name: vendor.name,
      country: vendor.country,
      isVerified: vendor.isVerified,
      etlBatchId: batchId,
      updatedAt
    })
  );

  await bulkWriteUpsert(
    db.collection("analytics_products"),
    dataset.products,
    (product) => ({
      _id: product.key,
      key: product.key,
      sku: product.sku,
      name: product.name,
      shape: product.shape,
      size: product.size,
      color: product.color,
      clarity: product.clarity,
      etlBatchId: batchId,
      updatedAt
    })
  );

  await bulkWriteUpsert(
    db.collection("analytics_sub_admins"),
    dataset.subAdmins,
    (subAdmin) => ({
      _id: subAdmin.key,
      key: subAdmin.key,
      sourceSubAdminId: subAdmin.sourceSubAdminId,
      code: subAdmin.code,
      name: subAdmin.name,
      etlBatchId: batchId,
      updatedAt
    })
  );

  const users = [...dataset.adminUsers, ...dataset.subAdminUsers];
  await bulkWriteUpsert(
    db.collection("analytics_users"),
    users,
    (user) => ({
      _id: user.sourceUserId,
      sourceUserId: user.sourceUserId,
      websiteUserId: user.websiteUserId,
      email: user.email,
      fullName: user.fullName,
      websiteRole: user.websiteRole,
      analyticsRole: user.analyticsRole,
      isActive: true,
      etlBatchId: batchId,
      updatedAt
    })
  );

  const activeUserIds = users.map((user) => user.sourceUserId);
  await db.collection("analytics_users").updateMany(
    (activeUserIds.length > 0 ? { _id: { $nin: activeUserIds } } : {}) as any,
    { $set: { isActive: false, etlBatchId: batchId, updatedAt } }
  );
}
