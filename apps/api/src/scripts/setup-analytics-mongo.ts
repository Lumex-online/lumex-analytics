import type {
  AnalyticsAccessPolicy,
  DashboardKey,
  FilterVisibility,
  MetricGroup
} from "@lumex/shared-types";
import { configureLumexSource, ensureLumexDatasetLoaded, getLumexDataset } from "@lumex/lumex-source";
import { env } from "../config/env.js";
import { assertDistinctMongoUsers, closeMongoClient, getMongoDb } from "../database/mongo.js";

const COLLECTIONS = [
  "analytics_rows",
  "analytics_inventory",
  "analytics_inventory_snapshots",
  "analytics_sales_documents",
  "analytics_return_rows",
  "analytics_return_documents",
  "analytics_warehouses",
  "analytics_buyers",
  "analytics_vendors",
  "analytics_products",
  "analytics_sub_admins",
  "analytics_users",
  "analytics_access_policies",
  "analytics_kpi_targets",
  "analytics_dataset_metadata"
] as const;

const fullFilterVisibility: FilterVisibility = {
  warehouses: true,
  buyers: true,
  subAdmins: true,
  vendors: true,
  skus: true,
  shape: true,
  size: true,
  color: true,
  clarity: true,
  purchase: true,
  memo: true
};

const subAdminFilterVisibility: FilterVisibility = {
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
  memo: true
};

function defaultDashboards(role: AnalyticsAccessPolicy["analyticsRole"]): DashboardKey[] {
  if (role === "sub_admin") {
    return ["overview", "sales", "sku_analytics", "buyers", "memos", "warehouses"];
  }

  return ["overview", "sales", "purchase", "sku_analytics", "buyers", "memos", "warehouses"];
}

function defaultMetricGroups(role: AnalyticsAccessPolicy["analyticsRole"]): MetricGroup[] {
  if (role === "sub_admin") {
    return ["sales", "memo", "sku_analytics", "buyer_analytics", "warehouse_analytics"];
  }

  return ["sales", "memo", "purchase", "financial_totals", "sku_analytics", "buyer_analytics", "warehouse_analytics"];
}

function getAssociatedBuyerKeys(
  rows: ReturnType<typeof getLumexDataset>["rows"],
  subAdminKeys: number[]
) {
  return [...new Set(
    rows
      .filter((row) => row.buyerKey !== null && row.subAdminKeys.some((subAdminKey) => subAdminKeys.includes(subAdminKey)))
      .map((row) => row.buyerKey as number)
  )].sort((left, right) => left - right);
}

function getWarehouseKeysForBuyerKeys(
  buyers: ReturnType<typeof getLumexDataset>["buyers"],
  buyerKeys: number[]
) {
  return [...new Set(
    buyers
      .filter((buyer) => buyerKeys.includes(buyer.key))
      .flatMap((buyer) => buyer.warehouseKeys)
  )].sort((left, right) => left - right);
}

function toAccessPolicyDoc(policy: AnalyticsAccessPolicy, actorSourceUserId: number) {
  const now = new Date();
  const warehouseScopeMode = policy.warehouseKeys === "ALL" ? "all" : "custom";
  const buyerScopeMode = policy.buyerKeys === "ALL" ? "all" : "associated";

  return {
    _id: policy.sourceUserId,
    sourceUserId: policy.sourceUserId,
    analyticsRole: policy.analyticsRole,
    accessMode: policy.accessMode,
    allowGlobalTotals: policy.allowGlobalTotals,
    allowExport: policy.allowExport,
    allowDrilldown: policy.allowDrilldown,
    allowPurchaseVisibility: policy.allowPurchaseVisibility,
    allowMemoVisibility: policy.allowMemoVisibility,
    allowSkuAnalytics: policy.allowSkuAnalytics,
    allowManageOrganizationTargets: policy.allowManageOrganizationTargets,
    allowManageOwnTargets: policy.allowManageOwnTargets,
    dashboards: policy.dashboards,
    metricGroups: policy.metricGroups,
    filterVisibility: {
      ...policy.filterVisibility,
      _warehouseScopeMode: warehouseScopeMode,
      _buyerScopeMode: buyerScopeMode
    },
    isActive: policy.isActive,
    warehouseAccess: policy.warehouseKeys === "ALL" ? [] : policy.warehouseKeys,
    buyerAccess: policy.buyerKeys === "ALL" ? [] : policy.buyerKeys,
    subAdminAssociations: policy.subAdminKeys === "ALL" ? [] : policy.subAdminKeys,
    warehouseScopeMode,
    buyerScopeMode,
    version: 1,
    createdBy: actorSourceUserId,
    updatedBy: actorSourceUserId,
    createdAt: now,
    updatedAt: now
  };
}

