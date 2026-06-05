import type { ResolvedScope } from "@lumex/shared-types";

declare module "fastify" {
  interface FastifyRequest {
    authContext: {
      authUserId: string;
      sourceUserId: number;
    };
    resolvedScope: ResolvedScope;
  }
}
