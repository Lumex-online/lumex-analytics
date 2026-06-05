import type {
  DeleteKpiTargetInput,
  KpiTargetDefinition,
  KpiTargetMetricKey,
  KpiTargetScope,
  UpdateKpiTargetInput
} from "@lumex/shared-types";

export interface KpiTargetRepository {
  listVisibleTargets(sourceUserId: number): Promise<KpiTargetDefinition[]>;
  upsertTarget(actorSourceUserId: number, input: UpdateKpiTargetInput): Promise<KpiTargetDefinition>;
  deleteTarget(actorSourceUserId: number, input: DeleteKpiTargetInput): Promise<void>;
}

function targetKey(
  metricKey: KpiTargetMetricKey,
  scope: KpiTargetScope,
  from: string,
  to: string,
  sourceUserId?: number
) {
  return `${metricKey}:${scope}:${from}:${to}:${scope === "organization" ? "organization" : String(sourceUserId ?? 0)}`;
}

function normalizeDateValue(value: string | Date) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

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

export class BootstrapKpiTargetRepository implements KpiTargetRepository {
  private readonly targets = new Map<string, KpiTargetDefinition>();

  async listVisibleTargets(sourceUserId: number) {
    return [...this.targets.entries()]
      .filter(([key, target]) =>
        target.scope === "organization" ||
        key === targetKey(target.metricKey, target.scope, target.dateRange.from, target.dateRange.to, sourceUserId)
      )
      .map(([, target]) => target)
      .sort((left, right) =>
        left.dateRange.from.localeCompare(right.dateRange.from) ||
        left.dateRange.to.localeCompare(right.dateRange.to)
      );
  }

  async upsertTarget(actorSourceUserId: number, input: UpdateKpiTargetInput) {
    const normalizedFrom = normalizeDateValue(input.dateRange.from);
    const normalizedTo = normalizeDateValue(input.dateRange.to);
    const target: KpiTargetDefinition = {
      metricKey: input.metricKey,
      scope: input.scope,
      dateRange: {
        from: normalizedFrom,
        to: normalizedTo
      },
      targetValue: Number(input.targetValue.toFixed(2)),
      updatedAt: new Date().toISOString(),
      updatedBySourceUserId: actorSourceUserId
    };

    this.targets.set(
      targetKey(input.metricKey, input.scope, normalizedFrom, normalizedTo, actorSourceUserId),
      target
    );
    return target;
  }

  async deleteTarget(actorSourceUserId: number, input: DeleteKpiTargetInput) {
    this.targets.delete(
      targetKey(
        input.metricKey,
        input.scope,
        normalizeDateValue(input.dateRange.from),
        normalizeDateValue(input.dateRange.to),
        actorSourceUserId
      )
    );
  }
}