function toUserDoc(user: ReturnType<typeof getLumexDataset>["adminUsers"][number], updatedAt: Date) {
  return {
    _id: user.sourceUserId,
    sourceUserId: user.sourceUserId,
    websiteUserId: user.websiteUserId,
    email: user.email,
    fullName: user.fullName,
    websiteRole: user.websiteRole,
    analyticsRole: user.analyticsRole,
    isActive: true,
    updatedAt
  };
}

async function ensureCollections(): Promise<void> {
  const db = await getMongoDb();
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((collection) => collection.name));

  for (const collection of COLLECTIONS) {
    if (!existing.has(collection)) {
      await db.createCollection(collection);
    }
  }
}

async function ensureIndexes(): Promise<void> {
  const db = await getMongoDb();

  await db.collection("analytics_rows").createIndexes([
    { key: { orderDate: -1, warehouseKey: 1, buyerKey: 1 } },
    { key: { productKey: 1 } },
    { key: { subAdminKeys: 1 } },
    { key: { sourceType: 1, orderDate: -1 } },
    { key: { warehouseKey: 1, buyerKey: 1, productKey: 1 } },
    { key: { stockNumber: 1 } }
  ]);

  await db.collection("analytics_inventory").createIndexes([
    { key: { warehouseKey: 1, inStock: 1 } },
    { key: { vendorKey: 1 } },
    { key: { shape: 1, size: 1, color: 1, clarity: 1 } },
    { key: { stockNumber: 1 } }
  ]);

  await db.collection("analytics_inventory_snapshots").createIndexes([
    { key: { snapshotDate: -1, warehouseKey: 1 } },
    { key: { snapshotDate: 1 }, expireAfterSeconds: 604800 },
    { key: { warehouseKey: 1, itemId: 1, snapshotDate: -1 } }
  ]);

  await db.collection("analytics_sales_documents").createIndexes([
    { key: { documentId: 1 }, unique: true }
  ]);

  await db.collection("analytics_return_rows").createIndexes([
    { key: { orderDate: -1, warehouseKey: 1, buyerKey: 1 } },
    { key: { productKey: 1 } },
    { key: { subAdminKeys: 1 } },
    { key: { vendorKey: 1, orderDate: -1 } },
    { key: { stockNumber: 1 } }
  ]);

  await db.collection("analytics_return_documents").createIndexes([
    { key: { documentId: 1 }, unique: true },
    { key: { orderDate: -1, warehouseKey: 1, buyerKey: 1 } }
  ]);

  await db.collection("analytics_warehouses").createIndex({ sourceWarehouseId: 1 });
  await db.collection("analytics_buyers").createIndexes([
    { key: { sourceBuyerId: 1 } },
    { key: { isVerified: 1 } },
    { key: { warehouseKeys: 1 } }
  ]);
  await db.collection("analytics_vendors").createIndex({ isVerified: 1 });
  await db.collection("analytics_products").createIndexes([
    { key: { sku: 1 } },
    { key: { shape: 1, size: 1, color: 1, clarity: 1 } }
  ]);
  await db.collection("analytics_sub_admins").createIndex({ sourceSubAdminId: 1 });
  await db.collection("analytics_users").createIndexes([
    { key: { websiteUserId: 1 }, sparse: true },
    { key: { email: 1 } },
    { key: { analyticsRole: 1, isActive: 1 } }
  ]);
  await db.collection("analytics_access_policies").createIndexes([
    { key: { analyticsRole: 1, isActive: 1 } },
    { key: { warehouseAccess: 1 } },
    { key: { buyerAccess: 1 } },
    { key: { subAdminAssociations: 1 } }
  ]);
  await db.collection("analytics_kpi_targets").createIndexes([
    {
      key: { metricKey: 1, scope: 1, scopeKey: 1, targetFrom: 1, targetTo: 1 },
      unique: true
    },
    { key: { scope: 1, scopeKey: 1, isActive: 1 } }
  ]);
}

