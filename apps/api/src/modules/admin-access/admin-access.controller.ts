import type { FastifyReply, FastifyRequest } from "fastify";
import type { UpdateSubAdminAccessInput } from "@lumex/shared-types";
import type { PermissionService } from "../permissions/permissions.service.js";

export class AdminAccessController {
  constructor(private readonly permissionService: PermissionService) {}

  private ensureAdminAccess(request: FastifyRequest, reply: FastifyReply) {
    const analyticsRole = request.resolvedScope.user.analyticsRole;

    if (analyticsRole !== "founder" && analyticsRole !== "admin") {
      reply.code(403).send({
        code: "ACCESS_DENIED",
        message: "Only founder and admin users can manage analytics access policies."
      });
      return false;
    }

    return true;
  }

  async listPolicies(request: FastifyRequest, reply: FastifyReply) {
    if (!this.ensureAdminAccess(request, reply)) {
      return;
    }

    return this.permissionService.getAdminPolicies();
  }

  async updateSubAdminPolicy(request: FastifyRequest, reply: FastifyReply) {
    if (!this.ensureAdminAccess(request, reply)) {
      return;
    }

    const params = request.params as { sourceUserId?: string };
    const sourceUserId = Number(params.sourceUserId);
    const body = request.body as Partial<UpdateSubAdminAccessInput>;

    if (!Number.isInteger(sourceUserId) || sourceUserId <= 0) {
      return reply.code(400).send({
        code: "INVALID_SOURCE_USER_ID",
        message: "A valid source user id is required."
      });
    }

    if (
      typeof body.isActive !== "boolean" ||
      (body.warehouseScopeMode !== "all" && body.warehouseScopeMode !== "custom") ||
      (body.buyerScopeMode !== "all" && body.buyerScopeMode !== "associated") ||
      typeof body.allowManageOrganizationTargets !== "boolean" ||
      typeof body.allowManageOwnTargets !== "boolean" ||
      !Array.isArray(body.warehouseKeys) ||
      body.warehouseKeys.some((warehouseKey) => !Number.isInteger(warehouseKey))
    ) {
      return reply.code(400).send({
        code: "INVALID_POLICY_INPUT",
        message: "The submitted sub-admin access policy is invalid."
      });
    }

    try {
      const policy = await this.permissionService.updateSubAdminAccess(
        request.authContext.sourceUserId,
        sourceUserId,
        {
          isActive: body.isActive,
          warehouseScopeMode: body.warehouseScopeMode,
          warehouseKeys: body.warehouseKeys,
          buyerScopeMode: body.buyerScopeMode,
          allowManageOrganizationTargets: body.allowManageOrganizationTargets,
          allowManageOwnTargets: body.allowManageOwnTargets
        }
      );

      if (!policy) {
        return reply.code(404).send({
          code: "SUB_ADMIN_NOT_FOUND",
          message: "The selected sub-admin policy could not be found."
        });
      }

      return policy;
    } catch (error) {
      return reply.code(400).send({
        code: "INVALID_POLICY_INPUT",
        message: error instanceof Error ? error.message : "The submitted sub-admin access policy is invalid."
      });
    }
  }
}
