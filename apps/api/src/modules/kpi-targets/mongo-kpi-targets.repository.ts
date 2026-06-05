import type { Db } from "mongodb";
import type {
  DeleteKpiTargetInput,
  KpiTargetDefinition,
  KpiTargetMetricKey,
  KpiTargetScope,
  UpdateKpiTargetInput
} from "@lumex/shared-types";
import type { KpiTargetRepository } from "./kpi-targets.repository.js";

interface MongoKpiTargetDoc {
  _id: string;
  metricKey: KpiTargetMetricKey;
  scope: KpiTargetScope;
  scopeKey: string;
  targetFrom: string;
  targetTo: string;
  targetValue: number;
  isActive: boolean;
  createdBy?: number;
  updatedBy?: number;
  createdAt: Date;
  updatedAt: Date;
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

function scopeKeyForInput(scope: KpiTargetScope, sourceUserId: number) {
  return scope === "organization" ? "organization" : String(sourceUserId);
}

function targetId(
  metricKey: KpiTargetMetricKey,
  scope: KpiTargetScope,
  scopeKey: string,
  from: string,
  to: string
) {
  return `${metricKey}:${scope}:${scopeKey}:${from}:${to}`;
}

function toDefinition(doc: MongoKpiTargetDoc): KpiTargetDefinition {
  return {
    metricKey: doc.metricKey,
    scope: doc.scope,
    dateRange: {
      from: doc.targetFrom,
      to: doc.targetTo
    },
    targetValue: doc.targetValue,
    updatedAt: doc.updatedAt.toISOString(),
    updatedBySourceUserId: doc.updatedBy ?? null
  };
}

export class MongoKpiTargetRepository implements KpiTargetRepository {
  constructor(private readonly db: Db) {}

  private collection() {
    return this.db.collection<MongoKpiTargetDoc>("analytics_kpi_targets");
  }

  async listVisibleTargets(sourceUserId: number) {
    const docs = await this.collection()
      .find({
        isActive: true,
        $or: [
          { scope: "organization", scopeKey: "organization" },
          { scope: "own", scopeKey: String(sourceUserId) }
        ]
      })
      .sort({ metricKey: 1, targetFrom: 1, targetTo: 1, scope: 1 })
      .toArray();

    return docs.map(toDefinition);
  }

  async upsertTarget(actorSourceUserId: number, input: UpdateKpiTargetInput) {
    const scopeKey = scopeKeyForInput(input.scope, actorSourceUserId);
    const targetFrom = normalizeDateValue(input.dateRange.from);
    const targetTo = normalizeDateValue(input.dateRange.to);
    const now = new Date();
    const _id = targetId(input.metricKey, input.scope, scopeKey, targetFrom, targetTo);

    await this.collection().updateOne(
      { _id },
      {
        $set: {
          metricKey: input.metricKey,
          scope: input.scope,
          scopeKey,
          targetFrom,
          targetTo,
          targetValue: Number(input.targetValue.toFixed(2)),
          isActive: true,
          updatedBy: actorSourceUserId,
          updatedAt: now
        },
        $setOnInsert: {
          _id,
          createdBy: actorSourceUserId,
          createdAt: now
        }
      },
      { upsert: true }
    );

    const doc = await this.collection().findOne({ _id });
    if (!doc) {
      throw new Error("Target upsert did not return a document.");
    }

    return toDefinition(doc);
  }

  async deleteTarget(actorSourceUserId: number, input: DeleteKpiTargetInput) {
    const scopeKey = scopeKeyForInput(input.scope, actorSourceUserId);
    const targetFrom = normalizeDateValue(input.dateRange.from);
    const targetTo = normalizeDateValue(input.dateRange.to);
    await this.collection().updateOne(
      {
        _id: targetId(input.metricKey, input.scope, scopeKey, targetFrom, targetTo)
      },
      {
        $set: {
          isActive: false,
          updatedBy: actorSourceUserId,
          updatedAt: new Date()
        }
      }
    );
  }
}
