import { configureLumexSource, ensureLumexDatasetLoaded, type LumexDataset } from "@lumex/lumex-source";
import { env } from "../config/env.js";

let configured = false;

function ensureConfigured(): void {
  if (configured) {
    return;
  }
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
  configured = true;
}

export async function loadDataset(forceRefresh = true): Promise<LumexDataset> {
  ensureConfigured();
  return ensureLumexDatasetLoaded(forceRefresh);
}
