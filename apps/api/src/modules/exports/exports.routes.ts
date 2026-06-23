import type { FastifyInstance } from "fastify";
import type { ExportsController } from "./exports.controller.js";

export async function registerExportsRoutes(
  app: FastifyInstance,
  options: { controller: ExportsController }
) {
  app.get("/api/v1/exports/purchase", async (request, reply) =>
    options.controller.downloadPurchaseWorkbook(request, reply)
  );
  app.get("/api/v1/exports/sales", async (request, reply) =>
    options.controller.downloadSalesWorkbook(request, reply)
  );
}