async function seedAccessPolicies(): Promise<number> {
  configureLumexSource({
    mode: env.LUMEX_DATA_SOURCE,
    apiBaseUrl: env.LUMEX_API_BASE_URL,
    apiPathPrefix: env.LUMEX_API_PATH_PREFIX,
    apiAuthHeader: env.LUMEX_API_AUTH_HEADER,
    apiAuthToken: env.LUMEX_API_AUTH_TOKEN,
    apiTimeoutMs: env.LUMEX_API_TIMEOUT_MS,
    mongoUri: env.LUMEX_MONGO_URI,
    mongoDatabase: env.LUMEX_MONGO_DATABASE
  });
  await ensureLumexDatasetLoaded(true);

  const dataset = getLumexDataset();
  const users = [...dataset.adminUsers, ...dataset.subAdminUsers];
  const now = new Date();
  const db = await getMongoDb();

  if (users.length > 0) {
    await db.collection("analytics_users").bulkWrite(
      users.map((user) => ({
        updateOne: {
          filter: { _id: user.sourceUserId },
          update: { $set: toUserDoc(user, now) },
          upsert: true
        }
      })) as any,
      { ordered: false }
    );

    await db.collection("analytics_users").updateMany(
      { _id: { $nin: users.map((user) => user.sourceUserId) } } as any,
      { $set: { isActive: false, updatedAt: now } }
    );
  }

  const adminPolicies: AnalyticsAccessPolicy[] = dataset.adminUsers.map((user) => ({
    sourceUserId: user.sourceUserId,
    analyticsRole: user.analyticsRole,
    accessMode: "full_access",
    allowGlobalTotals: true,
    allowExport: true,
    allowDrilldown: true,
    allowPurchaseVisibility: true,
    allowMemoVisibility: true,
    allowSkuAnalytics: true,
    allowManageOrganizationTargets: true,
    allowManageOwnTargets: true,
    warehouseKeys: "ALL",
    buyerKeys: "ALL",
    subAdminKeys: "ALL",
    dashboards: defaultDashboards(user.analyticsRole),
    metricGroups: defaultMetricGroups(user.analyticsRole),
    filterVisibility: fullFilterVisibility,
    isActive: true
  }));

  const subAdminPolicies: AnalyticsAccessPolicy[] = dataset.subAdminUsers.map((user) => {
    const subAdminKeys = dataset.subAdmins
      .filter((subAdmin) => subAdmin.key === user.sourceUserId)
      .map((subAdmin) => subAdmin.key);
    const buyerKeys = getAssociatedBuyerKeys(dataset.rows, subAdminKeys);

    return {
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
      warehouseKeys: getWarehouseKeysForBuyerKeys(dataset.buyers, buyerKeys),
      buyerKeys,
      subAdminKeys,
      dashboards: defaultDashboards("sub_admin"),
      metricGroups: defaultMetricGroups("sub_admin"),
      filterVisibility: subAdminFilterVisibility,
      isActive: true
    };
  });

  const operations = [...adminPolicies, ...subAdminPolicies].map((policy) => ({
    updateOne: {
      filter: { _id: policy.sourceUserId },
      update: { $setOnInsert: toAccessPolicyDoc(policy, 1) },
      upsert: true
    }
  }));

  if (operations.length === 0) {
    return 0;
  }

  const result = await db.collection("analytics_access_policies").bulkWrite(operations as any, { ordered: false });
  return result.upsertedCount;
}

async function main(): Promise<void> {
  if (!env.ANALYTICS_MONGO_URI) {
    throw new Error("ANALYTICS_MONGO_URI is required before running db:setup.");
  }

  assertDistinctMongoUsers();
  await ensureCollections();
  await ensureIndexes();
  const insertedPolicies = await seedAccessPolicies();
  console.log(
    `[setup] analytics Mongo ready database=${env.ANALYTICS_MONGO_DATABASE} collections=${COLLECTIONS.length} policiesInserted=${insertedPolicies}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeMongoClient();
  });
