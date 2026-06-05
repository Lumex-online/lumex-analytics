import type { FastifyInstance } from "fastify";
import type { ExecutiveDashboardController } from "./executive-dashboard.controller.js";

export async function registerExecutiveDashboardRoutes(
  app: FastifyInstance,
  options: { controller: ExecutiveDashboardController }
) {
  app.post("/api/v1/analytics/executive/summary", async (request) =>
    options.controller.getSummary(request as never)
  );
}
