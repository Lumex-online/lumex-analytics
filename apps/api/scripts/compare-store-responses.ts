import { configureLumexSource, ensureLumexDatasetLoaded, getLumexDataset } from "@lumex/lumex-source";
import type { DashboardFiltersInput, DashboardKey } from "@lumex/shared-types";
import { env } from "../src/config/env.js";
import { closeMongoClient, getMongoDb } from "../src/database/mongo.js";
import { DashboardService } from "../src/modules/dashboards/dashboards.service.js";
import { DrilldownsService } from "../src/modules/drilldowns/drilldowns.service.js";
import { ExecutiveDashboardService } from "../src/modules/executive-dashboard/executive-dashboard.service.js";
import { FiltersService } from "../src/modules/filters/filters.service.js";
import { BootstrapKpiTargetRepository } from "../src/modules/kpi-targets/kpi-targets.repository.js";
import { MongoKpiTargetRepository } from "../src/modules/kpi-targets/mongo-kpi-targets.repository.js";
import { KpiTargetService } from "../src/modules/kpi-targets/kpi-targets.service.js";
import { MemoConversionService } from "../src/modules/memo-conversion/memo-conversion.service.js";
import { MongoPermissionRepository } from "../src/modules/permissions/mongo-permissions.repository.js";
import { BootstrapPermissionRepository } from "../src/modules/permissions/permissions.repository.js";
import { PermissionService } from "../src/modules/permissions/permissions.service.js";
import { SkuAnalyticsService } from "../src/modules/sku-analytics/sku-analytics.service.js";

interface ServiceStack {
  dashboard: DashboardService;
  drilldowns: DrilldownsService;
  executive: ExecutiveDashboardService;
  filters: FiltersService;
  sku: SkuAnalyticsService;
  memo: MemoConversionService;
}

interface CheckCase {
  name: string;
  sourceUserId: number;
  run: (stack: ServiceStack) => Promise<unknown>;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastNDays(to: string, days: number) {
  const end = new Date(`${to}T00:00:00.000Z`);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return {
    from: formatDate(start),
    to
  };
}

function normalize(value: unknown): unknown {
  if (typeof value === "number") {
    return Number(value.toFixed(2));
  }

  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? "<timestamp>" : value;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "lastUpdatedAt")
      .map(([key, entryValue]) => {
        const normalizedValue = normalize(entryValue);
        if (
          (key === "warehouseKeys" || key === "buyerKeys" || key === "subAdminKeys") &&
          Array.isArray(normalizedValue)
        ) {
          return [key, [...normalizedValue].sort((left, right) => Number(left) - Number(right))];
        }
        return [key, normalizedValue];
      });
    return Object.fromEntries(entries);
  }

  return value;
}

function diffValues(left: unknown, right: unknown, path = "$"): string[] {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) <= 0.01 ? [] : [`${path}: ${left} !== ${right}`];
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [`${path}: array/type mismatch`];
    }
    if (left.length !== right.length) {
      return [`${path}: length ${left.length} !== ${right.length}`];
    }
    return left.flatMap((leftValue, index) => diffValues(leftValue, right[index], `${path}[${index}]`));
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
    return keys.flatMap((key) => diffValues(leftRecord[key], rightRecord[key], `${path}.${key}`));
  }

  return Object.is(left, right) ? [] : [`${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`];
}

function createBootstrapStack(): ServiceStack {
  const permissionRepository = new BootstrapPermissionRepository();
  const permissionService = new PermissionService(permissionRepository);
  const kpiTargetService = new KpiTargetService(permissionService, new BootstrapKpiTargetRepository());

  return {
    dashboard: new DashboardService(permissionService, "bootstrap"),
    drilldowns: new DrilldownsService(permissionService, "bootstrap"),
    executive: new ExecutiveDashboardService(permissionService, kpiTargetService, "bootstrap"),
    filters: new FiltersService(permissionRepository, permissionService, "bootstrap"),
    sku: new SkuAnalyticsService(permissionService, "bootstrap"),
    memo: new MemoConversionService(permissionService, "bootstrap")
  };
}

async function createMongoStack(): Promise<ServiceStack> {
  const db = await getMongoDb();
  const permissionRepository = new MongoPermissionRepository(db);
  const permissionService = new PermissionService(permissionRepository);
  const kpiTargetService = new KpiTargetService(permissionService, new MongoKpiTargetRepository(db));

  return {
    dashboard: new DashboardService(permissionService, "mongo"),
    drilldowns: new DrilldownsService(permissionService, "mongo"),
    executive: new ExecutiveDashboardService(permissionService, kpiTargetService, "mongo"),
    filters: new FiltersService(permissionRepository, permissionService, "mongo"),
    sku: new SkuAnalyticsService(permissionService, "mongo"),
    memo: new MemoConversionService(permissionService, "mongo")
  };
}

