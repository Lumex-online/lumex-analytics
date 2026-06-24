import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, type JWTPayload } from "jose";
import { timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import type { PermissionService } from "../permissions/permissions.service.js";

function getHeaderValue(request: FastifyRequest, headerName: string): string | null {
  const value = request.headers[headerName.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function secretsMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer);
}

function extractDevelopmentAuthUserId(request: FastifyRequest): string {
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

function extractTrustedProxyAuthUserId(request: FastifyRequest): string | null {
  const proxySecret = getHeaderValue(request, env.ANALYTICS_PROXY_SECRET_HEADER);
  if (!proxySecret || !env.ANALYTICS_PROXY_SECRET || !secretsMatch(proxySecret, env.ANALYTICS_PROXY_SECRET)) {
    return null;
  }

  return getHeaderValue(request, env.ANALYTICS_PROXY_USER_HEADER);
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isAllowedWebsiteRole(value: unknown): boolean {
  return value === "super_admin" || value === "sub_admin";
}

async function extractEmbedTokenAuthUserId(request: FastifyRequest): Promise<string | null> {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(env.ANALYTICS_EMBED_TOKEN_SECRET);
    const { payload } = await jwtVerify<JWTPayload & {
      websiteUserId?: unknown;
      websiteRole?: unknown;
    }>(token, secret, {
      algorithms: ["HS256"],
      audience: "lumex-analytics",
      issuer: "lumex-backend"
    });

    if (!isAllowedWebsiteRole(payload.websiteRole)) {
      return null;
    }

    return pickString(payload.websiteUserId) ?? pickString(payload.sub);
  } catch {
    return null;
  }
}

async function extractAuthUserId(request: FastifyRequest): Promise<string | null> {
  if (env.ANALYTICS_ENV === "local") {
    return extractDevelopmentAuthUserId(request);
  }

  const proxyUserId = extractTrustedProxyAuthUserId(request);
  if (proxyUserId) {
    return proxyUserId;
  }

  return extractEmbedTokenAuthUserId(request);
}

export function authenticateRequest(permissionService: PermissionService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith("/health")) {
      return;
    }

    const authUserId = await extractAuthUserId(request);
    if (!authUserId) {
      return reply.code(401).send({
        code: "AUTH_REQUIRED",
        message: "Analytics requests must be authenticated."
      });
    }

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
