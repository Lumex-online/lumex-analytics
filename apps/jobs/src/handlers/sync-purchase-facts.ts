import { loadDataset } from "../database/lumex-source.js";
import { env } from "../config/env.js";
import { getMongoDb } from "../database/mongo.js";
import { generateBatchId, persistPurchases } from "../persist/mongo/index.js";

export async function runSyncPurchaseFacts(): Promise<void> {
  if (env.ANALYTICS_STORE !== "mongo") {
    console.log("[sync-purchase-facts] skipped because ANALYTICS_STORE is not mongo");
    return;
  }
  const batchId = generateBatchId();
  console.log(`[sync-purchase-facts] batchId=${batchId} starting`);
  const dataset = await loadDataset(true);
  const count = await persistPurchases({ db: await getMongoDb(), dataset, batchId });
  console.log(`[sync-purchase-facts] batchId=${batchId} done rows=${count}`);
}
