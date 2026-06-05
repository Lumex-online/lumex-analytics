import { applyScopeToFilters } from "@lumex/analytics-core";
import type {
  DashboardFiltersInput,
  MemoConversionSummaryResponse
} from "@lumex/shared-types";
import {
  conversionRate,
  filterAnalyticsRows,
  getBuyerName,
  sumRows
} from "../dashboards/bootstrap.analytics.js";
import { env } from "../../config/env.js";
import { getMongoDb } from "../../database/mongo.js";
import {
  conversionRate as mongoConversionRate,
  filterAnalyticsRowsMongo,
  getBuyerNameFromMaps,
  getDimensionMapsMongo,
  sumRows as sumMongoRows
} from "../dashboards/mongo-analytics.js";
import type { PermissionService } from "../permissions/permissions.service.js";

export class MemoConversionService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly analyticsStore = env.ANALYTICS_STORE
  ) {}

  async getSummary(
    sourceUserId: number,
    filters: DashboardFiltersInput
  ): Promise<MemoConversionSummaryResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (!scope.allowMemoVisibility) {
      return { code: "ACCESS_DENIED", message: "Memo analytics is not enabled for this user." };
    }

    const scoped = applyScopeToFilters(scope, filters);
    if (this.analyticsStore === "mongo") {
      const db = await getMongoDb();
      const [rows, maps] = await Promise.all([
        filterAnalyticsRowsMongo(db, scoped.filters),
        getDimensionMapsMongo(db)
      ]);
      const buyers = [...new Set(rows.map((row) => row.buyerKey).filter((buyerKey): buyerKey is number => buyerKey !== null))].map((buyerKey) => {
        const buyerRows = rows.filter((row) => row.buyerKey === buyerKey);
        const memoGivenValue = sumMongoRows(buyerRows, "memoGivenValue");
        const convertedMemoValue = sumMongoRows(buyerRows, "memoConvertedValue");

        return {
          buyerKey,
          buyerName: getBuyerNameFromMaps(maps, buyerKey),
          memoGivenValue,
          convertedMemoValue,
          conversionRate: memoGivenValue === 0 ? 0 : Number((convertedMemoValue / memoGivenValue).toFixed(4))
        };
      });

      return {
        memoGivenValue: sumMongoRows(rows, "memoGivenValue"),
        convertedMemoValue: sumMongoRows(rows, "memoConvertedValue"),
        conversionRate: Number(mongoConversionRate(rows).toFixed(4)),
        buyers,
        appliedScope: scoped.appliedScope
      };
    }

    const rows = filterAnalyticsRows(scoped.filters);
    const buyers = [...new Set(rows.map((row) => row.buyerKey).filter((buyerKey): buyerKey is number => buyerKey !== null))].map((buyerKey) => {
      const buyerRows = rows.filter((row) => row.buyerKey === buyerKey);
      const memoGivenValue = sumRows(buyerRows, "memoGivenValue");
      const convertedMemoValue = sumRows(buyerRows, "memoConvertedValue");

      return {
        buyerKey,
        buyerName: getBuyerName(buyerKey),
        memoGivenValue,
        convertedMemoValue,
        conversionRate: memoGivenValue === 0 ? 0 : Number((convertedMemoValue / memoGivenValue).toFixed(4))
      };
    });

    return {
      memoGivenValue: sumRows(rows, "memoGivenValue"),
      convertedMemoValue: sumRows(rows, "memoConvertedValue"),
      conversionRate: Number(conversionRate(rows).toFixed(4)),
      buyers,
      appliedScope: scoped.appliedScope
    };
  }
}
