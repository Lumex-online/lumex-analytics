import type { FastifyRequest } from "fastify";
import type { DashboardKey } from "@lumex/shared-types";
import type { FiltersService } from "./filters.service.js";

export class FiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  async getFilters(request: FastifyRequest<{ Querystring: { dashboardKey: DashboardKey } }>) {
    return this.filtersService.getFilters(
      request.authContext.sourceUserId,
      request.query.dashboardKey
    );
  }
}
