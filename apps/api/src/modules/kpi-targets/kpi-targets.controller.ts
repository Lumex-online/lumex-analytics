import type { FastifyReply, FastifyRequest } from "fastify";
import type { DeleteKpiTargetInput, UpdateKpiTargetInput } from "@lumex/shared-types";
import type { KpiTargetService } from "./kpi-targets.service.js";

export class KpiTargetController {
  constructor(private readonly service: KpiTargetService) {}

  async listTargets(request: FastifyRequest, reply: FastifyReply) {
    const response = await this.service.getManagementState(request.authContext.sourceUserId);

    if ("code" in response) {
      return reply.code(response.code === "ACCESS_DENIED" ? 403 : 401).send(response);
    }

    return response;
  }

  async upsertTarget(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as Partial<UpdateKpiTargetInput>;

    if (
      body.metricKey !== "totalSales" ||
      (body.scope !== "organization" && body.scope !== "own") ||
      typeof body.dateRange?.from !== "string" ||
      typeof body.dateRange?.to !== "string" ||
      typeof body.targetValue !== "number"
    ) {
      return reply.code(400).send({
        code: "INVALID_TARGET",
        message: "The submitted KPI target is invalid."
      });
    }

    const response = await this.service.upsertTarget(request.authContext.sourceUserId, {
      metricKey: body.metricKey,
      scope: body.scope,
      dateRange: body.dateRange,
      targetValue: body.targetValue
    });

    if ("code" in response) {
      const status = response.code === "ACCESS_DENIED" ? 403 : response.code === "AUTH_INVALID" ? 401 : 400;
      return reply.code(status).send(response);
    }

    return response;
  }

  async deleteTarget(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as Partial<DeleteKpiTargetInput>;

    if (
      body.metricKey !== "totalSales" ||
      (body.scope !== "organization" && body.scope !== "own") ||
      typeof body.dateRange?.from !== "string" ||
      typeof body.dateRange?.to !== "string"
    ) {
      return reply.code(400).send({
        code: "INVALID_TARGET",
        message: "The submitted KPI target is invalid."
      });
    }

    const response = await this.service.deleteTarget(request.authContext.sourceUserId, {
      metricKey: body.metricKey,
      scope: body.scope,
      dateRange: body.dateRange
    });

    if ("code" in response) {
      const status = response.code === "ACCESS_DENIED" ? 403 : response.code === "AUTH_INVALID" ? 401 : 400;
      return reply.code(status).send(response);
    }

    return response;
  }
}
