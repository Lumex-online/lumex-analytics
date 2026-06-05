import type { FastifyRequest } from "fastify";
import type { DashboardFiltersInput, DashboardKey } from "@lumex/shared-types";
import type { DashboardService } from "./dashboards.service.js";

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  async getSummary(
    request: FastifyRequest<{
      Params: { dashboardKey: DashboardKey };
      Body: DashboardFiltersInput;
    }>
  ) {
    return this.dashboardService.getSummary(
      request.authContext.sourceUserId,
      request.params.dashboardKey,
      request.body ?? {}
    );
  }

  async getChart(
    request: FastifyRequest<{
      Params: { dashboardKey: DashboardKey; chartKey: string };
      Body: DashboardFiltersInput;
    }>
  ) {
    return this.dashboardService.getChart(
      request.authContext.sourceUserId,
      request.params.dashboardKey,
      request.params.chartKey,
      request.body ?? {}
    );
  }
}
