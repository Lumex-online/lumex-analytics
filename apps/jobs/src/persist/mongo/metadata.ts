import type { Db } from "mongodb";
import type { LumexDataset } from "@lumex/lumex-source";

export async function persistDatasetMetadata(db: Db, dataset: LumexDataset, batchId: number): Promise<void> {
  await db.collection("analytics_dataset_metadata").updateOne(
    { _id: "current" } as any,
    {
      $set: {
        _id: "current",
        buyerMasterCount: dataset.buyerMasterCount,
        verifiedBuyerMasterCount: dataset.verifiedBuyerMasterCount,
        verifiedBuyerKeys: dataset.verifiedBuyerKeys,
        vendorMasterCount: dataset.vendorMasterCount,
        verifiedVendorMasterCount: dataset.verifiedVendorMasterCount,
        verifiedVendorKeys: dataset.verifiedVendorKeys,
        hasUserVerificationData: dataset.hasUserVerificationData,
        minDate: dataset.minDate,
        maxDate: dataset.maxDate,
        lastEtlBatchId: batchId,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
}
