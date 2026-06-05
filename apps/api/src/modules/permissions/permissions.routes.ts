import type { FastifyInstance } from "fastify";
import type { PermissionController } from "./permissions.controller.js";

export async function registerPermissionRoutes(
  app: FastifyInstance,
  options: { controller: PermissionController }
) {
  app.get("/api/v1/me/permissions", async (request) => options.controller.getMyPermissions(request));
}
