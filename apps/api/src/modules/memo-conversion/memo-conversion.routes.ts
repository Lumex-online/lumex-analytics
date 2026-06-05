import type { FastifyInstance } from "fastify";
import type { MemoConversionController } from "./memo-conversion.controller.js";

export async function registerMemoConversionRoutes(
  app: FastifyInstance,
  options: { controller: MemoConversionController }
) {
  app.post("/api/v1/analytics/memo-conversion/summary", async (request) =>
    options.controller.getSummary(request as never)
  );
}
