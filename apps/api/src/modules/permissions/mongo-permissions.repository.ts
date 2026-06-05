import type { Db } from "mongodb";
import type {
  AccessMode,
  AnalyticsAccessPolicy,
  AnalyticsRole,
  BuyerOption,
  DashboardKey,
  FilterVisibility,
  MetricGroup,
  ProductOption,
  SubAdminOption,
  UpdateSubAdminAccessInput,
  UserIdentity,
  VendorOption,
  WarehouseOption
} from "@lumex/shared-types";
import type { PermissionRepository } from "./permissions.repository.js";

interface MongoUserDoc {
  _id: number;
  sourceUserId: number;
  websiteUserId?: string;
  email: string;
  fullName: string;
  websiteRole: string;
  analyticsRole: AnalyticsRole;
  isActive: boolean;
}

interface MongoAccessPolicyDoc {
  _id: number;
  sourceUserId: number;
  analyticsRole: AnalyticsRole;
  accessMode: AccessMode;
  allowGlobalTotals: boolean;
  allowExport: boolean;
  allowDrilldown: boolean;
  allowPurchaseVisibility: boolean;
  allowMemoVisibility: boolean;
  allowSkuAnalytics: boolean;
  allowManageOrganizationTargets: boolean;
  allowManageOwnTargets: boolean;
  dashboards: DashboardKey[];
  metricGroups: MetricGroup[];
  filterVisibility: Record<string, unknown>;
  isActive: boolean;
  warehouseAccess: number[];
  buyerAccess: number[];
  subAdminAssociations: number[];
  warehouseScopeMode: "all" | "custom";
  buyerScopeMode: "all" | "associated";
  version: number;
  createdBy?: number;
  updatedBy?: number;
  createdAt: Date;
  updatedAt: Date;
}

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

function defaultDashboards(role: AnalyticsRole): DashboardKey[] {
  if (role === "sub_admin") {
    return ["overview", "sales", "sku_analytics", "buyers", "memos", "warehouses"];
  }

  return ["overview", "sales", "purchase", "sku_analytics", "buyers", "memos", "warehouses"];
}

function defaultMetricGroups(role: AnalyticsRole): MetricGroup[] {
  if (role === "sub_admin") {
    return ["sales", "memo", "sku_analytics", "buyer_analytics", "warehouse_analytics"];
  }

  return ["sales", "memo", "purchase", "financial_totals", "sku_analytics", "buyer_analytics", "warehouse_analytics"];
}

function defaultFilterVisibility(role: AnalyticsRole) {
  return role === "sub_admin" ? subAdminFilterVisibility : fullFilterVisibility;
}

function defaultAccessMode(role: AnalyticsRole): AccessMode {
  return role === "sub_admin" ? "scoped_access" : "full_access";
}

function defaultIsActive(role: AnalyticsRole) {
  return role === "founder" || role === "admin";
}

function toUserIdentity(user: MongoUserDoc): UserIdentity {
  return {
    sourceUserId: user.sourceUserId,
    websiteUserId: user.websiteUserId,
    email: user.email,
    fullName: user.fullName,
    websiteRole: user.websiteRole,
    analyticsRole: user.analyticsRole
  };
}

function asStringArray<T extends string>(value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((entry): entry is T => typeof entry === "string") as T[];
}

function normalizeFilterVisibility(value: unknown, role: AnalyticsRole): FilterVisibility {
  const defaults = defaultFilterVisibility(role);
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    warehouses: typeof record.warehouses === "boolean" ? record.warehouses : defaults.warehouses,
    buyers: typeof record.buyers === "boolean" ? record.buyers : defaults.buyers,
    subAdmins: typeof record.subAdmins === "boolean" ? record.subAdmins : defaults.subAdmins,
    vendors: typeof record.vendors === "boolean" ? record.vendors : defaults.vendors,
    skus: typeof record.skus === "boolean" ? record.skus : defaults.skus,
    shape: typeof record.shape === "boolean" ? record.shape : defaults.shape,
    size: typeof record.size === "boolean" ? record.size : defaults.size,
    color: typeof record.color === "boolean" ? record.color : defaults.color,
    clarity: typeof record.clarity === "boolean" ? record.clarity : defaults.clarity,
    purchase: typeof record.purchase === "boolean" ? record.purchase : defaults.purchase,
    memo: typeof record.memo === "boolean" ? record.memo : defaults.memo
  };
}