function buildFilterCases() {
  const dataset = getLumexDataset();
  const defaultSourceUserId = env.DEFAULT_SOURCE_USER_ID;
  const warehouseKey = dataset.warehouses[0]?.key;
  const buyerKey = dataset.buyers.find((buyer) => buyer.isVerified)?.key ?? dataset.buyers[0]?.key;
  const subAdminUser = dataset.subAdminUsers[0];
  const subAdminKey = dataset.subAdmins.find((subAdmin) => subAdmin.key === subAdminUser?.sourceUserId)?.key ?? dataset.subAdmins[0]?.key;
  const scopedSourceUserId = subAdminUser?.sourceUserId ?? defaultSourceUserId;
  const filtered: DashboardFiltersInput = {
    dateRange: lastNDays(dataset.maxDate, 30),
    ...(warehouseKey ? { warehouseKeys: [warehouseKey] } : {}),
    ...(buyerKey ? { buyerKeys: [buyerKey] } : {})
  };
  const scoped: DashboardFiltersInput = {
    ...(subAdminKey ? { subAdminKeys: [subAdminKey] } : {}),
    dateRange: lastNDays(dataset.maxDate, 30)
  };

  return [
    { label: "no filters", sourceUserId: defaultSourceUserId, filters: {} },
    { label: "warehouse buyer last30", sourceUserId: defaultSourceUserId, filters: filtered },
    { label: "sub-admin scoped", sourceUserId: scopedSourceUserId, filters: scoped }
  ];
}

function buildChecks(): CheckCase[] {
  const dashboards: DashboardKey[] = ["overview", "sales", "purchase", "memos", "buyers", "warehouses", "sku_analytics"];
  const filterCases = buildFilterCases();
  const checks: CheckCase[] = [];

  for (const filterCase of filterCases) {
    for (const dashboard of dashboards) {
      checks.push({
        name: `dashboards/${dashboard}/summary ${filterCase.label}`,
        sourceUserId: filterCase.sourceUserId,
        run: (stack) => stack.dashboard.getSummary(filterCase.sourceUserId, dashboard, filterCase.filters)
      });
    }

    for (const dashboard of ["overview", "sales"] as DashboardKey[]) {
      checks.push({
        name: `dashboards/${dashboard}/charts/primary ${filterCase.label}`,
        sourceUserId: filterCase.sourceUserId,
        run: (stack) => stack.dashboard.getChart(filterCase.sourceUserId, dashboard, "primary", filterCase.filters)
      });
    }

    checks.push({
      name: `analytics/executive/summary ${filterCase.label}`,
      sourceUserId: filterCase.sourceUserId,
      run: (stack) => stack.executive.getSummary(filterCase.sourceUserId, filterCase.filters)
    });
    checks.push({
      name: `analytics/sku/summary ${filterCase.label}`,
      sourceUserId: filterCase.sourceUserId,
      run: (stack) => stack.sku.getSummary(filterCase.sourceUserId, filterCase.filters)
    });
    checks.push({
      name: `analytics/memo-conversion/summary ${filterCase.label}`,
      sourceUserId: filterCase.sourceUserId,
      run: (stack) => stack.memo.getSummary(filterCase.sourceUserId, filterCase.filters)
    });
    checks.push({
      name: `drilldowns/transactions ${filterCase.label}`,
      sourceUserId: filterCase.sourceUserId,
      run: (stack) => stack.drilldowns.getTransactions(filterCase.sourceUserId, filterCase.filters)
    });
    checks.push({
      name: `filters/metadata ${filterCase.label}`,
      sourceUserId: filterCase.sourceUserId,
      run: (stack) => stack.filters.getFilters(filterCase.sourceUserId, "overview")
    });
  }

  return checks;
}

async function main() {
  configureLumexSource({
    mode: env.LUMEX_DATA_SOURCE,
    apiBaseUrl: env.LUMEX_API_BASE_URL,
    apiPathPrefix: env.LUMEX_API_PATH_PREFIX,
    apiAuthHeader: env.LUMEX_API_AUTH_HEADER,
    apiAuthToken: env.LUMEX_API_AUTH_TOKEN,
    apiTimeoutMs: env.LUMEX_API_TIMEOUT_MS,
    mongoUri: env.LUMEX_MONGO_URI,
    mongoDatabase: env.LUMEX_MONGO_DATABASE
  });
  await ensureLumexDatasetLoaded(true);

  const bootstrap = createBootstrapStack();
  const mongo = await createMongoStack();
  const checks = buildChecks();
  let passed = 0;
  const failures: string[] = [];

  for (const check of checks) {
    const [bootstrapResponse, mongoResponse] = await Promise.all([
      check.run(bootstrap),
      check.run(mongo)
    ]);
    const diffs = diffValues(normalize(bootstrapResponse), normalize(mongoResponse));
    if (diffs.length === 0) {
      passed += 1;
      continue;
    }
    failures.push(`${check.name}\n${diffs.slice(0, 3).join("\n")}`);
  }

  console.log(`[compare-store-responses] passed=${passed} failed=${failures.length} total=${checks.length}`);
  for (const failure of failures) {
    console.log(`\n${failure}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeMongoClient();
  });
