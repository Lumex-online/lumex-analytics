import type {
  AdminAccessPolicyResponse,
  DashboardChartResponse,
  DeleteKpiTargetInput,
  DashboardFiltersInput,
  DashboardFiltersMetadata,
  DashboardKey,
  DashboardSummaryResponse,
  DrilldownResponse,
  ExecutiveDashboardResponse,
  KpiTargetManagementResponse,
  MemoConversionSummaryResponse,
  PermissionMetadataResponse,
  SkuAnalyticsSummaryResponse,
  UpdateKpiTargetInput,
  UpdateSubAdminAccessInput
} from "@lumex/shared-types";
import { resolveRequestedUserId } from "../lib/embed";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

function parseSourceUserId(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function sourceUserIdFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseSourceUserId(resolveRequestedUserId(window.location.search) ?? undefined);
}

const seededDevSourceIds = ["1", "2", "3"];
const urlSourceUserId = sourceUserIdFromUrl();
let activeSourceUserId: string =
  urlSourceUserId ??
  parseSourceUserId(import.meta.env.VITE_SOURCE_USER_ID) ??
  "1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const candidateSourceUserIds = urlSourceUserId
    ? [activeSourceUserId]
    : import.meta.env.DEV
    ? [activeSourceUserId, ...seededDevSourceIds.filter((sourceUserId) => sourceUserId !== activeSourceUserId)]
    : [activeSourceUserId];
  let lastStatus = 500;

  for (const sourceUserId of candidateSourceUserIds) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-source-user-id": sourceUserId,
        ...init?.headers
      }
    });

    if (response.ok) {
      activeSourceUserId = sourceUserId;
      return response.json() as Promise<T>;
    }

    lastStatus = response.status;
    if (response.status !== 401 || !import.meta.env.DEV) {
      throw new Error(`Request failed: ${response.status}`);
    }
  }

  throw new Error(`Request failed: ${lastStatus}`);
}

export const apiClient = {
  getMyPermissions() {
    return request<PermissionMetadataResponse>("/me/permissions");
  },
  getFilters(dashboardKey: DashboardKey) {
    return request<DashboardFiltersMetadata>(`/metadata/filters?dashboardKey=${dashboardKey}`);
  },
  getSummary(dashboardKey: DashboardKey, filters: DashboardFiltersInput) {
    return request<DashboardSummaryResponse>(`/dashboards/${dashboardKey}/summary`, {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },
  getChart(dashboardKey: DashboardKey, chartKey: string, filters: DashboardFiltersInput) {
    return request<DashboardChartResponse>(`/dashboards/${dashboardKey}/charts/${chartKey}`, {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },
  getSkuAnalyticsSummary(filters: DashboardFiltersInput) {
    return request<SkuAnalyticsSummaryResponse>("/analytics/sku/summary", {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },
  getMemoConversionSummary(filters: DashboardFiltersInput) {
    return request<MemoConversionSummaryResponse>("/analytics/memo-conversion/summary", {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },
  getExecutiveDashboard(filters: DashboardFiltersInput) {
    return request<ExecutiveDashboardResponse>("/analytics/executive/summary", {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },
  getTransactions(filters: DashboardFiltersInput) {
    return request<DrilldownResponse>("/drilldowns/transactions", {
      method: "POST",
      body: JSON.stringify(filters)
    });
  },
  getAdminPolicies() {
    return request<AdminAccessPolicyResponse>("/admin/access-policies");
  },
  updateSubAdminPolicy(sourceUserId: number, input: UpdateSubAdminAccessInput) {
    return request(`/admin/access-policies/${sourceUserId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  getKpiTargets() {
    return request<KpiTargetManagementResponse>("/admin/kpi-targets");
  },
  upsertKpiTarget(input: UpdateKpiTargetInput) {
    return request("/admin/kpi-targets", {
      method: "PUT",
      body: JSON.stringify(input)
    });
  },
  deleteKpiTarget(input: DeleteKpiTargetInput) {
    return request("/admin/kpi-targets", {
      method: "DELETE",
      body: JSON.stringify(input)
    });
  }
};
