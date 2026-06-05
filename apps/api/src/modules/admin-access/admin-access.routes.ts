import type { FastifyInstance } from "fastify";
import type { AdminAccessController } from "./admin-access.controller.js";

export async function registerAdminAccessRoutes(
  app: FastifyInstance,
  options: { controller: AdminAccessController }
) {
  app.get("/api/v1/admin/access-policies", async (request, reply) =>
    options.controller.listPolicies(request, reply)
  );

  app.patch("/api/v1/admin/access-policies/:sourceUserId", async (request, reply) =>
    options.controller.updateSubAdminPolicy(request, reply)
  );
}
