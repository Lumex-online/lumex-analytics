import type { FastifyReply, FastifyRequest } from "fastify";
import type { DashboardFiltersInput } from "@lumex/shared-types";
import type { ExportsService } from "./exports.service.js";

type ExportQuery = Record<string, unknown>;

interface ParsedExportFilters {
  filters: DashboardFiltersInput;
}

interface ExportQueryError {
  code: "BAD_REQUEST";
  message: string;
}

function firstQueryValue(query: ExportQuery, key: string): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseDateParam(query: ExportQuery, key: string): string | ExportQueryError | undefined {
  const value = firstQueryValue(query, key)?.trim();
  if (!value) {
    return undefined;
  }

  if (!isDateOnly(value)) {
    return { code: "BAD_REQUEST", message: `${key} must use YYYY-MM-DD format.` };
  }

  return value;
}

function parseNumberList(query: ExportQuery, key: string): number[] | ExportQueryError | undefined {
  const value = firstQueryValue(query, key)?.trim();
  if (!value) {
    return undefined;
  }

  const values = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const parsed = values.map((entry) => Number(entry));
  if (parsed.some((entry) => !Number.isInteger(entry) || entry <= 0)) {
    return { code: "BAD_REQUEST", message: `${key} must be a comma-separated list of positive numbers.` };
  }

  return [...new Set(parsed)];
}

function parseStringParam(query: ExportQuery, key: string): string | undefined {
  const value = firstQueryValue(query, key)?.trim();
  return value || undefined;
}

function parseViewMode(query: ExportQuery): DashboardFiltersInput["viewMode"] | ExportQueryError | undefined {
  const value = firstQueryValue(query, "viewMode")?.trim();
  if (!value) {
    return undefined;
  }

  if (value !== "scoped" && value !== "global_totals") {
    return { code: "BAD_REQUEST", message: "viewMode must be scoped or global_totals." };
  }

  return value;
}

function isQueryError(value: unknown): value is ExportQueryError {
  return Boolean(value && typeof value === "object" && "code" in value);
}

function parseExportFilters(query: unknown): ParsedExportFilters | ExportQueryError {
  const source = (query ?? {}) as ExportQuery;
  const dateFrom = parseDateParam(source, "dateFrom");
  const dateTo = parseDateParam(source, "dateTo");
  if (isQueryError(dateFrom)) return dateFrom;
  if (isQueryError(dateTo)) return dateTo;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { code: "BAD_REQUEST", message: "dateFrom must be before or equal to dateTo." };
  }

  const warehouseKeys = parseNumberList(source, "warehouseKeys");
  const buyerKeys = parseNumberList(source, "buyerKeys");
  const subAdminKeys = parseNumberList(source, "subAdminKeys");
  const vendorKeys = parseNumberList(source, "vendorKeys");
  const skuKeys = parseNumberList(source, "skuKeys");
  const viewMode = parseViewMode(source);
  if (isQueryError(warehouseKeys)) return warehouseKeys;
  if (isQueryError(buyerKeys)) return buyerKeys;
  if (isQueryError(subAdminKeys)) return subAdminKeys;
  if (isQueryError(vendorKeys)) return vendorKeys;
  if (isQueryError(skuKeys)) return skuKeys;
  if (isQueryError(viewMode)) return viewMode;

  return {
    filters: {
      dateRange: dateFrom || dateTo ? { from: dateFrom ?? "", to: dateTo ?? "" } : undefined,
      warehouseKeys,
      buyerKeys,
      subAdminKeys,
      vendorKeys,
      skuKeys,
      shape: parseStringParam(source, "shape"),
      size: parseStringParam(source, "size"),
      color: parseStringParam(source, "color"),
      clarity: parseStringParam(source, "clarity"),
      productType: parseStringParam(source, "productType"),
      status: parseStringParam(source, "status"),
      viewMode
    }
  };
}

function workbookFilename(prefix: string, filters: DashboardFiltersInput) {
  const from = filters.dateRange?.from?.trim();
  const to = filters.dateRange?.to?.trim();
  return from && to ? `${prefix}-${from}-to-${to}.xlsx` : `${prefix}.xlsx`;
}

export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  async downloadPurchaseWorkbook(request: FastifyRequest, reply: FastifyReply) {
    const parsed = parseExportFilters(request.query);
    if (isQueryError(parsed)) {
      return reply.code(400).send(parsed);
    }

    if (!request.resolvedScope.allowExport) {
      return reply.code(403).send({
        code: "EXPORT_FORBIDDEN",
        message: "Export is not permitted for this user."
      });
    }

    if (!request.resolvedScope.allowPurchaseVisibility) {
      return reply.code(403).send({
        code: "EXPORT_FORBIDDEN",
        message: "Purchase export is not permitted for this user."
      });
    }

    const buffer = await this.exportsService.buildPurchaseWorkbook(request.resolvedScope, parsed.filters);
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${workbookFilename("purchase-online", parsed.filters)}"`)
      .send(buffer);
  }

  async downloadSalesWorkbook(request: FastifyRequest, reply: FastifyReply) {
    const parsed = parseExportFilters(request.query);
    if (isQueryError(parsed)) {
      return reply.code(400).send(parsed);
    }

    if (!request.resolvedScope.allowExport) {
      return reply.code(403).send({
        code: "EXPORT_FORBIDDEN",
        message: "Export is not permitted for this user."
      });
    }

    const buffer = await this.exportsService.buildSalesWorkbook(request.resolvedScope, parsed.filters);
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${workbookFilename("sales-online", parsed.filters)}"`)
      .send(buffer);
  }
}
