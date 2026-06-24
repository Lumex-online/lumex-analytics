import cors, { type OriginFunction } from "@fastify/cors";
import Fastify from "fastify";
import { assertDistinctMongoUsers, closeMongoClient, getMongoDb } from "./database/mongo.js";
import { AdminAccessController } from "./modules/admin-access/admin-access.controller.js";
import { registerAdminAccessRoutes } from "./modules/admin-access/admin-access.routes.js";
import { authenticateRequest } from "./modules/auth/auth.middleware.js";
import { DashboardController } from "./modules/dashboards/dashboards.controller.js";
import { DashboardService } from "./modules/dashboards/dashboards.service.js";
import { registerDashboardRoutes } from "./modules/dashboards/dashboards.routes.js";
import { DrilldownsController } from "./modules/drilldowns/drilldowns.controller.js";
import { registerDrilldownsRoutes } from "./modules/drilldowns/drilldowns.routes.js";
import { DrilldownsService } from "./modules/drilldowns/drilldowns.service.js";
import { ExecutiveDashboardController } from "./modules/executive-dashboard/executive-dashboard.controller.js";
import { registerExecutiveDashboardRoutes } from "./modules/executive-dashboard/executive-dashboard.routes.js";
import { ExecutiveDashboardService } from "./modules/executive-dashboard/executive-dashboard.service.js";
import { ExportsController } from "./modules/exports/exports.controller.js";
import { registerExportsRoutes } from "./modules/exports/exports.routes.js";
import { ExportsService } from "./modules/exports/exports.service.js";
import { FiltersController } from "./modules/filters/filters.controller.js";
import { FiltersService } from "./modules/filters/filters.service.js";
import { registerFiltersRoutes } from "./modules/filters/filters.routes.js";
import { HealthController } from "./modules/health/health.controller.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { KpiTargetController } from "./modules/kpi-targets/kpi-targets.controller.js";
import { BootstrapKpiTargetRepository } from "./modules/kpi-targets/kpi-targets.repository.js";
import { MongoKpiTargetRepository } from "./modules/kpi-targets/mongo-kpi-targets.repository.js";
import { registerKpiTargetRoutes } from "./modules/kpi-targets/kpi-targets.routes.js";
import { KpiTargetService } from "./modules/kpi-targets/kpi-targets.service.js";
import { MemoConversionController } from "./modules/memo-conversion/memo-conversion.controller.js";
import { registerMemoConversionRoutes } from "./modules/memo-conversion/memo-conversion.routes.js";
import { MemoConversionService } from "./modules/memo-conversion/memo-conversion.service.js";
import { configureLumexSource, ensureLumexDatasetLoaded } from "@lumex/lumex-source";
import { env } from "./config/env.js";
import { PermissionController } from "./modules/permissions/permissions.controller.js";
import { MongoPermissionRepository } from "./modules/permissions/mongo-permissions.repository.js";
import { BootstrapPermissionRepository } from "./modules/permissions/permissions.repository.js";
import { PermissionService } from "./modules/permissions/permissions.service.js";
import { registerPermissionRoutes } from "./modules/permissions/permissions.routes.js";
import { registerSkuAnalyticsRoutes } from "./modules/sku-analytics/sku-analytics.routes.js";
import { SkuAnalyticsController } from "./modules/sku-analytics/sku-analytics.controller.js";
import { SkuAnalyticsService } from "./modules/sku-analytics/sku-analytics.service.js";

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
}

function buildCorsOriginMatcher(): OriginFunction {
  const allowedOrigins = new Set(
    env.WEB_ORIGIN
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
  );

  return (origin, callback) => {
    if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: buildCorsOriginMatcher(),
    credentials: true
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/v1/")) {
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      reply.header("Pragma", "no-cache");
      reply.header("Expires", "0");
      reply.header("Surrogate-Control", "no-store");
    }
  });

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

  if (env.ANALYTICS_STORE === "bootstrap") {
    await ensureLumexDatasetLoaded();
  } else {
    assertDistinctMongoUsers();
  }

  const analyticsDb = env.ANALYTICS_STORE === "mongo" ? await getMongoDb() : null;
  const permissionRepository = analyticsDb
    ? new MongoPermissionRepository(analyticsDb)
    : new BootstrapPermissionRepository();
  const kpiTargetRepository = analyticsDb
    ? new MongoKpiTargetRepository(analyticsDb)
    : new BootstrapKpiTargetRepository();
  const permissionService = new PermissionService(permissionRepository);
  const kpiTargetService = new KpiTargetService(permissionService, kpiTargetRepository);
  const filtersService = new FiltersService(permissionRepository, permissionService);
  const dashboardService = new DashboardService(permissionService);
  const drilldownsService = new DrilldownsService(permissionService);
  const executiveDashboardService = new ExecutiveDashboardService(permissionService, kpiTargetService);
  const skuAnalyticsService = new SkuAnalyticsService(permissionService);
  const memoConversionService = new MemoConversionService(permissionService);
  const exportsService = new ExportsService();

  const healthController = new HealthController();
  const kpiTargetController = new KpiTargetController(kpiTargetService);
  const permissionController = new PermissionController(permissionService);
  const filtersController = new FiltersController(filtersService);
  const dashboardController = new DashboardController(dashboardService);
  const drilldownsController = new DrilldownsController(drilldownsService);
  const adminAccessController = new AdminAccessController(permissionService);
  const executiveDashboardController = new ExecutiveDashboardController(executiveDashboardService);
  const skuAnalyticsController = new SkuAnalyticsController(skuAnalyticsService);
  const exportsController = new ExportsController(exportsService);
  const memoConversionController = new MemoConversionController(memoConversionService);

  app.addHook("onRequest", authenticateRequest(permissionService));

  await app.register(registerHealthRoutes, { controller: healthController });
  await app.register(registerKpiTargetRoutes, { controller: kpiTargetController });
  await app.register(registerPermissionRoutes, { controller: permissionController });
  await app.register(registerFiltersRoutes, { controller: filtersController });
  await app.register(registerDashboardRoutes, { controller: dashboardController });
  await app.register(registerDrilldownsRoutes, { controller: drilldownsController });
  await app.register(registerAdminAccessRoutes, { controller: adminAccessController });
  await app.register(registerExecutiveDashboardRoutes, { controller: executiveDashboardController });
  await app.register(registerSkuAnalyticsRoutes, { controller: skuAnalyticsController });
  await app.register(registerMemoConversionRoutes, { controller: memoConversionController });
  await app.register(registerExportsRoutes, { controller: exportsController });

  app.addHook("onClose", async () => {
    await closeMongoClient();
  });

  return app;
}
