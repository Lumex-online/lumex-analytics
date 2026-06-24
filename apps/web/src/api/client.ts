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
import {
  getEmbedToken,
  isLocalAnalyticsEnv,
  requestEmbedTokenRefresh
} from "../lib/analyticsAuth";
import { resolveRequestedUserId } from "../lib/embed";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

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

function buildRequestHeaders(sourceUserId: string, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  if (isLocalAnalyticsEnv()) {
    headers.set("x-source-user-id", sourceUserId);
  } else {
    const token = getEmbedToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return headers;
}

async function secureRequest<T>(path: string, init?: RequestInit, hasRetried = false): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: buildRequestHeaders(activeSourceUserId, init?.headers)
  });

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  if (response.status === 401 && !hasRetried) {
    const refreshedToken = await requestEmbedTokenRefresh();
    if (refreshedToken) {
      return secureRequest<T>(path, init, true);
    }
  }

  throw new Error(`Request failed: ${response.status}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isLocalAnalyticsEnv()) {
    return secureRequest<T>(path, init);
  }

  const candidateSourceUserIds = urlSourceUserId
    ? [activeSourceUserId]
    : isLocalAnalyticsEnv()
    ? [activeSourceUserId, ...seededDevSourceIds.filter((sourceUserId) => sourceUserId !== activeSourceUserId)]
    : [activeSourceUserId];
  let lastStatus = 500;

  for (const sourceUserId of candidateSourceUserIds) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: buildRequestHeaders(sourceUserId, init?.headers)
    });

    if (response.ok) {
      activeSourceUserId = sourceUserId;
      return response.json() as Promise<T>;
    }

    lastStatus = response.status;
    if (response.status !== 401 || !isLocalAnalyticsEnv()) {
      throw new Error(`Request failed: ${response.status}`);
    }
  }

  throw new Error(`Request failed: ${lastStatus}`);
}

async function downloadFile(path: string, filename: string, hasRetried = false) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  if (isLocalAnalyticsEnv()) {
    headers.set("x-source-user-id", activeSourceUserId);
  } else {
    const token = getEmbedToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers
  });
  if (response.status === 401 && !isLocalAnalyticsEnv() && !hasRetried) {
    const refreshedToken = await requestEmbedTokenRefresh();
    if (refreshedToken) {
      return downloadFile(path, filename, true);
    }
  }
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const apiClient = {
  getMyPermissions() {
    return request<PermissionMetadataResponse>("/me/permissions");
  },
  downloadPurchaseWorkbook() {
    return downloadFile("/exports/purchase", "purchase-online.xlsx");
  },
  downloadSalesWorkbook() {
    return downloadFile("/exports/sales", "sales-online.xlsx");
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
