import type { FastifyInstance } from "fastify";
import type { DrilldownsController } from "./drilldowns.controller.js";

export async function registerDrilldownsRoutes(
  app: FastifyInstance,
  options: { controller: DrilldownsController }
) {
  app.post("/api/v1/drilldowns/transactions", async (request) =>
    options.controller.getTransactions(request as never)
  );
}
