import type { FastifyInstance } from "fastify";
import type { KpiTargetController } from "./kpi-targets.controller.js";

export async function registerKpiTargetRoutes(
  app: FastifyInstance,
  options: { controller: KpiTargetController }
) {
  app.get("/api/v1/admin/kpi-targets", async (request, reply) =>
    options.controller.listTargets(request, reply)
  );

  app.put("/api/v1/admin/kpi-targets", async (request, reply) =>
    options.controller.upsertTarget(request, reply)
  );

  app.delete("/api/v1/admin/kpi-targets", async (request, reply) =>
    options.controller.deleteTarget(request, reply)
  );
}
