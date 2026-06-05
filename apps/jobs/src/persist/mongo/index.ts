import type { Db } from "mongodb";
import type { LumexDataset } from "@lumex/lumex-source";
import { persistBuyerSubAdminBridges } from "./bridges.js";
import { persistAllDimensions } from "./dimensions.js";
import {
  persistInventorySnapshot,
  persistMemoFacts,
  persistPurchaseFacts,
  persistSalesFacts
} from "./facts.js";
import { persistDatasetMetadata } from "./metadata.js";

export function generateBatchId(): number {
  return Math.floor(Date.now() / 1000);
}

export interface PersistContext {
  db: Db;
  dataset: LumexDataset;
  batchId: number;
}

export async function persistDimensionsAndUsers(ctx: PersistContext): Promise<void> {
  await persistAllDimensions(ctx.db, ctx.dataset, ctx.batchId);
  await persistBuyerSubAdminBridges(ctx.db, ctx.dataset);
  await persistDatasetMetadata(ctx.db, ctx.dataset, ctx.batchId);
}

export async function persistSales(ctx: PersistContext): Promise<number> {
  await persistAllDimensions(ctx.db, ctx.dataset, ctx.batchId);
  const count = await persistSalesFacts(ctx.db, ctx.dataset, ctx.batchId);
  await persistDatasetMetadata(ctx.db, ctx.dataset, ctx.batchId);
  return count;
}

export async function persistMemos(ctx: PersistContext): Promise<number> {
  await persistAllDimensions(ctx.db, ctx.dataset, ctx.batchId);
  const count = await persistMemoFacts(ctx.db, ctx.dataset, ctx.batchId);
  await persistDatasetMetadata(ctx.db, ctx.dataset, ctx.batchId);
  return count;
}

export async function persistPurchases(ctx: PersistContext): Promise<number> {
  await persistAllDimensions(ctx.db, ctx.dataset, ctx.batchId);
  const count = await persistPurchaseFacts(ctx.db, ctx.dataset, ctx.batchId);
  await persistDatasetMetadata(ctx.db, ctx.dataset, ctx.batchId);
  return count;
}

export async function persistInventory(ctx: PersistContext): Promise<number> {
  await persistAllDimensions(ctx.db, ctx.dataset, ctx.batchId);
  const count = await persistInventorySnapshot(ctx.db, ctx.dataset, ctx.batchId);
  await persistDatasetMetadata(ctx.db, ctx.dataset, ctx.batchId);
  return count;
}
