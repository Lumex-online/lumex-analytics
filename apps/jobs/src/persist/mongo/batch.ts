import type { Collection, Document } from "mongodb";
import { env } from "../../config/env.js";

export async function bulkWriteUpsert<TRow>(
  collection: Collection<Document>,
  rows: TRow[],
  toDocument: (row: TRow) => Document & { _id: unknown }
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = Math.max(1, env.ETL_BATCH_SIZE);
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const operations = chunk.map((row) => {
      const document = toDocument(row);
      return {
        updateOne: {
          filter: { _id: document._id },
          update: { $set: document },
          upsert: true
        }
      };
    });
    await collection.bulkWrite(operations as any, { ordered: false });
  }
}

export async function bulkWriteReplace<TRow>(
  collection: Collection<Document>,
  rows: TRow[],
  toDocument: (row: TRow) => Document & { _id: unknown }
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = Math.max(1, env.ETL_BATCH_SIZE);
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const operations = chunk.map((row) => {
      const document = toDocument(row);
      return {
        replaceOne: {
          filter: { _id: document._id },
          replacement: document,
          upsert: true
        }
      };
    });
    await collection.bulkWrite(operations as any, { ordered: false });
  }
}
