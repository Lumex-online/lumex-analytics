import type { FastifyRequest } from "fastify";
import type { DashboardFiltersInput } from "@lumex/shared-types";
import type { MemoConversionService } from "./memo-conversion.service.js";

export class MemoConversionController {
  constructor(private readonly memoConversionService: MemoConversionService) {}

  async getSummary(
    request: FastifyRequest<{
      Body: DashboardFiltersInput;
    }>
  ) {
    return this.memoConversionService.getSummary(
      request.authContext.sourceUserId,
      request.body ?? {}
    );
  }
}
