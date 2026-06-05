import type { FastifyInstance } from "fastify";
import type { HealthController } from "./health.controller.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: { controller: HealthController }
) {
  app.get("/health", async () => options.controller.getStatus());
}
