import type { FastifyReply, FastifyRequest } from "fastify";
import type { ExportsService } from "./exports.service.js";

export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  async downloadPurchaseWorkbook(request: FastifyRequest, reply: FastifyReply) {
    if (!request.resolvedScope.allowExport) {
      return reply.code(403).send({
        code: "EXPORT_FORBIDDEN",
        message: "Export is not permitted for this user."
      });
    }

    const buffer = await this.exportsService.buildPurchaseWorkbook();
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="purchase-online.xlsx"')
      .send(buffer);
  }

  async downloadSalesWorkbook(request: FastifyRequest, reply: FastifyReply) {
    if (!request.resolvedScope.allowExport) {
      return reply.code(403).send({
        code: "EXPORT_FORBIDDEN",
        message: "Export is not permitted for this user."
      });
    }

    const buffer = await this.exportsService.buildSalesWorkbook(request.resolvedScope);
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="sales-online.xlsx"')
      .send(buffer);
  }
}
