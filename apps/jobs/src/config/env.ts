process.loadEnvFile?.();

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
  NODE_ENV: process.env.NODE_ENV ?? "development",
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
