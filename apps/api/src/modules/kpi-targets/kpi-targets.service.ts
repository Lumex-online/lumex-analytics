import type {
  DeleteKpiTargetInput,
  DashboardFiltersInput,
  KpiTargetDefinition,
  KpiTargetManagementResponse,
  KpiTargetMetricKey,
  ResolvedScope,
  UpdateKpiTargetInput
} from "@lumex/shared-types";
import type { PermissionService } from "../permissions/permissions.service.js";
import type { KpiTargetRepository } from "./kpi-targets.repository.js";

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function normalizeDateOnly(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed.slice(0, 10);
}

function isValidDateRange(fromValue: string, toValue: string) {
  const from = toUtcDate(normalizeDateOnly(fromValue));
  const to = toUtcDate(normalizeDateOnly(toValue));

  return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from.getTime() <= to.getTime();
}

function preferredScopes(scope: ResolvedScope) {
  return scope.user.analyticsRole === "sub_admin"
    ? ["own", "organization"] as const
    : ["organization", "own"] as const;
}

export class KpiTargetService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly repository: KpiTargetRepository
  ) {}

  async getManagementState(
    sourceUserId: number
  ): Promise<KpiTargetManagementResponse | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (!scope.allowManageOrganizationTargets && !scope.allowManageOwnTargets) {
      return { code: "ACCESS_DENIED", message: "Target setup is not enabled for this user." };
    }

    return {
      capabilities: {
        canManageOrganizationTargets: scope.allowManageOrganizationTargets,
        canManageOwnTargets: scope.allowManageOwnTargets
      },
      targets: await this.repository.listVisibleTargets(sourceUserId)
    };
  }

  async upsertTarget(
    sourceUserId: number,
    input: UpdateKpiTargetInput
  ): Promise<KpiTargetDefinition | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (input.scope === "organization" && !scope.allowManageOrganizationTargets) {
      return { code: "ACCESS_DENIED", message: "Organization target setup is not enabled for this user." };
    }

    if (input.scope === "own" && !scope.allowManageOwnTargets) {
      return { code: "ACCESS_DENIED", message: "Own target setup is not enabled for this user." };
    }

    if (!Number.isFinite(input.targetValue) || input.targetValue < 0) {
      return { code: "INVALID_TARGET", message: "A valid non-negative target value is required." };
    }

    if (!isValidDateRange(input.dateRange.from, input.dateRange.to)) {
      return { code: "INVALID_TARGET", message: "A valid target date range is required." };
    }

    return this.repository.upsertTarget(sourceUserId, input);
  }

  async deleteTarget(
    sourceUserId: number,
    input: DeleteKpiTargetInput
  ): Promise<{ ok: true } | { code: string; message: string }> {
    const scope = await this.permissionService.getResolvedScope(sourceUserId);

    if (!scope) {
      return { code: "AUTH_INVALID", message: "Invalid analytics identity." };
    }

    if (input.scope === "organization" && !scope.allowManageOrganizationTargets) {
      return { code: "ACCESS_DENIED", message: "Organization target setup is not enabled for this user." };
    }

    if (input.scope === "own" && !scope.allowManageOwnTargets) {
      return { code: "ACCESS_DENIED", message: "Own target setup is not enabled for this user." };
    }

    if (!isValidDateRange(input.dateRange.from, input.dateRange.to)) {
      return { code: "INVALID_TARGET", message: "A valid target date range is required." };
    }

    await this.repository.deleteTarget(sourceUserId, input);
    return { ok: true };
  }

  async getApplicableTarget(
    sourceUserId: number,
    scope: ResolvedScope,
    filters: DashboardFiltersInput,
    metricKey: KpiTargetMetricKey
  ): Promise<KpiTargetDefinition | null> {
    const fromValue = filters.dateRange?.from ? normalizeDateOnly(filters.dateRange.from) : "";
    const toValue = filters.dateRange?.to ? normalizeDateOnly(filters.dateRange.to) : "";
    if (!fromValue || !toValue) {
      return null;
    }

    const targets = await this.repository.listVisibleTargets(sourceUserId);
    for (const preferredScope of preferredScopes(scope)) {
      const match = targets.find((target) =>
        target.metricKey === metricKey &&
        target.scope === preferredScope &&
        target.dateRange.from === fromValue &&
        target.dateRange.to === toValue
      );

      if (match) {
        return match;
      }
    }

    return null;
  }
}
