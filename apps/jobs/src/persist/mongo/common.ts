import type {
  BuyerOption,
  ProductOption,
  SubAdminOption,
  VendorOption,
  WarehouseOption
} from "@lumex/shared-types";
import type { LumexDataset } from "@lumex/lumex-source";

export function parseDateAtUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function sourceTableForRow(row: { sourceType: "sales" | "purchase" | "memo"; productType: string }): string {
  if (row.sourceType === "memo") {
    return "memo_master";
  }

  if (row.sourceType === "sales") {
    return row.productType === "loose_lots"
      ? "loose_lots_order_master"
      : "own_shape_order_master";
  }

  return row.productType === "loose_lots"
    ? "loose_lots_purchase_master"
    : "warehouse_purchase_master";
}

export interface DimensionMaps {
  warehouses: Map<number, WarehouseOption>;
  buyers: Map<number, BuyerOption>;
  vendors: Map<number, VendorOption>;
  products: Map<number, ProductOption>;
  subAdmins: Map<number, SubAdminOption>;
}

export function buildDimensionMaps(dataset: LumexDataset): DimensionMaps {
  return {
    warehouses: new Map(dataset.warehouses.map((warehouse) => [warehouse.key, warehouse])),
    buyers: new Map(dataset.buyers.map((buyer) => [buyer.key, buyer])),
    vendors: new Map(dataset.vendors.map((vendor) => [vendor.key, vendor])),
    products: new Map(dataset.products.map((product) => [product.key, product])),
    subAdmins: new Map(dataset.subAdmins.map((subAdmin) => [subAdmin.key, subAdmin]))
  };
}

export function embeddedWarehouse(maps: DimensionMaps, warehouseKey: number | null) {
  if (warehouseKey === null) {
    return null;
  }
  const warehouse = maps.warehouses.get(warehouseKey);
  return warehouse
    ? { key: warehouse.key, code: warehouse.code, name: warehouse.name }
    : null;
}

export function embeddedBuyer(maps: DimensionMaps, buyerKey: number | null) {
  if (buyerKey === null) {
    return null;
  }
  const buyer = maps.buyers.get(buyerKey);
  return buyer
    ? {
        key: buyer.key,
        code: buyer.code,
        name: buyer.name,
        country: buyer.country,
        location: buyer.location,
        isVerified: buyer.isVerified
      }
    : null;
}

export function embeddedVendor(maps: DimensionMaps, vendorKey: number | null) {
  if (vendorKey === null) {
    return null;
  }
  const vendor = maps.vendors.get(vendorKey);
  return vendor
    ? {
        key: vendor.key,
        code: vendor.code,
        name: vendor.name,
        country: vendor.country,
        isVerified: vendor.isVerified
      }
    : null;
}

export function embeddedProduct(maps: DimensionMaps, productKey: number) {
  const product = maps.products.get(productKey);
  return product
    ? {
        key: product.key,
        sku: product.sku,
        name: product.name,
        shape: product.shape,
        size: product.size,
        color: product.color,
        clarity: product.clarity
      }
    : {
        key: productKey,
        sku: String(productKey),
        name: `Product ${productKey}`,
        shape: "Unknown",
        size: "Unknown",
        color: "Unknown",
        clarity: "Unknown"
      };
}

export function embeddedSubAdmin(maps: DimensionMaps, subAdminKey: number | null) {
  if (subAdminKey === null) {
    return null;
  }
  const subAdmin = maps.subAdmins.get(subAdminKey);
  return subAdmin
    ? { key: subAdmin.key, code: subAdmin.code, name: subAdmin.name }
    : null;
}

export function embeddedSubAdmins(maps: DimensionMaps, subAdminKeys: number[]) {
  return subAdminKeys
    .map((key) => embeddedSubAdmin(maps, key))
    .filter((subAdmin): subAdmin is { key: number; code: string; name: string } => subAdmin !== null);
}
