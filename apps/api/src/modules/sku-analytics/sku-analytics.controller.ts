import type { FastifyRequest } from "fastify";
import type { DashboardFiltersInput } from "@lumex/shared-types";
import type { SkuAnalyticsService } from "./sku-analytics.service.js";

export class SkuAnalyticsController {
  constructor(private readonly skuAnalyticsService: SkuAnalyticsService) {}

  async getSummary(
    request: FastifyRequest<{
      Body: DashboardFiltersInput;
    }>
  ) {
    return this.skuAnalyticsService.getSummary(
      request.authContext.sourceUserId,
      request.body ?? {}
    );
  }
}
