import type {
  AnalyticsAccessPolicy,
  BuyerOption,
  FilterVisibility,
  ProductOption,
  SubAdminOption,
  UserIdentity,
  WarehouseOption
} from "@lumex/shared-types";

const fullFilterVisibility: FilterVisibility = {
  warehouses: true,
  buyers: true,
  subAdmins: true,
  vendors: true,
  skus: true,
  shape: true,
  size: true,
  color: true,
  clarity: true,
  purchase: true,
  memo: true
};

const subAdminFilterVisibility: FilterVisibility = {
  warehouses: false,
  buyers: true,
  subAdmins: false,
  vendors: true,
  skus: true,
  shape: true,
  size: true,
  color: true,
  clarity: true,
  purchase: false,
  memo: true
};

export const warehouses: WarehouseOption[] = [
  { key: 101, code: "MUM", name: "Mumbai" },
  { key: 102, code: "SUR", name: "Surat" },
  { key: 103, code: "HK", name: "Hong Kong" }
];

export const buyers: BuyerOption[] = [
  {
    key: 201,
    code: "B-ASTER",
    name: "Aster Jewels",
    location: "Mumbai",
    country: "IN",
    isVerified: true,
    warehouseKeys: [101, 102]
  },
  {
    key: 202,
    code: "B-ORION",
    name: "Orion Gems",
    location: "Surat",
    country: "IN",
    isVerified: false,
    warehouseKeys: [101, 102]
  },
  {
    key: 203,
    code: "B-LUXE",
    name: "Luxe Stones",
    location: "Hong Kong",
    country: "HK",
    isVerified: true,
    warehouseKeys: [103]
  }
];

export const subAdmins: SubAdminOption[] = [
  { key: 301, code: "SA-SUR-1", name: "Surat Team A" },
  { key: 302, code: "SA-MUM-1", name: "Mumbai Team A" },
  { key: 303, code: "SA-HK-1", name: "Hong Kong Team A" }
];

export const products: ProductOption[] = [
  {
    key: 401,
    sku: "SKU-RND-050-D-E-VS1",
    name: "Round 0.50 D VS1",
    shape: "Round",
    size: "0.50",
    color: "D",
    clarity: "VS1"
  },
  {
    key: 402,
    sku: "SKU-PRN-100-F-G-VVS2",
    name: "Princess 1.00 F VVS2",
    shape: "Princess",
    size: "1.00",
    color: "F",
    clarity: "VVS2"
  },
  {
    key: 403,
    sku: "SKU-OVL-075-E-H-VS2",
    name: "Oval 0.75 E VS2",
    shape: "Oval",
    size: "0.75",
    color: "E",
    clarity: "VS2"
  }
];

export const users: UserIdentity[] = [
  {
    sourceUserId: 1,
    email: "founder@lumex.online",
    fullName: "Founder User",
    websiteRole: "founder",
    analyticsRole: "founder"
  },
  {
    sourceUserId: 2,
    email: "ops-admin@lumex.online",
    fullName: "admin",
    websiteRole: "admin",
    analyticsRole: "admin"
  },
  {
    sourceUserId: 3,
    email: "surat-subadmin@lumex.online",
    fullName: "Surat Sub Admin",
    websiteRole: "sub_admin",
    analyticsRole: "sub_admin"
  }
];

export const policies: AnalyticsAccessPolicy[] = [
  {
    sourceUserId: 1,
    analyticsRole: "founder",
    accessMode: "full_access",
    allowGlobalTotals: true,
    allowExport: true,
    allowDrilldown: true,
    allowPurchaseVisibility: true,
    allowMemoVisibility: true,
    allowSkuAnalytics: true,
    allowManageOrganizationTargets: true,
    allowManageOwnTargets: true,
    warehouseKeys: "ALL",
    buyerKeys: "ALL",
    subAdminKeys: "ALL",
    dashboards: ["overview", "sales", "purchase", "sku_analytics", "buyers", "memos", "warehouses"],
    metricGroups: ["sales", "memo", "purchase", "financial_totals", "sku_analytics", "buyer_analytics", "warehouse_analytics"],
    filterVisibility: fullFilterVisibility,
    isActive: true
  },
  {
    sourceUserId: 2,
    analyticsRole: "admin",
    accessMode: "scoped_access",
    allowGlobalTotals: false,
    allowExport: true,
    allowDrilldown: true,
    allowPurchaseVisibility: true,
    allowMemoVisibility: true,
    allowSkuAnalytics: true,
    allowManageOrganizationTargets: true,
    allowManageOwnTargets: true,
    warehouseKeys: [101, 102],
    buyerKeys: [201, 202],
    subAdminKeys: [301, 302],
    dashboards: ["overview", "sales", "purchase", "sku_analytics", "buyers", "memos", "warehouses"],
    metricGroups: ["sales", "memo", "purchase", "financial_totals", "sku_analytics", "buyer_analytics", "warehouse_analytics"],
    filterVisibility: fullFilterVisibility,
    isActive: true
  },
  {
    sourceUserId: 3,
    analyticsRole: "sub_admin",
    accessMode: "scoped_access",
    allowGlobalTotals: false,
    allowExport: false,
    allowDrilldown: true,
    allowPurchaseVisibility: false,
    allowMemoVisibility: true,
    allowSkuAnalytics: true,
    allowManageOrganizationTargets: false,
    allowManageOwnTargets: true,
    warehouseKeys: [102],
    buyerKeys: [201, 202],
    subAdminKeys: [301],
    dashboards: ["overview", "sales", "sku_analytics", "buyers", "memos", "warehouses"],
    metricGroups: ["sales", "memo", "sku_analytics", "buyer_analytics", "warehouse_analytics"],
    filterVisibility: subAdminFilterVisibility,
    isActive: true
  }
];
