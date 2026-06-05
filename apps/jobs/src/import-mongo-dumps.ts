import fs from "node:fs";
import path from "node:path";
import { EJSON } from "bson";
import { MongoClient as MongoDriverClient } from "mongodb";
import { env } from "./config/env.js";

const DEFAULT_DUMP_DIR = "C:/Users/lumex/Downloads/lumex";

const FILE_TO_COLLECTION: Record<string, string> = {
  "lumex.buyer_master.json": "buyer_master",
  "lumex.clarity_master.json": "clarity_master",
  "lumex.color_master.json": "color_master",
  "lumex.cut_master.json": "cut_master",
  "lumex.fluorescence_master.json": "fluorescence_master",
  "lumex.growth_master.json": "growth_master",
  "lumex.intensity_master.json": "intensity_master",
  "lumex.inventory_master.json": "inventory_master",
  "lumex.loose_lots_master.json": "loose_lots_master",
  "lumex.loose_lots_order_master.json": "loose_lots_order_master",
  "lumex.loose_lots_purchase_master.json": "loose_lots_purchase_master",
  "lumex.memo_master.json": "memo_master",
  "lumex.order_master.json": "order_master",
  "lumex.order_return_master.json": "order_return_master",
  "lumex.own_shape_master.json": "own_shape_master",
  "lumex.own_shape_order_master.json": "own_shape_order_master",
  "lumex.polish_master.json": "polish_master",
  "lumex.shape_master.json": "shape_master",
  "lumex.size_master.json": "size_master",
  "lumex.sub_admin_master.json": "sub_admin_master",
  "lumex.symmetry_master.json": "symmetry_master",
  "lumex.user_master.json": "user_master",
  "lumex.vendor_master.json": "vendor_master",
  "lumex.warehouse_buyer_master.json": "warehouse_buyer_master",
  "lumex.warehouse_master.json": "warehouse_master",
  "lumex.warehouse_purchase_master.json": "warehouse_purchase_master"
};

async function importOne(dbClient: MongoDriverClient, dbName: string, file: string, collection: string, dumpDir: string): Promise<number> {
  const filePath = path.join(dumpDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`  skip ${file} (not found)`);
    return 0;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const docs = EJSON.parse(raw, { relaxed: false }) as unknown[];
  if (!Array.isArray(docs)) {
    throw new Error(`${file} is not a JSON array`);
  }
  if (docs.length === 0) {
    console.log(`  ${collection} → 0 docs (empty file)`);
    return 0;
  }
  const col = dbClient.db(dbName).collection(collection);
  await col.deleteMany({});
  await col.insertMany(docs as Record<string, unknown>[], { ordered: false });
  console.log(`  ${collection} → ${docs.length} docs imported`);
  return docs.length;
}

async function main(): Promise<void> {
  const dumpDir = process.env.LUMEX_DUMP_DIR || DEFAULT_DUMP_DIR;
  const mongoUri = env.LUMEX_MONGO_URI || "mongodb://localhost:27017";
  const mongoDb = env.LUMEX_MONGO_DATABASE || "lumex";

  console.log(`[import] dump dir : ${dumpDir}`);
  console.log(`[import] mongo    : ${mongoUri} / ${mongoDb}`);

  if (!fs.existsSync(dumpDir)) {
    throw new Error(`Dump directory not found: ${dumpDir}`);
  }

  const client = new MongoDriverClient(mongoUri);
  await client.connect();
  try {
    let total = 0;
    for (const [file, collection] of Object.entries(FILE_TO_COLLECTION)) {
      total += await importOne(client, mongoDb, file, collection, dumpDir);
    }
    console.log(`[import] done. total documents imported: ${total}`);
  } finally {
    await client.close();
  }
}

void main().catch((err) => {
  console.error("[import] failed", err);
  process.exitCode = 1;
});
