import type { FastifyInstance } from "fastify";
import type { FiltersController } from "./filters.controller.js";

export async function registerFiltersRoutes(
  app: FastifyInstance,
  options: { controller: FiltersController }
) {
  app.get("/api/v1/metadata/filters", async (request) => options.controller.getFilters(request as never));
}
