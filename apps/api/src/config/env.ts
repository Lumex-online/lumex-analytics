import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

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
  if (normalized === "local") return ".env";
  if (normalized === "dev" || normalized === "development") return ".env.dev";
  if (normalized === "prod" || normalized === "production") return ".env.prod";
  return null;
}

function parseAnalyticsEnv(value: string | undefined): "local" | "dev" | "prod" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "dev" || normalized === "development") return "dev";
  if (normalized === "prod" || normalized === "production") return "prod";
  return "local";
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
  if (lifecycle === "dev:dev") {
    return ".env.dev";
  }
  if (lifecycle.includes("prod")) {
    return ".env.prod";
  }
  if (lifecycle.includes("dev")) {
    return ".env";
  }

  return ".env";
}

function loadRootEnvFile(): void {
  const workspaceRoot = findWorkspaceRoot();
  const preferredPath = path.resolve(workspaceRoot, selectedEnvFile());
  const fallbackPath = path.join(workspaceRoot, ".env");

  if (fs.existsSync(preferredPath)) {
    loadEnvFile(preferredPath);
    return;
  }

  if (fs.existsSync(fallbackPath)) {
    loadEnvFile(fallbackPath);
  }
}

loadRootEnvFile();

function loadEnvFile(filePath: string): void {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(filePath);
    return;
  }

  loadDotenv({ path: filePath, quiet: true });
}

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
  ANALYTICS_ENV: parseAnalyticsEnv(process.env.ANALYTICS_ENV),
  NODE_ENV:
    process.env.NODE_ENV ??
    (parseAnalyticsEnv(process.env.ANALYTICS_ENV) === "prod" ? "production" : "development"),
  PORT: parseNumber(process.env.PORT, 4001),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  DEFAULT_SOURCE_USER_ID: parseNumber(process.env.DEFAULT_SOURCE_USER_ID, 1),
  ANALYTICS_PROXY_USER_HEADER:
    process.env.ANALYTICS_PROXY_USER_HEADER ?? "x-analytics-source-user-id",
  ANALYTICS_PROXY_SECRET_HEADER:
    process.env.ANALYTICS_PROXY_SECRET_HEADER ?? "x-analytics-proxy-secret",
  ANALYTICS_PROXY_SECRET: process.env.ANALYTICS_PROXY_SECRET ?? "",
  ANALYTICS_EMBED_TOKEN_SECRET: process.env.ANALYTICS_EMBED_TOKEN_SECRET ?? "",
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
  LUMEX_API_TIMEOUT_MS: parseNumber(process.env.LUMEX_API_TIMEOUT_MS, 30000),
  LUMEX_MONGO_URI: process.env.LUMEX_MONGO_URI ?? "",
  LUMEX_MONGO_DATABASE: process.env.LUMEX_MONGO_DATABASE ?? "lumex",
  ANALYTICS_MONGO_URI: process.env.ANALYTICS_MONGO_URI ?? "",
  ANALYTICS_MONGO_DATABASE: process.env.ANALYTICS_MONGO_DATABASE ?? "lumex_analytics",
  ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO: parseBoolean(
    process.env.ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO,
    false
  )
};

function uriHasUsername(uri: string): boolean {
  try {
    return new URL(uri).username.trim().length > 0;
  } catch {
    return false;
  }
}

function validateSecureEnv(): void {
  if (env.ANALYTICS_ENV === "local") {
    return;
  }

  const errors: string[] = [];
  if (!env.ANALYTICS_EMBED_TOKEN_SECRET.trim()) {
    errors.push("ANALYTICS_EMBED_TOKEN_SECRET is required when ANALYTICS_ENV is dev or prod.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid secure analytics configuration:\n- ${errors.join("\n- ")}`);
  }
}

function validateProductionEnv(): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const errors: string[] = [];
  if (env.ANALYTICS_ENV !== "prod") {
    errors.push("ANALYTICS_ENV must be prod when NODE_ENV=production.");
  }
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
  if (!env.ANALYTICS_PROXY_SECRET.trim()) {
    errors.push("ANALYTICS_PROXY_SECRET is required in production.");
  }
  if (!env.ANALYTICS_EMBED_TOKEN_SECRET.trim()) {
    errors.push("ANALYTICS_EMBED_TOKEN_SECRET is required in production.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production analytics configuration:\n- ${errors.join("\n- ")}`);
  }
}

validateSecureEnv();
validateProductionEnv();
