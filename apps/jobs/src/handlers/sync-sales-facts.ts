import { loadDataset } from "../database/lumex-source.js";
import { env } from "../config/env.js";
import { getMongoDb } from "../database/mongo.js";
import { generateBatchId, persistSales } from "../persist/mongo/index.js";

export async function runSyncSalesFacts(): Promise<void> {
  if (env.ANALYTICS_STORE !== "mongo") {
    console.log("[sync-sales-facts] skipped because ANALYTICS_STORE is not mongo");
    return;
  }
  const batchId = generateBatchId();
  console.log(`[sync-sales-facts] batchId=${batchId} starting`);
  const dataset = await loadDataset(true);
  const count = await persistSales({ db: await getMongoDb(), dataset, batchId });
  console.log(`[sync-sales-facts] batchId=${batchId} done rows=${count}`);
}
