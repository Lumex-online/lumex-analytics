import { applyScopeToFilters } from "@lumex/analytics-core";
import type {
  DashboardFiltersInput,
  DrilldownResponse
} from "@lumex/shared-types";
import {
  filterAnalyticsRows,
  getBuyerName,
  getProduct,
  getSubAdminName,
  getWarehouseName
} from "../dashboards/bootstrap.analytics.js";
import { env } from "../../config/env.js";
import { getMongoDb } from "../../database/mongo.js";
import {
  filterAnalyticsRowsMongo,
  getBuyerNameFromMaps,
  getDimensionMapsMongo,
  getSubAdminNameFromMaps,
  getWarehouseNameFromMaps
} from "../dashboards/mongo-analytics.js";
import type { PermissionService } from "../permissions/permissions.service.js";

export class DrilldownsService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly analyticsStore = env.ANALYTICS_STORE
  ) {}

  async getTransactions(
    sourceUserId: number,
    filters: DashboardFiltersInput
  ): Promise<DrilldownResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    const scoped = applyScopeToFilters(scope, filters);

    if (this.analyticsStore === "mongo") {
      const db = await getMongoDb();
      const [rows, maps] = await Promise.all([
        filterAnalyticsRowsMongo(db, scoped.filters),
        getDimensionMapsMongo(db)
      ]);

      return {
        columns: [
          "Date",
          "Buyer",
          "Sub-admin",
          "Warehouse",
          "Product Type",
          "Shape",
          "Size",
          "Color",
          "Clarity",
          "Stock No / Certificate No",
          "Qty / Pcs",
          "Sales Value",
          "Purchase Value",
          "Memo Flag",
          "Order / Invoice Status"
        ],
        rows: rows.map((row) => ({
          date: row.date,
          buyer: getBuyerNameFromMaps(maps, row.buyerKey),
          subAdmin: getSubAdminNameFromMaps(maps, row.subAdminKey),
          warehouse: getWarehouseNameFromMaps(maps, row.warehouseKey),
          productType: row.productType,
          shape: row.product?.shape ?? "Unknown",
          size: row.product?.size ?? "Unknown",
          color: row.product?.color ?? "Unknown",
          clarity: row.product?.clarity ?? "Unknown",
          stockNumber: row.product?.sku ?? row.stockNumber,
          quantity: row.quantity,
          salesValue: row.salesValue,
          purchaseValue: row.purchaseValue,
          memoFlag: row.memoGivenValue > 0 ? "Yes" : "No",
          orderInvoiceStatus: row.memoConvertedValue > 0 ? "Invoiced" : "Open"
        })),
        totalRows: rows.length,
        exportAllowed: scope.allowExport
      };
    }

    const rows = filterAnalyticsRows(scoped.filters);

    return {
      columns: [
        "Date",
        "Buyer",
        "Sub-admin",
        "Warehouse",
        "Product Type",
        "Shape",
        "Size",
        "Color",
        "Clarity",
        "Stock No / Certificate No",
        "Qty / Pcs",
        "Sales Value",
        "Purchase Value",
        "Memo Flag",
        "Order / Invoice Status"
      ],
      rows: rows.map((row) => {
        const product = getProduct(row.productKey);

        return {
          date: row.date,
          buyer: getBuyerName(row.buyerKey),
          subAdmin: getSubAdminName(row.subAdminKey),
          warehouse: getWarehouseName(row.warehouseKey),
          productType: row.productKey % 2 === 0 ? "own_shape" : "loose_lot",
          shape: product?.shape ?? "Unknown",
          size: product?.size ?? "Unknown",
          color: product?.color ?? "Unknown",
          clarity: product?.clarity ?? "Unknown",
          stockNumber: product?.sku ?? `STOCK-${row.productKey}`,
          quantity: row.quantity,
          salesValue: row.salesValue,
          purchaseValue: row.purchaseValue,
          memoFlag: row.memoGivenValue > 0 ? "Yes" : "No",
          orderInvoiceStatus: row.memoConvertedValue > 0 ? "Invoiced" : "Open"
        };
      }),
      totalRows: rows.length,
      exportAllowed: scope.allowExport
    };
  }
}
