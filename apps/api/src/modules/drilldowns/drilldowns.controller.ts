import type { FastifyRequest } from "fastify";
import type { DashboardFiltersInput } from "@lumex/shared-types";
import type { DrilldownsService } from "./drilldowns.service.js";

export class DrilldownsController {
  constructor(private readonly drilldownsService: DrilldownsService) {}

  async getTransactions(
    request: FastifyRequest<{
      Body: DashboardFiltersInput;
    }>
  ) {
    return this.drilldownsService.getTransactions(
      request.authContext.sourceUserId,
      request.body ?? {}
    );
  }
}