function sortedUnique(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

export class MongoPermissionRepository implements PermissionRepository {
  constructor(private readonly db: Db) {}

  private users() {
    return this.db.collection<MongoUserDoc>("analytics_users");
  }

  private policies() {
    return this.db.collection<MongoAccessPolicyDoc>("analytics_access_policies");
  }

  private async buildPolicy(user: MongoUserDoc, policy: MongoAccessPolicyDoc | null): Promise<AnalyticsAccessPolicy> {
    const analyticsRole = policy?.analyticsRole ?? user.analyticsRole;
    const accessMode = policy?.accessMode ?? defaultAccessMode(analyticsRole);
    const warehouseScopeMode = policy?.warehouseScopeMode ?? (accessMode === "full_access" ? "all" : "custom");
    const buyerScopeMode = policy?.buyerScopeMode ?? (accessMode === "full_access" ? "all" : "associated");
    const subAdminAssociations = policy?.subAdminAssociations ?? (analyticsRole === "sub_admin" ? [user.sourceUserId] : []);
    const buyerAccess = policy?.buyerAccess ?? await this.listAssociatedBuyerKeys(subAdminAssociations);

    return {
      sourceUserId: user.sourceUserId,
      analyticsRole,
      accessMode,
      allowGlobalTotals: policy?.allowGlobalTotals ?? (analyticsRole !== "sub_admin"),
      allowExport: policy?.allowExport ?? (analyticsRole !== "sub_admin"),
      allowDrilldown: policy?.allowDrilldown ?? true,
      allowPurchaseVisibility: policy?.allowPurchaseVisibility ?? (analyticsRole !== "sub_admin"),
      allowMemoVisibility: policy?.allowMemoVisibility ?? true,
      allowSkuAnalytics: policy?.allowSkuAnalytics ?? true,
      allowManageOrganizationTargets:
        analyticsRole === "founder" || analyticsRole === "admin"
          ? true
          : policy?.allowManageOrganizationTargets ?? false,
      allowManageOwnTargets:
        analyticsRole === "founder" || analyticsRole === "admin"
          ? true
          : policy?.allowManageOwnTargets ?? true,
      warehouseKeys: accessMode === "full_access" || warehouseScopeMode === "all"
        ? "ALL"
        : sortedUnique(policy?.warehouseAccess ?? []),
      buyerKeys: accessMode === "full_access" || buyerScopeMode === "all"
        ? "ALL"
        : sortedUnique(buyerAccess),
      subAdminKeys: accessMode === "full_access"
        ? "ALL"
        : sortedUnique(subAdminAssociations),
      dashboards: asStringArray<DashboardKey>(policy?.dashboards, defaultDashboards(analyticsRole)),
      metricGroups: asStringArray<MetricGroup>(policy?.metricGroups, defaultMetricGroups(analyticsRole)),
      filterVisibility: normalizeFilterVisibility(policy?.filterVisibility, analyticsRole),
      isActive: policy?.isActive ?? defaultIsActive(analyticsRole)
    };
  }

  private async listAssociatedBuyerKeys(subAdminKeys: number[]) {
    if (subAdminKeys.length === 0) {
      return [] as number[];
    }

    const rows = await this.db.collection<{ buyerKey: number | null }>("analytics_rows")
      .aggregate<{ buyerKey: number }>([
        { $match: { subAdminKeys: { $in: subAdminKeys }, buyerKey: { $ne: null } } },
        { $group: { _id: "$buyerKey" } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, buyerKey: "$_id" } }
      ])
      .toArray();

    return rows.map((row) => row.buyerKey);
  }

  async getUserBySourceUserId(sourceUserId: number) {
    const user = await this.users().findOne({ _id: sourceUserId, isActive: true });
    return user ? toUserIdentity(user) : null;
  }

  async getUserByWebsiteUserId(websiteUserId: string) {
    const normalizedWebsiteUserId = websiteUserId.trim().toLowerCase();
    if (!normalizedWebsiteUserId) {
      return null;
    }

    const user = await this.users().findOne({
      websiteUserId: normalizedWebsiteUserId,
      isActive: true
    });
    return user ? toUserIdentity(user) : null;
  }

  async getPolicyBySourceUserId(sourceUserId: number) {
    const user = await this.users().findOne({ _id: sourceUserId, isActive: true });
    if (!user) {
      return null;
    }

    const policy = await this.policies().findOne({ _id: sourceUserId });
    const builtPolicy = await this.buildPolicy(user, policy);
    return builtPolicy.isActive ? builtPolicy : null;
  }

  async listPolicies() {
    const users = await this.users()
      .find({ isActive: true, analyticsRole: { $in: ["founder", "admin", "sub_admin"] } })
      .sort({ sourceUserId: 1 })
      .toArray();

    return Promise.all(users.map(async (user) => {
      const policy = await this.policies().findOne({ _id: user.sourceUserId });
      return this.buildPolicy(user, policy);
    }));
  }

  async listUsers() {
    const users = await this.users()
      .find({ isActive: true, analyticsRole: { $in: ["founder", "admin", "sub_admin"] } })
      .sort({ sourceUserId: 1 })
      .toArray();

    return users.map(toUserIdentity);
  }

  async listWarehouses(): Promise<WarehouseOption[]> {
    return this.db.collection<WarehouseOption>("analytics_warehouses").find({}).sort({ key: 1 }).toArray();
  }

  async listBuyers(): Promise<BuyerOption[]> {
    return this.db.collection<BuyerOption>("analytics_buyers").find({}).sort({ key: 1 }).toArray();
  }

  async listSubAdmins(): Promise<SubAdminOption[]> {
    return this.db.collection<SubAdminOption>("analytics_sub_admins").find({}).sort({ key: 1 }).toArray();
  }

  async listVendors(): Promise<VendorOption[]> {
    return this.db.collection<VendorOption>("analytics_vendors").find({}).sort({ key: 1 }).toArray();
  }

  async listProducts(): Promise<ProductOption[]> {
    return this.db.collection<ProductOption>("analytics_products").find({}).sort({ key: 1 }).toArray();
  }

  async updateSubAdminPolicy(
    actorSourceUserId: number,
    sourceUserId: number,
    input: UpdateSubAdminAccessInput
  ) {
    const user = await this.users().findOne({ _id: sourceUserId, isActive: true });
    if (!user || user.analyticsRole !== "sub_admin") {
      return null;
    }

    const existing = await this.policies().findOne({ _id: sourceUserId });
    const existingPolicy = await this.buildPolicy(user, existing);
    const subAdminAssociations = existing?.subAdminAssociations ?? (
      existingPolicy.subAdminKeys === "ALL" ? [] : existingPolicy.subAdminKeys
    );
    const buyerAccess = input.buyerScopeMode === "all"
      ? []
      : await this.listAssociatedBuyerKeys(subAdminAssociations);
    const currentFilterVisibility = existing?.filterVisibility ?? {};
    const nextFilterVisibility = {
      ...currentFilterVisibility,
      ...existingPolicy.filterVisibility,
      _warehouseScopeMode: input.warehouseScopeMode,
      _buyerScopeMode: input.buyerScopeMode
    };
    const now = new Date();

    await this.policies().updateOne(
      { _id: sourceUserId },
      {
        $set: {
          sourceUserId,
          analyticsRole: "sub_admin",
          accessMode: "scoped_access",
          allowGlobalTotals: existingPolicy.allowGlobalTotals,
          allowPurchaseVisibility: existingPolicy.allowPurchaseVisibility,
          allowMemoVisibility: existingPolicy.allowMemoVisibility,
          allowSkuAnalytics: existingPolicy.allowSkuAnalytics,
          allowManageOrganizationTargets: input.allowManageOrganizationTargets,
          allowManageOwnTargets: input.allowManageOwnTargets,
          allowExport: existingPolicy.allowExport,
          allowDrilldown: existingPolicy.allowDrilldown,
          dashboards: existingPolicy.dashboards,
          metricGroups: existingPolicy.metricGroups,
          filterVisibility: nextFilterVisibility,
          isActive: input.isActive,
          warehouseAccess: input.warehouseScopeMode === "all" ? [] : sortedUnique(input.warehouseKeys),
          buyerAccess,
          subAdminAssociations,
          warehouseScopeMode: input.warehouseScopeMode,
          buyerScopeMode: input.buyerScopeMode,
          version: (existing?.version ?? 0) + 1,
          updatedBy: actorSourceUserId,
          updatedAt: now
        },
        $setOnInsert: {
          _id: sourceUserId,
          createdBy: actorSourceUserId,
          createdAt: now
        }
      },
      { upsert: true }
    );

    const nextPolicy = await this.policies().findOne({ _id: sourceUserId });
    return nextPolicy ? this.buildPolicy(user, nextPolicy) : null;
  }
}
