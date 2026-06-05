import type {
  AdminAccessPolicyResponse,
  AnalyticsAccessPolicy,
  PermissionMetadataResponse,
  ResolvedScope,
  UpdateSubAdminAccessInput
} from "@lumex/shared-types";
import type { PermissionRepository } from "./permissions.repository.js";

export class PermissionService {
  constructor(private readonly repository: PermissionRepository) {}

  async resolveSourceUserId(authUserId: string): Promise<number | null> {
    const normalizedAuthUserId = authUserId.trim();
    if (!normalizedAuthUserId) {
      return null;
    }

    const numericSourceUserId = Number(normalizedAuthUserId);
    if (Number.isInteger(numericSourceUserId) && numericSourceUserId > 0) {
      const user = await this.repository.getUserBySourceUserId(numericSourceUserId);
      if (user) {
        return numericSourceUserId;
      }
    }

    const user = await this.repository.getUserByWebsiteUserId(normalizedAuthUserId);
    return user?.sourceUserId ?? null;
  }

  async getResolvedScope(sourceUserId: number): Promise<ResolvedScope | null> {
    const [user, policy] = await Promise.all([
      this.repository.getUserBySourceUserId(sourceUserId),
      this.repository.getPolicyBySourceUserId(sourceUserId)
    ]);

    if (!user || !policy) {
      return null;
    }

    return {
      user,
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
      warehouseKeys: policy.warehouseKeys,
      buyerKeys: policy.buyerKeys,
      subAdminKeys: policy.subAdminKeys,
      filterVisibility: policy.filterVisibility
    };
  }

  async getPermissionMetadata(sourceUserId: number): Promise<PermissionMetadataResponse | null> {
    const scope = await this.getResolvedScope(sourceUserId);

    if (!scope) {
      return null;
    }

    return {
      user: scope.user,
      dashboards: scope.dashboards,
      metricGroups: scope.metricGroups,
      warehouseScope: scope.warehouseKeys,
      buyerScope: scope.buyerKeys,
      subAdminScope: scope.subAdminKeys,
      allowGlobalTotals: scope.allowGlobalTotals,
      allowExport: scope.allowExport,
      allowDrilldown: scope.allowDrilldown,
      allowPurchaseVisibility: scope.allowPurchaseVisibility,
      allowMemoVisibility: scope.allowMemoVisibility,
      allowSkuAnalytics: scope.allowSkuAnalytics,
      allowManageOrganizationTargets: scope.allowManageOrganizationTargets,
      allowManageOwnTargets: scope.allowManageOwnTargets,
      filterVisibility: scope.filterVisibility
    };
  }

  async getAdminPolicies(): Promise<AdminAccessPolicyResponse> {
    const [policies, users, warehouses, buyers, subAdmins, vendors, skus] = await Promise.all([
      this.repository.listPolicies(),
      this.repository.listUsers(),
      this.repository.listWarehouses(),
      this.repository.listBuyers(),
      this.repository.listSubAdmins(),
      this.repository.listVendors(),
      this.repository.listProducts()
    ]);

    return { policies, users, warehouses, buyers, subAdmins, vendors, skus };
  }

  async updateSubAdminAccess(
    actorSourceUserId: number,
    sourceUserId: number,
    input: UpdateSubAdminAccessInput
  ): Promise<AnalyticsAccessPolicy | null> {
    const [user, warehouses] = await Promise.all([
      this.repository.getUserBySourceUserId(sourceUserId),
      this.repository.listWarehouses()
    ]);

    if (!user || user.analyticsRole !== "sub_admin") {
      return null;
    }

    if (input.warehouseScopeMode === "custom") {
      const validWarehouseKeys = new Set(warehouses.map((warehouse) => warehouse.key));
      const normalizedWarehouseKeys = [...new Set(input.warehouseKeys)];

      if (normalizedWarehouseKeys.length === 0) {
        throw new Error("Select at least one warehouse for custom warehouse access.");
      }

      if (normalizedWarehouseKeys.some((warehouseKey) => !validWarehouseKeys.has(warehouseKey))) {
        throw new Error("One or more selected warehouses are not valid.");
      }
    }

    return this.repository.updateSubAdminPolicy(actorSourceUserId, sourceUserId, input);
  }
}
