import { loadDataset } from "../database/lumex-source.js";
import { env } from "../config/env.js";
import { getMongoDb } from "../database/mongo.js";
import { generateBatchId, persistDimensionsAndUsers } from "../persist/mongo/index.js";

export async function runSyncUsersPermissions(): Promise<void> {
  if (env.ANALYTICS_STORE !== "mongo") {
    console.log("[sync-users-permissions] skipped because ANALYTICS_STORE is not mongo");
    return;
  }
  const batchId = generateBatchId();
  console.log(`[sync-users-permissions] batchId=${batchId} starting`);
  const dataset = await loadDataset(true);
  await persistDimensionsAndUsers({ db: await getMongoDb(), dataset, batchId });
  console.log(
    `[sync-users-permissions] batchId=${batchId} done warehouses=${dataset.warehouses.length} buyers=${dataset.buyers.length} subAdmins=${dataset.subAdmins.length} users=${dataset.adminUsers.length + dataset.subAdminUsers.length}`
  );
}
