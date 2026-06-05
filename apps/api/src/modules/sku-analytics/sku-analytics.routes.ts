import type { FastifyInstance } from "fastify";
import type { SkuAnalyticsController } from "./sku-analytics.controller.js";

export async function registerSkuAnalyticsRoutes(
  app: FastifyInstance,
  options: { controller: SkuAnalyticsController }
) {
  app.post("/api/v1/analytics/sku/summary", async (request) =>
    options.controller.getSummary(request as never)
  );
}
