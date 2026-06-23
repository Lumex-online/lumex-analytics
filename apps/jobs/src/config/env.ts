import fs from "node:fs";
import path from "node:path";

function findWorkspaceRoot(startDir = process.cwd()): string {
  let current = startDir;

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          name?: string;
          workspaces?: unknown;
        };

        if (packageJson.name === "lumex-analytics" || Array.isArray(packageJson.workspaces)) {
          return current;
        }
      } catch {
        // Keep walking upward if package.json is not readable.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function envFileFromAlias(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "local") return ".env.local";
  if (normalized === "dev" || normalized === "development") return ".env.dev";
  if (normalized === "prod" || normalized === "production") return ".env.prod";
  return null;
}

function selectedEnvFile(): string {
  const explicitFile = process.env.ANALYTICS_ENV_FILE?.trim();
  if (explicitFile) {
    return explicitFile;
  }

  const explicitEnv = process.env.ANALYTICS_ENV?.trim();
  const envAlias = explicitEnv ? envFileFromAlias(explicitEnv) : null;
  if (envAlias) {
    return envAlias;
  }

  const lifecycle = process.env.npm_lifecycle_event?.toLowerCase() ?? "";
  if (lifecycle === "start" || lifecycle === "start:once" || lifecycle === "db:setup" || lifecycle.includes("prod")) {
    return ".env.prod";
  }
  if (lifecycle === "dev:dev") {
    return ".env.dev";
  }
  if (lifecycle.includes("dev")) {
    return ".env.local";
  }

  return ".env";
}

function loadRootEnvFile(): void {
  const workspaceRoot = findWorkspaceRoot();
  const preferredPath = path.resolve(workspaceRoot, selectedEnvFile());
  const fallbackPath = path.join(workspaceRoot, ".env");

  if (fs.existsSync(preferredPath)) {
    process.loadEnvFile?.(preferredPath);
    return;
  }

  if (fs.existsSync(fallbackPath)) {
    process.loadEnvFile?.(fallbackPath);
  }
}

loadRootEnvFile();

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

export const env = {
  NODE_ENV:
    process.env.NODE_ENV ??
    (envFileFromAlias(process.env.ANALYTICS_ENV ?? "") === ".env.prod" ? "production" : "development"),
  ANALYTICS_STORE: (process.env.ANALYTICS_STORE?.trim().toLowerCase() === "mongo"
    ? "mongo"
    : "bootstrap") as "bootstrap" | "mongo",
  LUMEX_DATA_SOURCE: ((): "api" | "files" | "mongo" => {
    const raw = process.env.LUMEX_DATA_SOURCE?.trim().toLowerCase();
    if (raw === "api") return "api";
    if (raw === "mongo") return "mongo";
    return "files";
  })(),
  LUMEX_API_BASE_URL: process.env.LUMEX_API_BASE_URL ?? "",
  LUMEX_API_PATH_PREFIX: process.env.LUMEX_API_PATH_PREFIX ?? "",
  LUMEX_API_AUTH_HEADER: process.env.LUMEX_API_AUTH_HEADER ?? "Authorization",
  LUMEX_API_AUTH_TOKEN: process.env.LUMEX_API_AUTH_TOKEN ?? "",
  LUMEX_API_TIMEOUT_MS: parseNumber(process.env.LUMEX_API_TIMEOUT_MS, 60000),
  LUMEX_MONGO_URI: process.env.LUMEX_MONGO_URI ?? "",
  LUMEX_MONGO_DATABASE: process.env.LUMEX_MONGO_DATABASE ?? "lumex",
  ANALYTICS_MONGO_URI: process.env.ANALYTICS_MONGO_URI ?? "",
  ANALYTICS_MONGO_DATABASE: process.env.ANALYTICS_MONGO_DATABASE ?? "lumex_analytics",
  ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO: parseBoolean(
    process.env.ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO,
    false
  ),
  ETL_BATCH_SIZE: parseNumber(process.env.ETL_BATCH_SIZE, 500),
  ETL_RUN_ON_BOOT: parseBoolean(process.env.ETL_RUN_ON_BOOT, false)
};

function uriHasUsername(uri: string): boolean {
  try {
    return new URL(uri).username.trim().length > 0;
  } catch {
    return false;
  }
}

function validateProductionEnv(): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const errors: string[] = [];
  if (env.ANALYTICS_STORE !== "mongo") {
    errors.push("ANALYTICS_STORE must be mongo in production.");
  }
  if (env.LUMEX_DATA_SOURCE !== "mongo") {
    errors.push("LUMEX_DATA_SOURCE must be mongo in production.");
  }
  if (env.ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO) {
    errors.push("ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO cannot be true in production.");
  }
  if (!uriHasUsername(env.LUMEX_MONGO_URI)) {
    errors.push("LUMEX_MONGO_URI must be authenticated in production.");
  }
  if (!uriHasUsername(env.ANALYTICS_MONGO_URI)) {
    errors.push("ANALYTICS_MONGO_URI must be authenticated in production.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production analytics jobs configuration:\n- ${errors.join("\n- ")}`);
  }
}

validateProductionEnv();
