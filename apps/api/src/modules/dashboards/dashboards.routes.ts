import type { FastifyInstance } from "fastify";
import type { DashboardController } from "./dashboards.controller.js";

export async function registerDashboardRoutes(
  app: FastifyInstance,
  options: { controller: DashboardController }
) {
  app.post("/api/v1/dashboards/:dashboardKey/summary", async (request) =>
    options.controller.getSummary(request as never)
  );

  app.post("/api/v1/dashboards/:dashboardKey/charts/:chartKey", async (request) =>
    options.controller.getChart(request as never)
  );
}
