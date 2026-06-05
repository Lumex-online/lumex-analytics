import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  AdminBuyerScopeMode,
  AdminWarehouseScopeMode,
  AdminAccessPolicyResponse,
  AnalyticsAccessPolicy,
  DeleteKpiTargetInput,
  DateRange,
  KpiTargetDefinition,
  UpdateKpiTargetInput,
  UserIdentity
} from "@lumex/shared-types";
import { apiClient } from "../api/client";
import { PageSection } from "../components/PageSection";
import { StatePanel } from "../components/StatePanel";

function formatScope(
  value: number[] | "ALL",
  labelsByKey: Map<number, string>
) {
  if (value === "ALL") {
    return "ALL";
  }

  if (value.length === 0) {
    return "None";
  }

  return value.map((key) => labelsByKey.get(key) ?? String(key)).join(", ");
}

function getUser(data: AdminAccessPolicyResponse, sourceUserId: number): UserIdentity | null {
  return data.users.find((candidate) => candidate.sourceUserId === sourceUserId) ?? null;
}

function buildAccessTestPath(sourceUserId: number, embedded: boolean) {
  const basePath = embedded ? "/embed/dashboard" : "/dashboard";
  return `${basePath}?sourceUserId=${sourceUserId}`;
}

function formatCurrencyInput(value: number) {
  return value === 0 ? "" : String(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function normalizeDateOnly(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return "";
  }

  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed.slice(0, 10);
}

function parseSafeDate(value: string | undefined) {
  const normalized = normalizeDateOnly(value);

  if (normalized.length === 0) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatTargetRange(dateRange: DateRange) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const from = parseSafeDate(dateRange?.from);
  const to = parseSafeDate(dateRange?.to);

  if (!from || !to) {
    const fromLabel = dateRange?.from?.trim() || "Unknown";
    const toLabel = dateRange?.to?.trim() || "Unknown";
    return `${fromLabel} to ${toLabel}`;
  }

  return `${formatter.format(from)} to ${formatter.format(to)}`;
}

function targetsForScope(targets: KpiTargetDefinition[], scope: "organization" | "own") {
  return targets
    .filter(
      (target) =>
        target.metricKey === "totalSales" &&
        target.scope === scope &&
        normalizeDateOnly(target.dateRange?.from).length > 0 &&
        normalizeDateOnly(target.dateRange?.to).length > 0
    )
    .sort((left, right) =>
      normalizeDateOnly(left.dateRange.from).localeCompare(normalizeDateOnly(right.dateRange.from)) ||
      normalizeDateOnly(left.dateRange.to).localeCompare(normalizeDateOnly(right.dateRange.to))
    );
}

function normalizeTargetRange(dateRange: DateRange) {
  return `${normalizeDateOnly(dateRange.from)}:${normalizeDateOnly(dateRange.to)}`;
}

function buildTargetRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface EditableTargetRow {
  id: string;
  dateRange: DateRange;
  targetValue: string;
}

function TargetScopeEditor({
  title,
  description,
  scope,
  targets,
  canEdit,
  isSaving,
  onSave
}: {
  title: string;
  description: string;
  scope: "organization" | "own";
  targets: KpiTargetDefinition[];
  canEdit: boolean;
  isSaving: boolean;
  onSave: (
    scope: "organization" | "own",
    payload: { upserts: UpdateKpiTargetInput[]; deletes: DeleteKpiTargetInput[] }
  ) => void;
}) {
  const scopedTargets = useMemo(() => targetsForScope(targets, scope), [scope, targets]);
  const [rows, setRows] = useState<EditableTargetRow[]>([]);

  useEffect(() => {
    setRows(
      scopedTargets.map((target) => ({
        id: buildTargetRowId(),
        dateRange: {
          from: normalizeDateOnly(target.dateRange.from),
          to: normalizeDateOnly(target.dateRange.to)
        },
        targetValue: formatCurrencyInput(target.targetValue)
      }))
    );
  }, [scopedTargets]);

  const duplicateRangeKeys = new Set<string>();
  const seenRangeKeys = new Set<string>();
  const parsedRows = rows.map((row) => {
    const parsedTargetValue = row.targetValue.trim().length === 0 ? Number.NaN : Number(row.targetValue);
    const normalizedRangeKey = normalizeTargetRange(row.dateRange);
    const hasDuplicateRange = seenRangeKeys.has(normalizedRangeKey);

    if (row.dateRange.from && row.dateRange.to) {
      seenRangeKeys.add(normalizedRangeKey);
      if (hasDuplicateRange) {
        duplicateRangeKeys.add(normalizedRangeKey);
      }
    }

    return {
      ...row,
      parsedTargetValue,
      normalizedRangeKey,
      isValid:
        row.dateRange.from.length > 0 &&
        row.dateRange.to.length > 0 &&
        row.dateRange.from <= row.dateRange.to &&
        Number.isFinite(parsedTargetValue) &&
        parsedTargetValue >= 0 &&
        !hasDuplicateRange
    };
  });
  const hasInvalidValue = parsedRows.some((row) => !row.isValid);
  const originalSnapshot = JSON.stringify(
    scopedTargets.map((target) => ({
      from: normalizeDateOnly(target.dateRange.from),
      to: normalizeDateOnly(target.dateRange.to),
      targetValue: Number(target.targetValue.toFixed(2))
    }))
  );
  const currentSnapshot = JSON.stringify(
    parsedRows
      .map((row) => ({
        from: row.dateRange.from,
        to: row.dateRange.to,
        targetValue: Number((Number.isFinite(row.parsedTargetValue) ? row.parsedTargetValue : 0).toFixed(2))
      }))
      .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to))
  );
  const isDirty = originalSnapshot !== currentSnapshot;
  const targetByRange = new Map(scopedTargets.map((target) => [normalizeTargetRange(target.dateRange), target]));

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: buildTargetRowId(),
        dateRange: { from: "", to: "" },
        targetValue: ""
      }
    ]);
  }

  function removeRow(rowId: string) {
    setRows((current) => current.filter((row) => row.id !== rowId));
  }

  return (
    <article className="target-editor">
      <div className="target-editor__header">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <span className={`access-badge ${canEdit ? "access-badge--active" : "access-badge--inactive"}`}>
          {canEdit ? "Editable" : "View only"}
        </span>
      </div>

      {rows.length === 0 ? <div className="access-feedback">No targets saved yet for this scope.</div> : null}

      <div className="target-editor__rows">
        {parsedRows.map((row) => {
          const rangeLabel = normalizeTargetRange(row.dateRange);
          const existingTarget = targetByRange.get(rangeLabel);

          return (
            <div key={row.id} className="target-range-row">
              <label className="filter-control">
                <span>From</span>
                <input
                  type="date"
                  value={row.dateRange.from}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((candidate) =>
                        candidate.id === row.id
                          ? {
                              ...candidate,
                              dateRange: {
                                ...candidate.dateRange,
                                from: event.target.value
                              }
                            }
                          : candidate
                      )
                    )
                  }
                />
              </label>

              <label className="filter-control">
                <span>To</span>
                <input
                  type="date"
                  value={row.dateRange.to}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((candidate) =>
                        candidate.id === row.id
                          ? {
                              ...candidate,
                              dateRange: {
                                ...candidate.dateRange,
                                to: event.target.value
                              }
                            }
                          : candidate
                      )
                    )
                  }
                />
              </label>

              <label className="filter-control">
                <span>Target Value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.targetValue}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((candidate) =>
                        candidate.id === row.id
                          ? {
                              ...candidate,
                              targetValue: event.target.value
                            }
                          : candidate
                      )
                    )
                  }
                />
              </label>

              <div className="target-range-row__actions">
                {existingTarget ? (
                  <span className="target-range-row__meta">
                    Saved
                  </span>
                ) : (
                  <span className="target-range-row__meta">New</span>
                )}
                {canEdit ? (
                  <button type="button" className="access-button access-button--secondary" onClick={() => removeRow(row.id)}>
                    Remove
                  </button>
                ) : null}
              </div>

              {!row.isValid ? (
                <div className="target-range-row__error">
                  {duplicateRangeKeys.has(row.normalizedRangeKey)
                    ? "Each target range must be unique."
                    : "Set valid from/to dates and a non-negative target value."}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="target-editor__summary">
        {scopedTargets.length > 0 ? scopedTargets.map((target) => (
          <span key={`${target.scope}-${target.dateRange.from}-${target.dateRange.to}`}>
            {formatTargetRange(target.dateRange)}:
            {" "}
            {formatCurrency(target.targetValue)}
          </span>
        )) : <span>No targets saved yet.</span>}
      </div>

      {canEdit ? (
        <div className="access-editor__actions">
          <button type="button" className="access-button access-button--secondary" onClick={addRow}>
            Add target
          </button>
          <button
            type="button"
            className="access-button"
            disabled={isSaving || hasInvalidValue || !isDirty}
            onClick={() => {
              const currentValidRows = parsedRows.map((row) => ({
                metricKey: "totalSales" as const,
                scope,
                dateRange: row.dateRange,
                targetValue: Number(row.parsedTargetValue.toFixed(2))
              }));
              const currentRangeKeys = new Set(currentValidRows.map((row) => normalizeTargetRange(row.dateRange)));
              const deletes: DeleteKpiTargetInput[] = scopedTargets
                .filter((target) => !currentRangeKeys.has(normalizeTargetRange(target.dateRange)))
                .map((target) => ({
                  metricKey: "totalSales",
                  scope,
                  dateRange: target.dateRange
                }));
              const upserts = currentValidRows.filter((row) => {
                const existingTarget = targetByRange.get(normalizeTargetRange(row.dateRange));

                return !existingTarget || Number(existingTarget.targetValue.toFixed(2)) !== row.targetValue;
              });

              onSave(scope, { upserts, deletes });
            }}
          >
            {isSaving ? "Saving..." : "Save targets"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SubAdminAccessEditor({
  data,
  policy,
  isSaving,
  onSave
}: {
  data: AdminAccessPolicyResponse;
  policy: AnalyticsAccessPolicy;
  isSaving: boolean;
  onSave: (sourceUserId: number, input: {
    isActive: boolean;
    warehouseScopeMode: AdminWarehouseScopeMode;
    warehouseKeys: number[];
    buyerScopeMode: AdminBuyerScopeMode;
    allowManageOrganizationTargets: boolean;
    allowManageOwnTargets: boolean;
  }) => void;
}) {
  const [isActive, setIsActive] = useState(policy.isActive);
  const [warehouseScopeMode, setWarehouseScopeMode] = useState<AdminWarehouseScopeMode>(
    policy.warehouseKeys === "ALL" ? "all" : "custom"
  );
  const [warehouseKeys, setWarehouseKeys] = useState<number[]>(
    Array.isArray(policy.warehouseKeys) ? policy.warehouseKeys : []
  );
  const [buyerScopeMode, setBuyerScopeMode] = useState<AdminBuyerScopeMode>(
    policy.buyerKeys === "ALL" ? "all" : "associated"
  );
  const [allowManageOrganizationTargets, setAllowManageOrganizationTargets] = useState(
    policy.allowManageOrganizationTargets
  );
  const [allowManageOwnTargets, setAllowManageOwnTargets] = useState(policy.allowManageOwnTargets);

  useEffect(() => {
    setIsActive(policy.isActive);
    setWarehouseScopeMode(policy.warehouseKeys === "ALL" ? "all" : "custom");
    setWarehouseKeys(Array.isArray(policy.warehouseKeys) ? policy.warehouseKeys : []);
    setBuyerScopeMode(policy.buyerKeys === "ALL" ? "all" : "associated");
    setAllowManageOrganizationTargets(policy.allowManageOrganizationTargets);
    setAllowManageOwnTargets(policy.allowManageOwnTargets);
  }, [policy]);

  const associatedSubAdmins = policy.subAdminKeys === "ALL"
    ? "ALL"
    : formatScope(policy.subAdminKeys, new Map(data.subAdmins.map((subAdmin) => [subAdmin.key, subAdmin.name])));
  const buyerScopeSummary = buyerScopeMode === "all"
    ? "All buyers"
    : Array.isArray(policy.buyerKeys)
      ? formatScope(policy.buyerKeys, new Map(data.buyers.map((buyer) => [buyer.key, buyer.name])))
      : "Associated buyers only";
  const isDirty =
    isActive !== policy.isActive ||
    buyerScopeMode !== (policy.buyerKeys === "ALL" ? "all" : "associated") ||
    warehouseScopeMode !== (policy.warehouseKeys === "ALL" ? "all" : "custom") ||
    allowManageOrganizationTargets !== policy.allowManageOrganizationTargets ||
    allowManageOwnTargets !== policy.allowManageOwnTargets ||
    JSON.stringify([...warehouseKeys].sort((left, right) => left - right)) !==
      JSON.stringify(
        (Array.isArray(policy.warehouseKeys) ? [...policy.warehouseKeys] : []).sort((left, right) => left - right)
      );

  return (
    <article className="access-editor">
      <div className="access-editor__header">
        <div>
          <strong>{getUser(data, policy.sourceUserId)?.fullName ?? String(policy.sourceUserId)}</strong>
          <p>
            {getUser(data, policy.sourceUserId)?.email ?? "No email available"}
            {associatedSubAdmins === "ALL" ? " • Mapped to all sub-admin groups." : ` • Sub-admin group: ${associatedSubAdmins}`}
          </p>
        </div>
        <span className={`access-badge ${isActive ? "access-badge--active" : "access-badge--inactive"}`}>
          {isActive ? "Active" : "Revoked"}
        </span>
      </div>

      <div className="access-editor__grid access-editor__grid--expanded">
        <label className="filter-control">
          <span>Access Status</span>
          <select value={isActive ? "active" : "revoked"} onChange={(event) => setIsActive(event.target.value === "active")}>
            <option value="active">Grant access</option>
            <option value="revoked">Revoke access</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Warehouse Access</span>
          <select
            value={warehouseScopeMode}
            onChange={(event) => setWarehouseScopeMode(event.target.value as AdminWarehouseScopeMode)}
          >
            <option value="all">All warehouses</option>
            <option value="custom">Selected warehouses</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Buyer Access</span>
          <select value={buyerScopeMode} onChange={(event) => setBuyerScopeMode(event.target.value as AdminBuyerScopeMode)}>
            <option value="associated">Associated buyers only</option>
            <option value="all">All buyers</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Org Target Setup</span>
          <select
            value={allowManageOrganizationTargets ? "enabled" : "disabled"}
            onChange={(event) => setAllowManageOrganizationTargets(event.target.value === "enabled")}
          >
            <option value="disabled">Disabled</option>
            <option value="enabled">Enabled</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Own Target Setup</span>
          <select
            value={allowManageOwnTargets ? "enabled" : "disabled"}
            onChange={(event) => setAllowManageOwnTargets(event.target.value === "enabled")}
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>

      {warehouseScopeMode === "custom" ? (
        <div className="access-editor__warehouse-list">
          {data.warehouses.map((warehouse) => {
            const isChecked = warehouseKeys.includes(warehouse.key);

            return (
              <label key={warehouse.key} className="access-check">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setWarehouseKeys((current) => [...current, warehouse.key].sort((left, right) => left - right));
                      return;
                    }

                    setWarehouseKeys((current) => current.filter((key) => key !== warehouse.key));
                  }}
                />
                <span>{warehouse.name}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="access-editor__summary">
        <span>Current warehouse scope: {formatScope(policy.warehouseKeys, new Map(data.warehouses.map((warehouse) => [warehouse.key, warehouse.name])))}</span>
        <span>Buyer scope after save: {buyerScopeSummary}</span>
        <span>Org targets: {allowManageOrganizationTargets ? "Enabled" : "Disabled"}</span>
        <span>Own targets: {allowManageOwnTargets ? "Enabled" : "Disabled"}</span>
      </div>

      <div className="access-editor__actions">
        <button
          type="button"
          className="access-button"
          disabled={isSaving || !isDirty || (warehouseScopeMode === "custom" && warehouseKeys.length === 0)}
          onClick={() =>
            onSave(policy.sourceUserId, {
              isActive,
              warehouseScopeMode,
              warehouseKeys,
              buyerScopeMode,
              allowManageOrganizationTargets,
              allowManageOwnTargets
            })
          }
        >
          {isSaving ? "Saving..." : "Save access"}
        </button>
      </div>
    </article>
  );
}

export function AdminAccessPage({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiClient.getMyPermissions()
  });
  const canManagePolicies =
    permissionsQuery.data?.user.analyticsRole === "founder" ||
    permissionsQuery.data?.user.analyticsRole === "admin";
  const canManageOrganizationTargets = permissionsQuery.data?.allowManageOrganizationTargets ?? false;
  const canManageOwnTargets = permissionsQuery.data?.allowManageOwnTargets ?? false;
  const policiesQuery = useQuery({
    queryKey: ["admin-access-policies"],
    queryFn: () => apiClient.getAdminPolicies(),
    enabled: canManagePolicies
  });
  const targetsQuery = useQuery({
    queryKey: ["kpi-targets"],
    queryFn: () => apiClient.getKpiTargets(),
    enabled: canManageOrganizationTargets || canManageOwnTargets
  });
  const updatePolicyMutation = useMutation({
    mutationFn: ({ sourceUserId, input }: {
      sourceUserId: number;
      input: {
        isActive: boolean;
        warehouseScopeMode: AdminWarehouseScopeMode;
        warehouseKeys: number[];
        buyerScopeMode: AdminBuyerScopeMode;
        allowManageOrganizationTargets: boolean;
        allowManageOwnTargets: boolean;
      };
    }) => apiClient.updateSubAdminPolicy(sourceUserId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-access-policies"] });
      await queryClient.invalidateQueries({ queryKey: ["permissions"] });
    }
  });
  const saveTargetsMutation = useMutation({
    mutationFn: async ({ payload }: {
      scope: "organization" | "own";
      payload: { upserts: UpdateKpiTargetInput[]; deletes: DeleteKpiTargetInput[] };
    }) => {
      await Promise.all([
        ...payload.deletes.map((input) => apiClient.deleteKpiTarget(input)),
        ...payload.upserts.map((input) => apiClient.upsertKpiTarget(input))
      ]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
      await queryClient.invalidateQueries({ queryKey: ["executive-dashboard"] });
    }
  });
  const [selectedSubAdminSourceUserId, setSelectedSubAdminSourceUserId] = useState<number | null>(null);
  const [selectedTargetScope, setSelectedTargetScope] = useState<"organization" | "own">("organization");

  useEffect(() => {
    const subAdminPolicies = policiesQuery.data?.policies.filter((policy) => policy.analyticsRole === "sub_admin") ?? [];
    const firstSubAdminPolicy = subAdminPolicies[0];

    if (subAdminPolicies.length === 0) {
      setSelectedSubAdminSourceUserId(null);
      return;
    }

    if (
      selectedSubAdminSourceUserId === null ||
      !subAdminPolicies.some((policy) => policy.sourceUserId === selectedSubAdminSourceUserId)
    ) {
      setSelectedSubAdminSourceUserId(firstSubAdminPolicy?.sourceUserId ?? null);
    }
  }, [policiesQuery.data, selectedSubAdminSourceUserId]);

  useEffect(() => {
    if (canManageOrganizationTargets) {
      setSelectedTargetScope((current) => (current === "organization" || !canManageOwnTargets ? "organization" : current));
      return;
    }

    if (canManageOwnTargets) {
      setSelectedTargetScope("own");
    }
  }, [canManageOrganizationTargets, canManageOwnTargets]);

  if (permissionsQuery.isLoading) {
    return <StatePanel title="Loading admin tools" detail="Resolving access to policy and target management." />;
  }

  if (permissionsQuery.isError || !permissionsQuery.data) {
    return <StatePanel title="Admin tools unavailable" detail="The analytics backend could not resolve your access." tone="error" />;
  }

  if (!canManagePolicies && !canManageOrganizationTargets && !canManageOwnTargets) {
    return <StatePanel title="No admin access" detail="This account does not have analytics policy or target setup permissions." tone="error" />;
  }

  if ((canManagePolicies && policiesQuery.isLoading) || ((canManageOrganizationTargets || canManageOwnTargets) && targetsQuery.isLoading)) {
    return <StatePanel title="Loading admin tools" detail="Fetching access policies and KPI targets." />;
  }

  if ((canManagePolicies && (policiesQuery.isError || !policiesQuery.data)) || ((canManageOrganizationTargets || canManageOwnTargets) && (targetsQuery.isError || !targetsQuery.data))) {
    return <StatePanel title="Admin tools unavailable" detail="Admin configuration data could not be loaded." tone="error" />;
  }

  const policiesData = policiesQuery.data ?? null;
  const targetsData = targetsQuery.data ?? null;
  const warehouseLabelsByKey = new Map(policiesData?.warehouses.map((warehouse) => [warehouse.key, warehouse.name]) ?? []);
  const buyerLabelsByKey = new Map(policiesData?.buyers.map((buyer) => [buyer.key, buyer.name]) ?? []);
  const subAdminLabelsByKey = new Map(policiesData?.subAdmins.map((subAdmin) => [subAdmin.key, subAdmin.name]) ?? []);
  const visiblePolicies = policiesData?.policies.filter((policy) => policy.analyticsRole !== "founder") ?? [];
  const subAdminPolicies = policiesData?.policies.filter((policy) => policy.analyticsRole === "sub_admin") ?? [];
  const selectedSubAdminPolicy = subAdminPolicies.find(
    (policy) => policy.sourceUserId === selectedSubAdminSourceUserId
  ) ?? subAdminPolicies[0] ?? null;

  return (
    <div className={`page admin-access-page${embedded ? " admin-access-page--embedded" : ""}`}>
      <header className="page__hero">
        <div>
          <span className="eyebrow">admin</span>
          <h1>Analytics Access Control</h1>
          <p>
            {canManagePolicies
              ? "Manage sub-admin dashboard access and recurring total sales KPI targets."
              : "Manage recurring total sales KPI targets for the dashboards you are allowed to control."}
          </p>
        </div>
      </header>

      {canManagePolicies && policiesData ? (
        <>
          <PageSection
            title="Access Policies"
            description="Sub-admin access is editable now. Founder and admin policies remain fixed full-access profiles."
          >
            <div className="table-card">
              <div className="table-card__head table-card__grid table-card__grid--policy">
                <span>User</span>
                <span>Role</span>
                <span>Access</span>
                <span>Warehouses</span>
                <span>Buyers</span>
                <span>Sub Admins</span>
                <span>Global Totals</span>
              </div>
              {visiblePolicies.map((policy) => (
                <div
                  key={policy.sourceUserId}
                  className="table-card__row table-card__grid table-card__grid--policy"
                >
                  <span className="table-user-cell">
                    <strong>{getUser(policiesData, policy.sourceUserId)?.fullName ?? String(policy.sourceUserId)}</strong>
                    <small>{getUser(policiesData, policy.sourceUserId)?.email ?? policy.analyticsRole}</small>
                  </span>
                  <span>{policy.analyticsRole}</span>
                  <span>{policy.isActive ? policy.accessMode : "revoked"}</span>
                  <span>{formatScope(policy.warehouseKeys, warehouseLabelsByKey)}</span>
                  <span>{formatScope(policy.buyerKeys, buyerLabelsByKey)}</span>
                  <span>{formatScope(policy.subAdminKeys, subAdminLabelsByKey)}</span>
                  <span>{policy.allowGlobalTotals ? "Yes" : "No"}</span>
                </div>
              ))}
            </div>
          </PageSection>

          <PageSection
            title="Manage Sub-admin Access"
            description="Select a sub-admin account, then update dashboard access, warehouse and buyer scope, and target setup permissions."
          >
            {updatePolicyMutation.isError ? (
              <div className="access-feedback access-feedback--error">
                {updatePolicyMutation.error instanceof Error
                  ? updatePolicyMutation.error.message
                  : "The access policy could not be updated."}
              </div>
            ) : null}

            {subAdminPolicies.length === 0 ? (
              <div className="access-feedback">No sub-admin accounts are available for access management.</div>
            ) : (
              <div className="access-editor-list">
                <label className="filter-control">
                  <span>Sub-admin Account</span>
                  <select
                    value={selectedSubAdminPolicy?.sourceUserId ?? ""}
                    onChange={(event) => setSelectedSubAdminSourceUserId(Number(event.target.value))}
                  >
                    {subAdminPolicies.map((policy) => (
                      <option key={policy.sourceUserId} value={policy.sourceUserId}>
                        {getUser(policiesData, policy.sourceUserId)?.fullName ?? String(policy.sourceUserId)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSubAdminPolicy ? (
                  <div className="access-test-link">
                    <span>
                      Test link for {getUser(policiesData, selectedSubAdminPolicy.sourceUserId)?.fullName ?? "selected sub-admin"}:
                    </span>
                    <a
                      href={buildAccessTestPath(selectedSubAdminPolicy.sourceUserId, embedded)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open dashboard as this sub-admin
                    </a>
                  </div>
                ) : null}
                {selectedSubAdminPolicy ? (
                  <SubAdminAccessEditor
                    key={selectedSubAdminPolicy.sourceUserId}
                    data={policiesData}
                    policy={selectedSubAdminPolicy}
                    isSaving={
                      updatePolicyMutation.isPending &&
                      updatePolicyMutation.variables?.sourceUserId === selectedSubAdminPolicy.sourceUserId
                    }
                    onSave={(sourceUserId, input) => {
                      updatePolicyMutation.mutate({ sourceUserId, input });
                    }}
                  />
                ) : null}
              </div>
            )}
          </PageSection>
        </>
      ) : null}

      {(canManageOrganizationTargets || canManageOwnTargets) && targetsData ? (
        <PageSection
          title="Total Sales Targets"
          description="Set total sales targets for exact dashboard date ranges. A target is applied when the selected dashboard from and to dates match the saved range."
        >
          {saveTargetsMutation.isError ? (
            <div className="access-feedback access-feedback--error">
              {saveTargetsMutation.error instanceof Error
                ? saveTargetsMutation.error.message
                : "The KPI targets could not be updated."}
            </div>
          ) : null}

          <div className="target-editor-list">
            {canManageOrganizationTargets && canManageOwnTargets ? (
              <div className="target-scope-switcher" role="tablist" aria-label="Target scope">
                <button
                  type="button"
                  className={`target-scope-switcher__button${selectedTargetScope === "organization" ? " is-active" : ""}`}
                  onClick={() => setSelectedTargetScope("organization")}
                >
                  Company Targets
                </button>
                <button
                  type="button"
                  className={`target-scope-switcher__button${selectedTargetScope === "own" ? " is-active" : ""}`}
                  onClick={() => setSelectedTargetScope("own")}
                >
                  My Targets
                </button>
              </div>
            ) : null}
            {selectedTargetScope === "organization" && canManageOrganizationTargets ? (
              <TargetScopeEditor
                title="Company Targets"
                description="Targets used for the whole organization Total Sales KPI."
                scope="organization"
                targets={targetsData.targets}
                canEdit={targetsData.capabilities.canManageOrganizationTargets}
                isSaving={saveTargetsMutation.isPending && saveTargetsMutation.variables?.scope === "organization"}
                onSave={(scope, payload) => saveTargetsMutation.mutate({ scope, payload })}
              />
            ) : null}
            {selectedTargetScope === "own" && canManageOwnTargets ? (
              <TargetScopeEditor
                title="My Scope Targets"
                description="Targets for your own dashboard scope."
                scope="own"
                targets={targetsData.targets}
                canEdit={targetsData.capabilities.canManageOwnTargets}
                isSaving={saveTargetsMutation.isPending && saveTargetsMutation.variables?.scope === "own"}
                onSave={(scope, payload) => saveTargetsMutation.mutate({ scope, payload })}
              />
            ) : null}
          </div>
        </PageSection>
      ) : null}
    </div>
  );
}
