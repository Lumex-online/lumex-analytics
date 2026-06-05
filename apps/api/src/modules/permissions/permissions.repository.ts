import type {
  AnalyticsAccessPolicy,
  BuyerOption,
  ProductOption,
  SubAdminOption,
  UpdateSubAdminAccessInput,
  UserIdentity,
  VendorOption,
  WarehouseOption
} from "@lumex/shared-types";
import { getLumexDataset } from "@lumex/lumex-source";

export interface PermissionRepository {
  getUserBySourceUserId(sourceUserId: number): Promise<UserIdentity | null>;
  getUserByWebsiteUserId(websiteUserId: string): Promise<UserIdentity | null>;
  getPolicyBySourceUserId(sourceUserId: number): Promise<AnalyticsAccessPolicy | null>;
  listPolicies(): Promise<AnalyticsAccessPolicy[]>;
  listUsers(): Promise<UserIdentity[]>;
  listWarehouses(): Promise<WarehouseOption[]>;
  listBuyers(): Promise<BuyerOption[]>;
  listSubAdmins(): Promise<SubAdminOption[]>;
  listVendors(): Promise<VendorOption[]>;
  listProducts(): Promise<ProductOption[]>;
  updateSubAdminPolicy(
    actorSourceUserId: number,
    sourceUserId: number,
    input: UpdateSubAdminAccessInput
  ): Promise<AnalyticsAccessPolicy | null>;
}

function fullFilterVisibility() {
  return {
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
  } as const;
}

export class BootstrapPermissionRepository implements PermissionRepository {
  private readonly dataset = getLumexDataset();

  private readonly staticUsers = this.dataset.adminUsers;

  private readonly policiesBySourceUserId = new Map<number, AnalyticsAccessPolicy>(
    this.buildInitialPolicies().map((policy) => [policy.sourceUserId, policy])
  );

  private getAssociatedBuyerKeys(subAdminKeys: number[]) {
    return [...new Set(
      this.dataset.rows
        .filter((row) => row.buyerKey !== null && row.subAdminKeys.some((subAdminKey) => subAdminKeys.includes(subAdminKey)))
        .map((row) => row.buyerKey as number)
    )].sort((left, right) => left - right);
  }

  private getWarehouseKeysForBuyerKeys(buyerKeys: number[]) {
    return [...new Set(
      this.dataset.buyers
        .filter((buyer) => buyerKeys.includes(buyer.key))
        .flatMap((buyer) => buyer.warehouseKeys)
    )].sort((left, right) => left - right);
  }

  private buildInitialPolicies(): AnalyticsAccessPolicy[] {
    const allSubAdminKeys = this.dataset.subAdmins.map((subAdmin) => subAdmin.key);
    const subAdminUsers = this.dataset.subAdminUsers;

    const staticPolicies: AnalyticsAccessPolicy[] = this.staticUsers.map((user) => ({
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
      dashboards: ["overview", "sales", "purchase", "sku_analytics", "buyers", "memos", "warehouses"],
      metricGroups: ["sales", "memo", "purchase", "financial_totals", "sku_analytics", "buyer_analytics", "warehouse_analytics"],
      filterVisibility: fullFilterVisibility(),
      isActive: true
    }));

    const subAdminPolicies: AnalyticsAccessPolicy[] = subAdminUsers.map((user, index) => {
      const assignedSubAdminKey = allSubAdminKeys[index] ?? allSubAdminKeys[0] ?? null;
      const subAdminKeys = assignedSubAdminKey === null ? [] : [assignedSubAdminKey];
      const associatedBuyerKeys = this.getAssociatedBuyerKeys(subAdminKeys);

      return {
        sourceUserId: user.sourceUserId,
        analyticsRole: "sub_admin" as const,
        accessMode: "scoped_access" as const,
        allowGlobalTotals: false,
        allowExport: false,
        allowDrilldown: true,
        allowPurchaseVisibility: false,
        allowMemoVisibility: true,
        allowSkuAnalytics: true,
        allowManageOrganizationTargets: false,
        allowManageOwnTargets: true,
        warehouseKeys: this.getWarehouseKeysForBuyerKeys(associatedBuyerKeys),
        buyerKeys: associatedBuyerKeys,
        subAdminKeys,
        dashboards: ["overview", "sales", "sku_analytics", "buyers", "memos", "warehouses"],
        metricGroups: ["sales", "memo", "sku_analytics", "buyer_analytics", "warehouse_analytics"],
        filterVisibility: {
          ...fullFilterVisibility(),
          warehouses: false,
          subAdmins: false,
          purchase: false
        },
        isActive: true
      };
    });

    return [...staticPolicies, ...subAdminPolicies];
  }

  async getUserBySourceUserId(sourceUserId: number) {
    return [...this.staticUsers, ...this.dataset.subAdminUsers]
      .find((user) => user.sourceUserId === sourceUserId) ?? null;
  }

  async getUserByWebsiteUserId(websiteUserId: string) {
    const normalizedWebsiteUserId = websiteUserId.trim().toLowerCase();
    if (!normalizedWebsiteUserId) {
      return null;
    }

    return [...this.staticUsers, ...this.dataset.subAdminUsers]
      .find((user) => user.websiteUserId?.trim().toLowerCase() === normalizedWebsiteUserId) ?? null;
  }

  async getPolicyBySourceUserId(sourceUserId: number) {
    const policy = this.policiesBySourceUserId.get(sourceUserId) ?? null;
    return policy?.isActive ? policy : null;
  }

  async listPolicies() {
    return [...this.policiesBySourceUserId.values()].sort((left, right) => left.sourceUserId - right.sourceUserId);
  }

  async listUsers() {
    return [...this.staticUsers, ...this.dataset.subAdminUsers]
      .sort((left, right) => left.sourceUserId - right.sourceUserId);
  }

  async listWarehouses() {
    return this.dataset.warehouses;
  }

  async listBuyers() {
    return this.dataset.buyers;
  }

  async listSubAdmins() {
    return this.dataset.subAdmins;
  }

  async listVendors() {
    return this.dataset.vendors;
  }

  async listProducts() {
    return this.dataset.products;
  }

  async updateSubAdminPolicy(_actorSourceUserId: number, sourceUserId: number, input: UpdateSubAdminAccessInput) {
    const policy = this.policiesBySourceUserId.get(sourceUserId);

    if (!policy || policy.analyticsRole !== "sub_admin") {
      return null;
    }

    const subAdminKeys = Array.isArray(policy.subAdminKeys) ? policy.subAdminKeys : [];
    const associatedBuyerKeys = this.getAssociatedBuyerKeys(subAdminKeys);
    const nextPolicy: AnalyticsAccessPolicy = {
      ...policy,
      accessMode: "scoped_access",
      allowManageOrganizationTargets: input.allowManageOrganizationTargets,
      allowManageOwnTargets: input.allowManageOwnTargets,
      warehouseKeys: input.warehouseScopeMode === "all"
        ? "ALL"
        : [...new Set(input.warehouseKeys)].sort((left, right) => left - right),
      buyerKeys: input.buyerScopeMode === "all" ? "ALL" : associatedBuyerKeys,
      isActive: input.isActive
    };

    this.policiesBySourceUserId.set(sourceUserId, nextPolicy);
    return nextPolicy;
  }
}
