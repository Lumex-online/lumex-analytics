import { runBuildInventorySnapshot } from "./handlers/build-inventory-snapshot.js";
import { runSyncMemoFacts } from "./handlers/sync-memo-facts.js";
import { runSyncPurchaseFacts } from "./handlers/sync-purchase-facts.js";
import { runSyncSalesFacts } from "./handlers/sync-sales-facts.js";
import { runSyncUsersPermissions } from "./handlers/sync-users-permissions.js";

export interface JobDefinition {
  key: string;
  schedule: string;
  description: string;
  handler: () => Promise<void>;
}

export const jobs: JobDefinition[] = [
  {
    key: "sync-users-permissions",
    schedule: "*/15 * * * *",
    description: "Sync website users, roles, warehouse scope, and buyer scope into analytics.",
    handler: runSyncUsersPermissions
  },
  {
    key: "sync-sales-facts",
    schedule: "0 * * * *",
    description: "Ingest order master and order line deltas into fact_sales_line.",
    handler: runSyncSalesFacts
  },
  {
    key: "sync-memo-facts",
    schedule: "10 * * * *",
    description: "Ingest memo master deltas into fact_memo_line.",
    handler: runSyncMemoFacts
  },
  {
    key: "sync-purchase-facts",
    schedule: "20 * * * *",
    description: "Ingest purchase deltas into fact_purchase_line.",
    handler: runSyncPurchaseFacts
  },
  {
    key: "build-inventory-snapshot",
    schedule: "30 * * * *",
    description: "Rebuild current inventory snapshot from loose lots and own shape masters.",
    handler: runBuildInventorySnapshot
  }
];
