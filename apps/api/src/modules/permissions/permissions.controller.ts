import type { FastifyRequest } from "fastify";
import type { PermissionService } from "./permissions.service.js";

export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  async getMyPermissions(request: FastifyRequest) {
    return this.permissionService.getPermissionMetadata(request.authContext.sourceUserId);
  }
}
