import type { Db } from "mongodb";
import type { LumexDataset } from "@lumex/lumex-source";

function getAssociatedBuyerKeys(dataset: LumexDataset, subAdminKeys: number[]) {
  return [...new Set(
    dataset.rows
      .filter((row) => row.buyerKey !== null && row.subAdminKeys.some((subAdminKey) => subAdminKeys.includes(subAdminKey)))
      .map((row) => row.buyerKey as number)
  )].sort((left, right) => left - right);
}

export async function persistBuyerSubAdminBridges(db: Db, dataset: LumexDataset): Promise<number> {
  const operations = dataset.subAdminUsers.map((user) => {
    const subAdminKeys = dataset.subAdmins
      .filter((subAdmin) => subAdmin.key === user.sourceUserId)
      .map((subAdmin) => subAdmin.key);
    const buyerAccess = getAssociatedBuyerKeys(dataset, subAdminKeys);

    return {
      updateOne: {
        filter: { _id: user.sourceUserId },
        update: {
          $set: {
            subAdminAssociations: subAdminKeys,
            buyerAccess,
            updatedAt: new Date()
          },
          $setOnInsert: {
            _id: user.sourceUserId,
            sourceUserId: user.sourceUserId,
            analyticsRole: "sub_admin",
            accessMode: "scoped_access",
            allowGlobalTotals: false,
            allowExport: false,
            allowDrilldown: true,
            allowPurchaseVisibility: false,
            allowMemoVisibility: true,
            allowSkuAnalytics: true,
            allowManageOrganizationTargets: false,
            allowManageOwnTargets: true,
            dashboards: ["overview", "sales", "sku_analytics", "buyers", "memos", "warehouses"],
            metricGroups: ["sales", "memo", "sku_analytics", "buyer_analytics", "warehouse_analytics"],
            filterVisibility: {
              warehouses: false,
              buyers: true,
              subAdmins: false,
              vendors: true,
              skus: true,
              shape: true,
              size: true,
              color: true,
              clarity: true,
              purchase: false,
              memo: true,
              _warehouseScopeMode: "custom",
              _buyerScopeMode: "associated"
            },
            isActive: true,
            warehouseAccess: [],
            warehouseScopeMode: "custom",
            buyerScopeMode: "associated",
            version: 1,
            createdAt: new Date()
          }
        },
        upsert: true
      }
    };
  });

  if (operations.length === 0) {
    return 0;
  }

  const result = await db.collection("analytics_access_policies").bulkWrite(operations as any, { ordered: false });
  return result.modifiedCount + result.upsertedCount;
}
