import type { DashboardFiltersMetadata, DashboardKey } from "@lumex/shared-types";
import { getLumexDataset } from "@lumex/lumex-source";
import { env } from "../../config/env.js";
import { getMongoDb } from "../../database/mongo.js";
import { getDatasetMetadataMongo, getDistinctRowValuesMongo } from "../dashboards/mongo-analytics.js";
import type { PermissionRepository } from "../permissions/permissions.repository.js";
import type { PermissionService } from "../permissions/permissions.service.js";

export class FiltersService {
  constructor(
    private readonly repository: PermissionRepository,
    private readonly permissionService: PermissionService,
    private readonly analyticsStore = env.ANALYTICS_STORE
  ) {}

  async getFilters(sourceUserId: number, dashboard: DashboardKey): Promise<DashboardFiltersMetadata | null> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return null;
    }

    const [warehouses, buyers, subAdmins, vendors, skus] = await Promise.all([
      this.repository.listWarehouses(),
      this.repository.listBuyers(),
      this.repository.listSubAdmins(),
      this.repository.listVendors(),
      this.repository.listProducts()
    ]);
    const allowedWarehouseKeys = scope.warehouseKeys === "ALL" ? null : scope.warehouseKeys;
    const allowedBuyerKeys = scope.buyerKeys === "ALL" ? null : scope.buyerKeys;
    const allowedSubAdminKeys = scope.subAdminKeys === "ALL" ? null : scope.subAdminKeys;
    const scopedSkus = scope.allowSkuAnalytics ? skus : [];
    const mongoDb = this.analyticsStore === "mongo" ? await getMongoDb() : null;
    const dataset = mongoDb ? null : getLumexDataset();
    const mongoMetadata = mongoDb ? await getDatasetMetadataMongo(mongoDb) : null;
    const mongoDistinct = mongoDb ? await getDistinctRowValuesMongo(mongoDb) : null;
    const productTypes = mongoDistinct?.productTypes ?? [...new Set((dataset?.rows ?? []).map((row) => row.productType))].sort();
    const statuses = mongoDistinct?.statuses ?? [...new Set((dataset?.rows ?? []).map((row) => row.status))].sort();

    return {
      dashboard,
      warehouses:
        allowedWarehouseKeys === null
          ? warehouses
          : warehouses.filter((warehouse) => allowedWarehouseKeys.includes(warehouse.key)),
      buyers:
        (allowedBuyerKeys === null
          ? buyers
          : buyers.filter((buyer) => allowedBuyerKeys.includes(buyer.key)))
          .filter((buyer) => buyer.isVerified),
      subAdmins:
        allowedSubAdminKeys === null
          ? subAdmins
          : subAdmins.filter((subAdmin) => allowedSubAdminKeys.includes(subAdmin.key)),
      vendors,
      skus: scopedSkus,
      shapes: [...new Set(scopedSkus.map((product) => product.shape))],
      sizes: [...new Set(scopedSkus.map((product) => product.size))],
      colors: [...new Set(scopedSkus.map((product) => product.color))],
      clarities: [...new Set(scopedSkus.map((product) => product.clarity))],
      productTypes,
      statuses,
      defaults: {
        dateRange: {
          from: mongoMetadata?.minDate ?? dataset?.minDate ?? "1970-01-01",
          to: mongoMetadata?.maxDate ?? dataset?.maxDate ?? "1970-01-01"
        }
      },
      filterVisibility: scope.filterVisibility
    };
  }
}
