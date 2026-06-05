import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import type { PermissionService } from "../permissions/permissions.service.js";

function extractAuthUserId(request: FastifyRequest): string {
  const headerValue = request.headers["x-source-user-id"];
  const bearerToken = request.headers.authorization;

  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  if (typeof bearerToken === "string" && bearerToken.startsWith("Bearer dev-user-")) {
    return bearerToken.replace("Bearer dev-user-", "").trim();
  }

  return String(env.DEFAULT_SOURCE_USER_ID);
}

export function authenticateRequest(permissionService: PermissionService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith("/health")) {
      return;
    }

    const authUserId = extractAuthUserId(request);
    const sourceUserId = await permissionService.resolveSourceUserId(authUserId);

    if (!sourceUserId) {
      return reply.code(401).send({
        code: "AUTH_INVALID",
        message: "Unable to resolve analytics user from main website identity."
      });
    }

    const scope = await permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return reply.code(401).send({
        code: "AUTH_INVALID",
        message: "Unable to resolve analytics user from main website identity."
      });
    }

    request.authContext = {
      authUserId,
      sourceUserId
    };
    request.resolvedScope = scope;
  };
}
