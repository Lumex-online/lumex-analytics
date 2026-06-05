import { applyScopeToFilters } from "@lumex/analytics-core";
import type {
  DashboardFiltersInput,
  SkuAnalyticsSummaryResponse
} from "@lumex/shared-types";
import {
  buildBreakdown,
  filterAnalyticsRows,
  getProduct,
  sumRows
} from "../dashboards/bootstrap.analytics.js";
import { env } from "../../config/env.js";
import { getMongoDb } from "../../database/mongo.js";
import {
  buildBreakdown as buildMongoBreakdown,
  filterAnalyticsRowsMongo,
  getDimensionMapsMongo,
  sumRows as sumMongoRows
} from "../dashboards/mongo-analytics.js";
import type { PermissionService } from "../permissions/permissions.service.js";

export class SkuAnalyticsService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly analyticsStore = env.ANALYTICS_STORE
  ) {}

  async getSummary(
    sourceUserId: number,
    filters: DashboardFiltersInput
  ): Promise<SkuAnalyticsSummaryResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (!scope.allowSkuAnalytics) {
      return { code: "ACCESS_DENIED", message: "SKU analytics is not enabled for this user." };
    }

    const scoped = applyScopeToFilters(scope, filters);
    if (this.analyticsStore === "mongo") {
      const db = await getMongoDb();
      const [rows, maps] = await Promise.all([
        filterAnalyticsRowsMongo(db, scoped.filters),
        getDimensionMapsMongo(db)
      ]);

      return {
        totalSales: sumMongoRows(rows, "salesValue"),
        totalSalesBySku: buildMongoBreakdown(
          rows,
          (row) => String(row.productKey),
          (key) => maps.products.get(Number(key))?.sku ?? key,
          (row) => row.salesValue
        ),
        byShape: buildMongoBreakdown(
          rows,
          (row) => maps.products.get(row.productKey)?.shape ?? row.shape ?? "Unknown",
          (key) => key,
          (row) => row.salesValue
        ),
        bySize: buildMongoBreakdown(
          rows,
          (row) => maps.products.get(row.productKey)?.size ?? row.size ?? "Unknown",
          (key) => key,
          (row) => row.salesValue
        ),
        byColor: buildMongoBreakdown(
          rows,
          (row) => maps.products.get(row.productKey)?.color ?? row.color ?? "Unknown",
          (key) => key,
          (row) => row.salesValue
        ),
        byClarity: buildMongoBreakdown(
          rows,
          (row) => maps.products.get(row.productKey)?.clarity ?? row.clarity ?? "Unknown",
          (key) => key,
          (row) => row.salesValue
        ),
        appliedScope: scoped.appliedScope
      };
    }

    const rows = filterAnalyticsRows(scoped.filters);

    return {
      totalSales: sumRows(rows, "salesValue"),
      totalSalesBySku: buildBreakdown(
        rows,
        (row) => String(row.productKey),
        (key) => getProduct(Number(key))?.sku ?? key,
        (row) => row.salesValue
      ),
      byShape: buildBreakdown(
        rows,
        (row) => getProduct(row.productKey)?.shape ?? "Unknown",
        (key) => key,
        (row) => row.salesValue
      ),
      bySize: buildBreakdown(
        rows,
        (row) => getProduct(row.productKey)?.size ?? "Unknown",
        (key) => key,
        (row) => row.salesValue
      ),
      byColor: buildBreakdown(
        rows,
        (row) => getProduct(row.productKey)?.color ?? "Unknown",
        (key) => key,
        (row) => row.salesValue
      ),
      byClarity: buildBreakdown(
        rows,
        (row) => getProduct(row.productKey)?.clarity ?? "Unknown",
        (key) => key,
        (row) => row.salesValue
      ),
      appliedScope: scoped.appliedScope
    };
  }
}
