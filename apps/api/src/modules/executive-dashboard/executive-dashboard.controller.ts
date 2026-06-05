import type { FastifyRequest } from "fastify";
import type { DashboardFiltersInput } from "@lumex/shared-types";
import type { ExecutiveDashboardService } from "./executive-dashboard.service.js";

export class ExecutiveDashboardController {
  constructor(private readonly executiveDashboardService: ExecutiveDashboardService) {}

  async getSummary(
    request: FastifyRequest<{
      Body: DashboardFiltersInput;
    }>
  ) {
    return this.executiveDashboardService.getSummary(
      request.authContext.sourceUserId,
      request.body ?? {}
    );
  }
}
