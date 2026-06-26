import fs from "node:fs";
import type {
  BuyerOption,
  ProductOption,
  SubAdminOption,
  UserIdentity,
  VendorOption,
  WarehouseOption
} from "@lumex/shared-types";

export interface LumexSourceConfig {
  mode: "files" | "api" | "mongo";
  apiBaseUrl: string;
  apiPathPrefix: string;
  apiAuthHeader: string;
  apiAuthToken: string;
  apiTimeoutMs: number;
  collectionUrlOverrides?: Record<string, string>;
  mongoUri: string;
  mongoDatabase: string;
}

const DEFAULT_CONFIG: LumexSourceConfig = {
  mode: "files",
  apiBaseUrl: "",
  apiPathPrefix: "",
  apiAuthHeader: "Authorization",
  apiAuthToken: "",
  apiTimeoutMs: 30000,
  mongoUri: "",
  mongoDatabase: "lumex"
};

let activeConfig: LumexSourceConfig = DEFAULT_CONFIG;

export function configureLumexSource(config: Partial<LumexSourceConfig>): void {
  activeConfig = { ...DEFAULT_CONFIG, ...config };
}

export function getLumexSourceConfig(): LumexSourceConfig {
  return activeConfig;
}

const DATA_PATHS = {
  buyers: "/mnt/c/Users/lumex/Downloads/lumex/lumex.buyer_master.json",
  clarities: "/mnt/c/Users/lumex/Downloads/lumex/lumex.clarity_master.json",
  colors: "/mnt/c/Users/lumex/Downloads/lumex/lumex.color_master.json",
  looseLotsMaster: "/mnt/c/Users/lumex/Downloads/lumex/lumex.loose_lots_master.json",
  looseLotsOrders: "/mnt/c/Users/lumex/Downloads/lumex/lumex.loose_lots_order_master.json",
  looseLotsPurchases: "/mnt/c/Users/lumex/Downloads/lumex/lumex.loose_lots_purchase_master.json",
  inventory: "/mnt/c/Users/lumex/Downloads/lumex/lumex.inventory_master.json",
  memos: "/mnt/c/Users/lumex/Downloads/lumex/lumex.memo_master.json",
  orders: "/mnt/c/Users/lumex/Downloads/lumex/lumex.order_master.json",
  orderReturns: "/mnt/c/Users/lumex/Downloads/lumex/lumex.order_return_master.json",
  ownShapeMaster: "/mnt/c/Users/lumex/Downloads/lumex/lumex.own_shape_master.json",
  ownShapeOrders: "/mnt/c/Users/lumex/Downloads/lumex/lumex.own_shape_order_master.json",
  shapes: "/mnt/c/Users/lumex/Downloads/lumex/lumex.shape_master.json",
  subAdmins: "/mnt/c/Users/lumex/Downloads/lumex/lumex.sub_admin_master.json",
  users: "/mnt/c/Users/lumex/Downloads/lumex/lumex.user_master.json",
  vendors: "/mnt/c/Users/lumex/Downloads/lumex/lumex.vendor_master.json",
  warehouses: "/mnt/c/Users/lumex/Downloads/lumex/lumex.warehouse_master.json",
  warehousePurchases: "/mnt/c/Users/lumex/Downloads/lumex/lumex.warehouse_purchase_master.json"
} as const;

const OPTIONAL_DATA_PATHS = {
  orderReturns: [
    DATA_PATHS.orderReturns,
    "/mnt/c/Users/lumex/Documents/Analytics/analytics_minimal/dataset_schema_sample/lumex.order_return_master.json"
  ],
  users: [
    DATA_PATHS.users,
    "/mnt/c/Users/lumex/Documents/Analytics/analytics_minimal/dataset_schema_sample/lumex.user_master.json"
  ]
} as const;

export interface LumexAnalyticsRow {
  id: string;
  documentId: string;
  date: string;
  warehouseKey: number | null;
  buyerKey: number | null;
  subAdminKey: number | null;
  subAdminKeys: number[];
  vendorKey: number | null;
  productKey: number;
  salesValue: number;
  purchaseValue: number;
  revenueCostValue: number;
  memoGivenValue: number;
  memoConvertedValue: number;
  quantity: number;
  productType: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  stockNumber: string;
  qcStatus: string;
  status: string;
  sourceType: "sales" | "purchase" | "memo";
  orderedUnits?: number;
  fulfilledUnits?: number;
}

export interface LumexInventoryRow {
  id: string;
  createdAt: string;
  warehouseKey: number | null;
  vendorKey: number | null;
  stockNumber: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  inStock: boolean;
  isVerify: boolean;
  hold: boolean;
}

export interface LumexSalesDocument {
  documentId: string;
  totalValue: number;
  taxValue: number;
  vatValue: number;
}

export interface LumexReturnRow {
  id: string;
  documentId: string;
  date: string;
  warehouseKey: number | null;
  buyerKey: number | null;
  subAdminKey: number | null;
  subAdminKeys: number[];
  vendorKey: number | null;
  productKey: number;
  returnValue: number;
  quantity: number;
  productType: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  stockNumber: string;
  qcStatus: string;
  reason: string;
  refundMethod: string;
  returnType: string;
}

export interface LumexReturnDocument {
  documentId: string;
  date: string;
  warehouseKey: number | null;
  buyerKey: number | null;
  totalValue: number;
  quantity: number;
  reason: string;
  refundMethod: string;
  returnType: string;
}

export interface LumexDataset {
  adminUsers: UserIdentity[];
  warehouses: WarehouseOption[];
  buyers: BuyerOption[];
  buyerMasterCount: number;
  verifiedBuyerMasterCount: number;
  verifiedBuyerKeys: number[];
  vendors: VendorOption[];
  vendorMasterCount: number;
  verifiedVendorMasterCount: number;
  verifiedVendorKeys: number[];
  hasUserVerificationData: boolean;
  subAdmins: SubAdminOption[];
  subAdminUsers: UserIdentity[];
  products: ProductOption[];
  rows: LumexAnalyticsRow[];
  inventory: LumexInventoryRow[];
  salesDocuments: LumexSalesDocument[];
  returnRows: LumexReturnRow[];
  returnDocuments: LumexReturnDocument[];
  minDate: string;
  maxDate: string;
}

type RawDocument = Record<string, unknown>;
type CollectionKey = keyof typeof DATA_PATHS;

interface LumexRawCollections {
  buyers: RawDocument[];
  clarities: RawDocument[];
  colors: RawDocument[];
  looseLotsMaster: RawDocument[];
  looseLotsOrders: RawDocument[];
  looseLotsPurchases: RawDocument[];
  inventory: RawDocument[];
  memos: RawDocument[];
  orders: RawDocument[];
  orderReturns: RawDocument[];
  ownShapeMaster: RawDocument[];
  ownShapeOrders: RawDocument[];
  shapes: RawDocument[];
  subAdmins: RawDocument[];
  users: RawDocument[];
  vendors: RawDocument[];
  warehouses: RawDocument[];
  warehousePurchases: RawDocument[];
}

let cachedDataset: LumexDataset | null = null;
let datasetLoadingPromise: Promise<LumexDataset> | null = null;

function readJsonFile<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, "utf8")) as T;
}

function readFirstExistingJsonFile<T>(paths: readonly string[], fallback: T): T {
  for (const path of paths) {
    if (fs.existsSync(path)) {
      return readJsonFile<T>(path);
    }
  }

  return fallback;
}

function toEnvKey(collectionKey: CollectionKey) {
  return collectionKey.replace(/[A-Z]/g, (character) => `_${character}`).toUpperCase();
}

function buildCollectionApiUrl(collectionKey: CollectionKey) {
  const directUrl =
    activeConfig.collectionUrlOverrides?.[collectionKey]?.trim() ||
    process.env[`LUMEX_API_URL_${toEnvKey(collectionKey)}`]?.trim();
  if (directUrl) {
    return directUrl;
  }

  if (!activeConfig.apiBaseUrl) {
    throw new Error(
      `apiBaseUrl is required when mode=api. Missing URL for collection "${collectionKey}".`
    );
  }

  const normalizedBase = activeConfig.apiBaseUrl.replace(/\/+$/, "");
  const normalizedPrefix = activeConfig.apiPathPrefix
    ? `/${activeConfig.apiPathPrefix.replace(/^\/+|\/+$/g, "")}`
    : "";

  return `${normalizedBase}${normalizedPrefix}/${collectionKey}`;
}

async function fetchJsonFile<T>(url: string, optional: boolean) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), activeConfig.apiTimeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (activeConfig.apiAuthToken) {
      headers[activeConfig.apiAuthHeader] = activeConfig.apiAuthToken;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    if (optional && response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} ${response.statusText}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRawCollectionsFromApi(): Promise<LumexRawCollections> {
  const [
    buyers,
    clarities,
    colors,
    looseLotsMaster,
    looseLotsOrders,
    looseLotsPurchases,
    inventory,
    memos,
    orders,
    orderReturns,
    ownShapeMaster,
    ownShapeOrders,
    shapes,
    subAdmins,
    users,
    vendors,
    warehouses,
    warehousePurchases
  ] = await Promise.all([
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("buyers"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("clarities"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("colors"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("looseLotsMaster"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("looseLotsOrders"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("looseLotsPurchases"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("inventory"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("memos"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("orders"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("orderReturns"), true),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("ownShapeMaster"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("ownShapeOrders"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("shapes"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("subAdmins"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("users"), true),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("vendors"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("warehouses"), false),
    fetchJsonFile<RawDocument[]>(buildCollectionApiUrl("warehousePurchases"), false)
  ]);

  return {
    buyers: buyers ?? [],
    clarities: clarities ?? [],
    colors: colors ?? [],
    looseLotsMaster: looseLotsMaster ?? [],
    looseLotsOrders: looseLotsOrders ?? [],
    looseLotsPurchases: looseLotsPurchases ?? [],
    inventory: inventory ?? [],
    memos: memos ?? [],
    orders: orders ?? [],
    orderReturns: orderReturns ?? [],
    ownShapeMaster: ownShapeMaster ?? [],
    ownShapeOrders: ownShapeOrders ?? [],
    shapes: shapes ?? [],
    subAdmins: subAdmins ?? [],
    users: users ?? [],
    vendors: vendors ?? [],
    warehouses: warehouses ?? [],
    warehousePurchases: warehousePurchases ?? []
  };
}

const MONGO_COLLECTIONS: Record<CollectionKey, string> = {
  buyers: "buyer_master",
  clarities: "clarity_master",
  colors: "color_master",
  looseLotsMaster: "loose_lots_master",
  looseLotsOrders: "loose_lots_order_master",
  looseLotsPurchases: "loose_lots_purchase_master",
  inventory: "inventory_master",
  memos: "memo_master",
  orders: "order_master",
  orderReturns: "order_return_master",
  ownShapeMaster: "own_shape_master",
  ownShapeOrders: "own_shape_order_master",
  shapes: "shape_master",
  subAdmins: "sub_admin_master",
  users: "user_master",
  vendors: "vendor_master",
  warehouses: "warehouse_master",
  warehousePurchases: "warehouse_purchase_master"
};

async function loadRawCollectionsFromMongo(): Promise<LumexRawCollections> {
  if (!activeConfig.mongoUri) {
    throw new Error("mongoUri is required when mode=mongo");
  }
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(activeConfig.mongoUri);
  await client.connect();
  try {
    const db = client.db(activeConfig.mongoDatabase);
    const keys = Object.keys(MONGO_COLLECTIONS) as CollectionKey[];
    const results = await Promise.all(
      keys.map(async (key) => {
        const documents = await db
          .collection(MONGO_COLLECTIONS[key])
          .find({})
          .toArray();
        return [key, documents as unknown as RawDocument[]] as const;
      })
    );
    const collections = Object.fromEntries(results) as Record<CollectionKey, RawDocument[]>;
    return {
      buyers: collections.buyers ?? [],
      clarities: collections.clarities ?? [],
      colors: collections.colors ?? [],
      looseLotsMaster: collections.looseLotsMaster ?? [],
      looseLotsOrders: collections.looseLotsOrders ?? [],
      looseLotsPurchases: collections.looseLotsPurchases ?? [],
      inventory: collections.inventory ?? [],
      memos: collections.memos ?? [],
      orders: collections.orders ?? [],
      orderReturns: collections.orderReturns ?? [],
      ownShapeMaster: collections.ownShapeMaster ?? [],
      ownShapeOrders: collections.ownShapeOrders ?? [],
      shapes: collections.shapes ?? [],
      subAdmins: collections.subAdmins ?? [],
      users: collections.users ?? [],
      vendors: collections.vendors ?? [],
      warehouses: collections.warehouses ?? [],
      warehousePurchases: collections.warehousePurchases ?? []
    };
  } finally {
    await client.close();
  }
}

function loadRawCollectionsFromFiles(): LumexRawCollections {
  return {
    buyers: readJsonFile<RawDocument[]>(DATA_PATHS.buyers),
    clarities: readJsonFile<RawDocument[]>(DATA_PATHS.clarities),
    colors: readJsonFile<RawDocument[]>(DATA_PATHS.colors),
    looseLotsMaster: readJsonFile<RawDocument[]>(DATA_PATHS.looseLotsMaster),
    looseLotsOrders: readJsonFile<RawDocument[]>(DATA_PATHS.looseLotsOrders),
    looseLotsPurchases: readJsonFile<RawDocument[]>(DATA_PATHS.looseLotsPurchases),
    inventory: readJsonFile<RawDocument[]>(DATA_PATHS.inventory),
    memos: readJsonFile<RawDocument[]>(DATA_PATHS.memos),
    orders: readJsonFile<RawDocument[]>(DATA_PATHS.orders),
    orderReturns: readFirstExistingJsonFile<RawDocument[]>(OPTIONAL_DATA_PATHS.orderReturns, []),
    ownShapeMaster: readJsonFile<RawDocument[]>(DATA_PATHS.ownShapeMaster),
    ownShapeOrders: readJsonFile<RawDocument[]>(DATA_PATHS.ownShapeOrders),
    shapes: readJsonFile<RawDocument[]>(DATA_PATHS.shapes),
    subAdmins: readJsonFile<RawDocument[]>(DATA_PATHS.subAdmins),
    users: readFirstExistingJsonFile<RawDocument[]>(OPTIONAL_DATA_PATHS.users, []),
    vendors: readJsonFile<RawDocument[]>(DATA_PATHS.vendors),
    warehouses: readJsonFile<RawDocument[]>(DATA_PATHS.warehouses),
    warehousePurchases: readJsonFile<RawDocument[]>(DATA_PATHS.warehousePurchases)
  };
}

async function loadRawCollections(): Promise<LumexRawCollections> {
  if (activeConfig.mode === "mongo") {
    try {
      return await loadRawCollectionsFromMongo();
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[lumex.data] Falling back to local files because the Lumex MongoDB is unavailable: ${message}`
      );
      return loadRawCollectionsFromFiles();
    }
  }

  if (activeConfig.mode === "api") {
    try {
      return await loadRawCollectionsFromApi();
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[lumex.data] Falling back to local files because the Lumex source API is unavailable: ${message}`
      );
      return loadRawCollectionsFromFiles();
    }
  }

  return loadRawCollectionsFromFiles();
}

function getOid(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if ("$oid" in obj) {
      const oidValue = obj.$oid;
      return typeof oidValue === "string" ? oidValue : null;
    }

    const toHex = (obj as { toHexString?: () => string }).toHexString;
    if (typeof toHex === "function") {
      try {
        const hex = toHex.call(obj);
        if (typeof hex === "string" && /^[a-f0-9]{24}$/i.test(hex)) {
          return hex;
        }
      } catch {
        // fall through
      }
    }

    const str = (obj as { toString?: () => string }).toString;
    if (typeof str === "function") {
      const candidate = str.call(obj);
      if (typeof candidate === "string" && /^[a-f0-9]{24}$/i.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getDateOnly(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if ("$date" in obj) {
      const dateValue = obj.$date;
      if (typeof dateValue === "string") {
        return dateValue.slice(0, 10);
      }
      if (typeof dateValue === "object" && dateValue && "$numberLong" in (dateValue as Record<string, unknown>)) {
        const ms = Number((dateValue as { $numberLong?: unknown }).$numberLong);
        if (Number.isFinite(ms)) {
          return new Date(ms).toISOString().slice(0, 10);
        }
      }
      if (typeof dateValue === "number" && Number.isFinite(dateValue)) {
        return new Date(dateValue).toISOString().slice(0, 10);
      }
    }
  }

  return null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function shortCode(raw: string, prefix: string) {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;
}

function normalizeOid(raw: string) {
  return raw.trim().toLowerCase();
}

function looksLikeObjectId(raw: string) {
  return /^[a-f0-9]{24}$/i.test(raw.trim());
}

function normalizeAttributeLabel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWarehouseRef(value: unknown): string | null {
  const oid = getOid(value);
  if (oid) {
    return oid;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }

  return null;
}

function normalizeWarehouseAlias(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function mappedWarehouseAlias(value: unknown): string | null {
  const alias = normalizeWarehouseAlias(value);
  if (!alias) {
    return null;
  }

  const mapped: Record<string, string> = {
    ldspl: "mumbai",
    "dubai ld": "dubai",
    ld: "dubai",
    "dubai ldd": "dubai",
    ldd: "dubai",
    "dubai lo": "dubai lo",
    lo: "dubai lo"
  };

  return mapped[alias] ?? alias;
}

function displayWarehouseName(rawRef: string) {
  if (/^[a-z]+$/i.test(rawRef)) {
    return rawRef.toUpperCase();
  }

  return `WH ${rawRef.slice(0, 6).toUpperCase()}`;
}

function displayVendorName(row: RawDocument) {
  const companyName = typeof row.company_name === "string" ? row.company_name.trim() : "";
  const firstname = typeof row.firstname === "string" ? row.firstname.trim() : "";
  const lastname = typeof row.lastname === "string" ? row.lastname.trim() : "";
  return companyName || [firstname, lastname].filter(Boolean).join(" ") || "Unknown Vendor";
}

function shapeLabel(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const mapped: Record<string, string> = {
    RD: "ROUND",
    OV: "OVAL",
    MQ: "MARQUISE",
    PS: "PEAR",
    EM: "EMERALD",
    PR: "PRINCESS",
    CU: "CUSHION"
  };

  return mapped[raw] ?? (raw || "UNKNOWN");
}

const SIZE_BUCKETS: Array<[number, number, string]> = [
  [0.30, 0.36, "0.30:0.36"],
  [0.37, 0.39, "0.37:0.39"],
  [0.40, 0.45, "0.40:0.45"],
  [0.46, 0.59, "0.46:0.59"],
  [0.60, 0.69, "0.60:0.69"],
  [0.70, 0.79, "0.70:0.79"],
  [0.80, 0.89, "0.80:0.89"],
  [0.90, 0.95, "0.90:0.95"],
  [0.96, 0.99, "0.96:0.99"],
  [1.00, 1.19, "1.00:1.19"],
  [1.20, 1.45, "1.20:1.45"],
  [1.46, 1.49, "1.46:1.49"],
  [1.50, 1.69, "1.50:1.69"],
  [1.70, 1.95, "1.70:1.95"],
  [1.96, 1.99, "1.96:1.99"],
  [2.00, 2.49, "2.00:2.49"],
  [2.50, 2.99, "2.50:2.99"],
  [3.00, 3.49, "3.00:3.49"],
  [3.50, 3.99, "3.50:3.99"],
  [4.00, 4.49, "4.00:4.49"],
  [4.50, 4.99, "4.50:4.99"],
  [5.00, 5.49, "5.00:5.49"],
  [5.50, 5.99, "5.50:5.99"],
  [6.00, 6.49, "6.00:6.49"],
  [6.50, 6.99, "6.50:6.99"],
  [7.00, 7.49, "7.00:7.49"],
  [7.50, 7.99, "7.50:7.99"],
  [8.00, 8.49, "8.00:8.49"],
  [8.50, 8.99, "8.50:8.99"],
  [9.00, 9.49, "9.00:9.49"],
  [9.50, 9.99, "9.50:9.99"],
  [10.00, 20.00, "10.00:20.00"]
];

function sizeBucketLabel(value: unknown) {
  const numeric = asNumber(value);
  if (numeric <= 0) {
    return "Unknown";
  }

  for (const [min, max, label] of SIZE_BUCKETS) {
    if (numeric >= min && numeric <= max) {
      return label;
    }
  }

  return numeric.toFixed(2);
}

function displayNameFromBuyer(row: RawDocument) {
  const companyName = typeof row.company_name === "string" ? row.company_name.trim() : "";
  const firstname = typeof row.firstname === "string" ? row.firstname.trim() : "";
  const lastname = typeof row.lastname === "string" ? row.lastname.trim() : "";
  return companyName || [firstname, lastname].filter(Boolean).join(" ") || "Unknown Buyer";
}

function buyerLocation(row: RawDocument) {
  const delivery = Array.isArray(row.delivery_address) ? row.delivery_address : [];
  const preferred = delivery.find((entry) => {
    const status = typeof (entry as RawDocument).status === "string" ? (entry as RawDocument).status : "";
    return status === "Default" || status === "Approved";
  }) as RawDocument | undefined;
  const chosen = preferred ?? (delivery[0] as RawDocument | undefined);
  const city = typeof chosen?.city === "string" ? chosen.city.trim() : "";
  const country = typeof chosen?.country === "string" ? chosen.country.trim() : "";

  return city || country || "Unknown";
}

function buyerCountry(row: RawDocument) {
  const delivery = Array.isArray(row.delivery_address) ? row.delivery_address : [];
  const preferred = delivery.find((entry) => {
    const status = typeof (entry as RawDocument).status === "string" ? (entry as RawDocument).status : "";
    return status === "Default" || status === "Approved";
  }) as RawDocument | undefined;
  const chosen = preferred ?? (delivery[0] as RawDocument | undefined);
  const country = typeof chosen?.country === "string" ? chosen.country.trim() : "";
  return country || "Unknown";
}

function normalizeUserRole(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sortUsersByCreatedAt(left: RawDocument, right: RawDocument) {
  const leftDate = typeof left.createdAt === "object" && left.createdAt !== null
    ? String((left.createdAt as { $date?: unknown }).$date ?? "")
    : typeof left.createdAt === "string"
      ? left.createdAt
      : "";
  const rightDate = typeof right.createdAt === "object" && right.createdAt !== null
    ? String((right.createdAt as { $date?: unknown }).$date ?? "")
    : typeof right.createdAt === "string"
      ? right.createdAt
      : "";

  return leftDate.localeCompare(rightDate);
}

function isVerifiedUser(row: RawDocument) {
  return row.is_verified === true;
}

function buildVerifiedEntityIdSet(rawUsers: RawDocument[], role: "buyer" | "vendor") {
  return new Set(
    rawUsers
      .filter((user) => normalizeUserRole(user.role) === role && isVerifiedUser(user))
      .map((user) => getOid(user.id))
      .filter((value): value is string => Boolean(value))
  );
}

function ensureArray(value: unknown): RawDocument[] {
  return Array.isArray(value) ? (value as RawDocument[]) : [];
}

function isCombinedOrder(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    return Boolean((value as RawDocument).is_combine);
  }

  return false;
}

function normalizeOrderStatus(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function hasOrderStatus(statusList: unknown, statuses: readonly string[]) {
  const expected = new Set(statuses.map((status) => normalizeOrderStatus(status)));

  return ensureArray(statusList).some((entry) => {
    const row = entry as RawDocument;
    const status = normalizeOrderStatus(row.order_status ?? row.status ?? row.name ?? entry);
    return expected.has(status);
  });
}

function hasCanceledStatus(statusList: unknown) {
  return hasOrderStatus(statusList, ["order canceled", "order cancelled"]);
}

// Statuses that count an order as a realized sale (shipped/delivered to the buyer).
// Internal warehouse-transfer statuses (e.g. "ldspl to ld delivered") are intentionally excluded.
const FULFILLED_ORDER_STATUSES = new Set([
  "order shipped",
  "order out for delivery",
  "order delivered"
]);

// True when an order has reached a shipped/delivered stage at any point in its status history.
// For combined orders this reads the combined order_master's own status_list, which is the
// source of truth for the goods' fulfilment.
function reachedShippedOrDelivered(statusList: unknown) {
  return hasOrderStatus(statusList, [...FULFILLED_ORDER_STATUSES]);
}

function stockLookupCandidates(value: RawDocument) {
  return [
    value.Stock_No,
    value.Certificate_No,
    value.lotid,
    value.item_no
  ]
    .map((entry) => String(entry ?? "").trim())
    .filter((entry, index, array) => entry.length > 0 && array.indexOf(entry) === index);
}

function negotiatedPricePerCarat(
  basePrice: unknown,
  negotiatedPrice: unknown,
  negotiatedPercentage: unknown
) {
  const base = asNumber(basePrice);
  const percentage = asNumber(negotiatedPercentage);

  if (percentage !== 0) {
    return Number((base - (base * percentage) / 100).toFixed(2));
  }

  const negotiated = asNumber(negotiatedPrice);
  if (negotiated > 0) {
    return negotiated;
  }

  return base;
}

function normalizeRef(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildLumexDataset(rawCollections: LumexRawCollections): LumexDataset {
  const {
    buyers: rawBuyers,
    clarities: rawClarities,
    colors: rawColors,
    looseLotsMaster: rawLooseLotsMaster,
    looseLotsOrders: rawLooseLotsOrders,
    looseLotsPurchases: rawLooseLotsPurchases,
    inventory: rawInventory,
    memos: rawMemos,
    orders: rawOrders,
    orderReturns: rawOrderReturns,
    ownShapeMaster: rawOwnShapeMaster,
    ownShapeOrders: rawOwnShapeOrders,
    shapes: rawShapes,
    subAdmins: rawSubAdmins,
    users: rawUsers,
    vendors: rawVendors,
    warehouses: rawWarehouses,
    warehousePurchases: rawWarehousePurchases
  } = rawCollections;

  const buyerIds = new Set<string>();
  const vendorIds = new Set<string>();

  for (const buyer of rawBuyers) {
    buyerIds.add(getOid(buyer._id) ?? "");
  }

  for (const row of rawLooseLotsMaster) {
    const buyerId = getOid(row.buyer_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }
  }

  for (const row of rawOwnShapeMaster) {
    const buyerId = getOid(row.buyer_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }
  }

  for (const row of rawMemos) {
    const buyerId = getOid(row.buyer_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }
  }

  for (const row of rawLooseLotsPurchases) {
    const vendorId = getOid(row.vendorID);
    if (vendorId) {
      vendorIds.add(vendorId);
    }
  }

  for (const row of rawWarehousePurchases) {
    for (const product of ensureArray(row.products)) {
      const vendorId = getOid(product.vendorID);
      if (vendorId) {
        vendorIds.add(vendorId);
      }
    }
  }

  for (const row of rawOrders) {
    const buyerId = getOid(row.user_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }

    for (const product of orderProducts(row)) {
      const vendorId = getOid(product.vendorID);
      if (vendorId) {
        vendorIds.add(vendorId);
      }
    }
  }

  for (const row of rawOrderReturns) {
    const buyerId = getOid(row.user_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }

    for (const product of ensureArray(row.products)) {
      const vendorId = getOid(product.vendorID);
      if (vendorId) {
        vendorIds.add(vendorId);
      }
    }
  }

  for (const row of rawLooseLotsOrders) {
    const buyerId = getOid(row.buyer_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }
  }

  for (const row of rawOwnShapeOrders) {
    const buyerId = getOid(row.buyer_id);
    if (buyerId) {
      buyerIds.add(buyerId);
    }
  }

  for (const row of rawMemos) {
    for (const product of ensureArray(row.products)) {
      const vendorId = getOid(product.vendorID);
      if (vendorId) {
        vendorIds.add(vendorId);
      }
    }
  }

  for (const row of rawInventory) {
    const vendorId = getOid(row.vendorID);
    if (vendorId) {
      vendorIds.add(vendorId);
    }
  }
  const canonicalWarehouses = rawWarehouses
    .map((warehouse) => {
      const rawId = getOid(warehouse._id);
      if (!rawId) {
        return null;
      }

      return {
        rawId,
        name:
          typeof warehouse.warehouse_name === "string" && warehouse.warehouse_name.trim().length > 0
            ? warehouse.warehouse_name.trim()
            : displayWarehouseName(rawId),
        city: normalizeWarehouseAlias(warehouse.city),
        aliases: [
          rawId,
          normalizeWarehouseAlias(warehouse.warehouse_name),
          normalizeWarehouseAlias(warehouse.city),
          ...ensureArray(warehouse.optional_value).map((value) => normalizeWarehouseAlias(value)).filter((value): value is string => Boolean(value))
        ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
      };
    })
    .filter((value): value is { rawId: string; name: string; city: string | null; aliases: string[] } => Boolean(value));
  const warehouseKeyByRawId = new Map(canonicalWarehouses.map((warehouse, index) => [warehouse.rawId, 101 + index]));
  const warehouseKeyByAlias = new Map<string, number>();

  for (const warehouse of canonicalWarehouses) {
    const warehouseKey = warehouseKeyByRawId.get(warehouse.rawId);
    if (warehouseKey === undefined) {
      continue;
    }

    for (const alias of warehouse.aliases) {
      warehouseKeyByAlias.set(alias, warehouseKey);
    }
  }

  const warehouses: WarehouseOption[] = canonicalWarehouses.map((warehouse, index) => ({
    key: 101 + index,
    sourceWarehouseId: warehouse.rawId,
    code: shortCode(warehouse.rawId, "WH"),
    name: warehouse.name
  }));

  function resolveWarehouseKey(value: unknown): number | null {
    const rawWarehouseRef = normalizeWarehouseRef(value);
    if (!rawWarehouseRef) {
      return null;
    }

    return warehouseKeyByAlias.get(mappedWarehouseAlias(rawWarehouseRef) ?? rawWarehouseRef) ?? null;
  }

  const subAdminRawIds = rawSubAdmins
    .map((subAdmin) => getOid(subAdmin._id))
    .filter((value): value is string => Boolean(value));
  const subAdminKeyByRaw = new Map(subAdminRawIds.sort().map((rawId, index) => [rawId, 301 + index]));
  const rawUsersByEntityId = new Map(
    rawUsers
      .map((user) => {
        const entityId = getOid(user.id);
        return entityId ? [entityId, user] as const : null;
      })
      .filter((entry): entry is readonly [string, RawDocument] => Boolean(entry))
  );
  const adminUsers: UserIdentity[] = rawUsers
    .filter((user) => {
      const role = normalizeUserRole(user.role);
      return role === "super_admin" || role === "admin";
    })
    .sort(sortUsersByCreatedAt)
    .map((user, index): UserIdentity | null => {
      const websiteUserId = getOid(user._id);
      const email = typeof user.email === "string" ? user.email.trim() : "";
      if (!websiteUserId || !email) {
        return null;
      }

      return {
        sourceUserId: index + 1,
        websiteUserId,
        email,
        fullName: email.split("@")[0] || `Admin ${index + 1}`,
        websiteRole: normalizeUserRole(user.role) || "super_admin",
        analyticsRole: index === 0 ? "founder" : "admin"
      };
    })
    .filter((value): value is UserIdentity => value !== null);
  const subAdmins: SubAdminOption[] = rawSubAdmins.flatMap((subAdmin) => {
      const rawId = getOid(subAdmin._id);
      if (!rawId) {
        return [];
      }

      const username = typeof subAdmin.username === "string" ? subAdmin.username.trim() : "";
      const firstname = typeof subAdmin.firstname === "string" ? subAdmin.firstname.trim() : "";
      const lastname = typeof subAdmin.lastname === "string" ? subAdmin.lastname.trim() : "";

      return [{
        key: subAdminKeyByRaw.get(rawId) ?? 0,
        sourceSubAdminId: rawId,
        code: username || shortCode(rawId, "SA"),
        name: [firstname, lastname].filter(Boolean).join(" ") || username || shortCode(rawId, "SA")
      }];
    });
  const subAdminUsers: UserIdentity[] = rawSubAdmins
    .map((subAdmin): UserIdentity | null => {
      const rawId = getOid(subAdmin._id);
      if (!rawId) {
        return null;
      }

      const sourceUserId = subAdminKeyByRaw.get(rawId);
      if (!sourceUserId) {
        return null;
      }

      const username = typeof subAdmin.username === "string" ? subAdmin.username.trim() : "";
      const firstname = typeof subAdmin.firstname === "string" ? subAdmin.firstname.trim() : "";
      const lastname = typeof subAdmin.lastname === "string" ? subAdmin.lastname.trim() : "";
      const email = typeof subAdmin.email === "string" ? subAdmin.email.trim() : "";
      const fullName = [firstname, lastname].filter(Boolean).join(" ") || username || shortCode(rawId, "SA");
      const matchingUser = rawUsersByEntityId.get(rawId);
      const websiteUserId = getOid(matchingUser?._id);

      return {
        sourceUserId,
        websiteUserId: websiteUserId ?? undefined,
        email: email || `${username || "subadmin"}@lumex.online`,
        fullName,
        websiteRole: "sub_admin",
        analyticsRole: "sub_admin"
      };
    })
    .filter((value): value is UserIdentity => value !== null);

  const buyersByRaw = new Map(rawBuyers.map((buyer) => [getOid(buyer._id) ?? "", buyer]));
  const buyerRefList = [...buyerIds].filter(Boolean).sort();
  const buyerKeyByRaw = new Map(buyerRefList.map((ref, index) => [ref, 201 + index]));
  const verifiedBuyerRawIds = buildVerifiedEntityIdSet(rawUsers, "buyer");
  const buyerMasterCount = rawBuyers.filter((buyer) => Boolean(getOid(buyer._id))).length;
  const verifiedBuyerKeys = rawBuyers
    .filter((buyer) => {
      const buyerRawId = getOid(buyer._id);
      return Boolean(buyerRawId) && verifiedBuyerRawIds.has(buyerRawId ?? "");
    })
    .map((buyer) => buyerKeyByRaw.get(getOid(buyer._id) ?? ""))
    .filter((buyerKey): buyerKey is number => typeof buyerKey === "number");
  const verifiedBuyerMasterCount = verifiedBuyerKeys.length;
  const buyers: BuyerOption[] = buyerRefList.map((rawId) => {
    const buyer = buyersByRaw.get(rawId);
    const warehouseKeys = buyer
      ? ensureArray((buyer.settings as RawDocument | undefined)?.warehouse)
          .map((warehouse) => resolveWarehouseKey((warehouse as RawDocument).id))
          .filter((value): value is number => typeof value === "number")
      : [];

    return {
      key: buyerKeyByRaw.get(rawId) ?? 0,
      sourceBuyerId: rawId,
      code: shortCode(rawId, "BYR"),
      name: buyer ? displayNameFromBuyer(buyer) : `Buyer ${rawId.slice(0, 8).toUpperCase()}`,
      location: buyer ? buyerLocation(buyer) : "Unknown",
      country: buyer ? buyerCountry(buyer) : "Unknown",
      isVerified: verifiedBuyerRawIds.has(rawId),
      warehouseKeys
    };
  });

  const vendorsByRaw = new Map(rawVendors.map((vendor) => [getOid(vendor._id) ?? "", vendor]));
  const vendorRefList = [...vendorIds].filter(Boolean).sort();
  const vendorKeyByRaw = new Map(vendorRefList.map((ref, index) => [ref, 501 + index]));
  const verifiedVendorRawIds = buildVerifiedEntityIdSet(rawUsers, "vendor");
  const vendorMasterCount = rawVendors.filter((vendor) => Boolean(getOid(vendor._id))).length;
  const verifiedVendorKeys = rawVendors
    .filter((vendor) => {
      const vendorRawId = getOid(vendor._id);
      return Boolean(vendorRawId) && verifiedVendorRawIds.has(vendorRawId ?? "");
    })
    .map((vendor) => vendorKeyByRaw.get(getOid(vendor._id) ?? ""))
    .filter((vendorKey): vendorKey is number => typeof vendorKey === "number");
  const verifiedVendorMasterCount = verifiedVendorKeys.length;
  const vendors: VendorOption[] = vendorRefList.map((rawId) => {
    const vendor = vendorsByRaw.get(rawId);
    const country = typeof vendor?.country === "string" ? vendor.country.trim() : "Unknown";

    return {
      key: vendorKeyByRaw.get(rawId) ?? 0,
      code: shortCode(rawId, "VDR"),
      name: vendor ? displayVendorName(vendor) : `Vendor ${rawId.slice(0, 8).toUpperCase()}`,
      country: country || "Unknown",
      isVerified: verifiedVendorRawIds.has(rawId)
    };
  });

  function buildAttributeLookup(rows: RawDocument[], fieldName: string, prefix: string) {
    return new Map(
      rows
        .map((row) => {
          const rawId = getOid(row._id);
          if (!rawId) {
            return null;
          }

          const primaryLabel = normalizeAttributeLabel(row[fieldName]);
          const optionalLabel = ensureArray(row.optional_value)
            .map((entry) => normalizeAttributeLabel(entry))
            .find((value): value is string => Boolean(value));

          return [
            normalizeOid(rawId),
            primaryLabel ?? optionalLabel ?? shortCode(rawId, prefix)
          ] as const;
        })
        .filter((entry): entry is readonly [string, string] => Boolean(entry))
    );
  }

  const colorByRawId = buildAttributeLookup(rawColors, "color", "CLR");
  const clarityByRawId = buildAttributeLookup(rawClarities, "clarity", "CLA");
  const shapeByAlias = new Map<string, string>();

  for (const row of rawShapes) {
    const canonicalShape =
      normalizeAttributeLabel(row.shape_name) ??
      normalizeAttributeLabel(row.shape_code);

    if (!canonicalShape) {
      continue;
    }

    const aliases = [
      row.shape_code,
      row.shape_name,
      ...ensureArray(row.optional_value)
    ]
      .map((entry) => normalizeAttributeLabel(entry))
      .filter((value): value is string => Boolean(value));

    for (const alias of aliases) {
      shapeByAlias.set(alias, canonicalShape);
    }
  }

  function resolveAttribute(value: unknown, lookup: Map<string, string>, prefix: string) {
    const rawId = getOid(value);
    if (rawId) {
      const fromLookup = lookup.get(normalizeOid(rawId));
      if (fromLookup) {
        return fromLookup;
      }

      const normalizedRaw = normalizeAttributeLabel(rawId);
      if (normalizedRaw && !looksLikeObjectId(rawId)) {
        return normalizedRaw;
      }

      return shortCode(rawId, prefix);
    }

    return normalizeAttributeLabel(value) ?? "Unknown";
  }

  function resolveShape(value: unknown) {
    const normalized = normalizeAttributeLabel(value);
    if (!normalized) {
      return "UNKNOWN";
    }

    return shapeByAlias.get(normalized) ?? shapeLabel(normalized);
  }

  const primarySubAdminByBuyerKey = new Map<number, number | null>();
  const allSubAdminsByBuyerKey = new Map<number, number[]>();

  for (const buyer of rawBuyers) {
    const buyerRawId = getOid(buyer._id);
    if (!buyerRawId) {
      continue;
    }

    const buyerKey = buyerKeyByRaw.get(buyerRawId);
    if (!buyerKey) {
      continue;
    }

    const assigned = ensureArray(buyer.assign_sub_admin_id)
      .map((entry) => getOid(entry))
      .filter((value): value is string => Boolean(value))
      .map((rawId) => subAdminKeyByRaw.get(rawId))
      .filter((value): value is number => typeof value === "number");

    primarySubAdminByBuyerKey.set(buyerKey, assigned[0] ?? null);
    allSubAdminsByBuyerKey.set(buyerKey, assigned);
  }

  const productRegistry = new Map<string, ProductOption>();
  const products: ProductOption[] = [];
  const rows: LumexAnalyticsRow[] = [];
  const inventory: LumexInventoryRow[] = [];
  const salesDocuments: LumexSalesDocument[] = [];
  const returnRows: LumexReturnRow[] = [];
  const returnDocuments: LumexReturnDocument[] = [];

  function ensureProduct(input: {
    sku: string;
    shape: string;
    size: string;
    color: string;
    clarity: string;
    productType: string;
  }) {
    const signature = [
      input.productType,
      input.sku,
      input.shape,
      input.size,
      input.color,
      input.clarity
    ].join("|");

    const existing = productRegistry.get(signature);
    if (existing) {
      return existing;
    }

    const product: ProductOption = {
      key: 401 + products.length,
      sku: input.sku,
      name: `${input.shape} ${input.size} ${input.color} ${input.clarity}`.replace(/\s+/g, " ").trim(),
      shape: input.shape,
      size: input.size,
      color: input.color,
      clarity: input.clarity
    };

    products.push(product);
    productRegistry.set(signature, product);
    return product;
  }

  const looseLotsById = new Map(
    rawLooseLotsMaster.map((row) => [getOid(row._id) ?? "", row])
  );
  const ownShapeById = new Map(
    rawOwnShapeMaster.map((row) => [getOid(row._id) ?? "", row])
  );
  const inventoryVendorPriceByStockRef = new Map<string, number>();
  const inventoryWarehouseKeyByStockRef = new Map<string, number>();

  for (const stock of rawInventory) {
    const vendorPrice = asNumber(stock.vendor_price);
    const warehouseKey = resolveWarehouseKey(stock.warehouse_id);
    if (vendorPrice <= 0) {
      if (warehouseKey === null) {
        continue;
      }
    }

    for (const stockRef of stockLookupCandidates(stock)) {
      if (vendorPrice > 0) {
        inventoryVendorPriceByStockRef.set(stockRef, vendorPrice);
      }

      if (warehouseKey !== null) {
        inventoryWarehouseKeyByStockRef.set(stockRef, warehouseKey);
      }
    }
  }

  function subAdminBundle(buyerKey: number | null) {
    if (!buyerKey) {
      return { primary: null, all: [] as number[] };
    }

    return {
      primary: primarySubAdminByBuyerKey.get(buyerKey) ?? null,
      all: allSubAdminsByBuyerKey.get(buyerKey) ?? []
    };
  }

  function pushRow(row: Omit<LumexAnalyticsRow, "subAdminKey" | "subAdminKeys"> & { buyerKey: number | null }) {
    const subAdmin = subAdminBundle(row.buyerKey);
    rows.push({
      ...row,
      subAdminKey: subAdmin.primary,
      subAdminKeys: subAdmin.all
    });
  }

  function pushReturnRow(row: Omit<LumexReturnRow, "subAdminKey" | "subAdminKeys"> & { buyerKey: number | null }) {
    const subAdmin = subAdminBundle(row.buyerKey);
    returnRows.push({
      ...row,
      subAdminKey: subAdmin.primary,
      subAdminKeys: subAdmin.all
    });
  }

  function orderProducts(order: RawDocument) {
    const products = ensureArray(order.products);
    return products.length > 0 ? products : ensureArray(order.combine_products);
  }

  function stockIdentifier(product: RawDocument, fallbackPrefix: string) {
    return String(
      product.Stock_No ??
      product.Certificate_No ??
      product.lotid ??
      product.item_no ??
      `${fallbackPrefix}-${products.length + rows.length + 1}`
    );
  }

  const orderMemoRefIndex = new Set<string>();
  const orderWarehouseKeyByOrderNumber = new Map<string, number | null>();
  const orderWarehouseKeyByStockRef = new Map<string, number>();

  for (const order of rawOrders) {
    const buyerRawId = getOid(order.user_id);
    const buyerKey = buyerRawId ? (buyerKeyByRaw.get(buyerRawId) ?? null) : null;
    const orderDate = getDateOnly(order.createdAt) ?? getDateOnly(order.updatedAt) ?? "1970-01-01";
    const orderId = getOid(order._id) ?? orderDate;
    const orderNumber = String(order.order_number ?? "").trim();
    const orderIsCombined = isCombinedOrder(order.combine);
    const orderCanceled = hasCanceledStatus(order.status_list);
    const orderHasNoCombineField = !("combine" in order);
    const combinedMemoSale =
      !orderIsCombined &&
      typeof order.combine === "object" &&
      order.combine !== null &&
      (order.combine as RawDocument).is_combine === false &&
      ensureArray(order.combine_products).length >= 1;
    const orderRef = normalizeRef(order.ref);
    let orderWarehouseKey: number | null = null;

    // Combined PARENTS (is_combine:true) are skipped: they are bundling records that stay at
    // "Order Placed" and carry the same value as their child orders. The child orders carry their
    // own shipped/delivered status, so they are counted individually (here and in the other order
    // loops) by their own status — no double-counting with the parent.
    if (orderIsCombined) {
      continue;
    }

    if (orderCanceled && !combinedMemoSale) {
      continue;
    }

    if (buyerRawId && orderRef) {
      orderMemoRefIndex.add(`${buyerRawId}:${orderRef}`);
    }

    const orderDelivered = hasOrderStatus(order.status_list, ["order delivered"]);
    const backendRecognizedSale = (orderHasNoCombineField && orderDelivered && !orderCanceled) || combinedMemoSale;

    if (backendRecognizedSale) {
      salesDocuments.push({
        documentId: `order:${orderId}`,
        totalValue: asNumber((order.cost as RawDocument | undefined)?.total),
        taxValue: Number(asNumber((order.cost as RawDocument | undefined)?.tax).toFixed(2)),
        vatValue: Number(asNumber((order.cost as RawDocument | undefined)?.vat).toFixed(2))
      });
    }

    for (const product of orderProducts(order)) {
      const quantity = Math.max(asNumber(product.qty), 1);
      const carat = Math.max(asNumber(product.Carat), 1);
      const price = asNumber(product.DiscountPrice) || asNumber(product.Price) || asNumber(product.DefaultPrice);
      const salesValue = Number((price * carat * quantity).toFixed(2));
      const shape = resolveShape(product.shape_code);
      const size = sizeBucketLabel(carat);
      const color = resolveAttribute(product.colorID, colorByRawId, "CLR");
      const clarity = resolveAttribute(product.clarityID, clarityByRawId, "CLA");
      const stockNumber = stockIdentifier(product, "ORD");
      const vendorRawId = getOid(product.vendorID);
      const inventoryWarehouseKey = stockLookupCandidates(product)
        .map((stockRef) => inventoryWarehouseKeyByStockRef.get(stockRef) ?? null)
        .find((value): value is number => typeof value === "number");
      const fallbackWarehouseRef = typeof product.City === "string" && product.City.trim().length > 0
        ? product.City.trim().toLowerCase()
        : normalizeWarehouseRef(product.warehouse_id);
      const warehouseKey = inventoryWarehouseKey ?? resolveWarehouseKey(fallbackWarehouseRef);

      if (warehouseKey !== null) {
        orderWarehouseKey = orderWarehouseKey ?? warehouseKey;

        for (const stockRef of stockLookupCandidates(product)) {
          orderWarehouseKeyByStockRef.set(stockRef, warehouseKey);
        }
      }

      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "stone"
      });
      const inventoryVendorPrice = stockLookupCandidates(product)
        .map((stockRef) => inventoryVendorPriceByStockRef.get(stockRef) ?? 0)
        .find((value) => value > 0) ?? 0;
      const purchasePricePerCarat = inventoryVendorPrice || asNumber(product.vendor_price);
      const purchaseValue = Number((purchasePricePerCarat * carat * quantity).toFixed(2));

      if (backendRecognizedSale) {
        pushRow({
          id: `order:${getOid(order._id) ?? orderDate}:${stockNumber}`,
          documentId: `order:${orderId}`,
          date: orderDate,
          warehouseKey,
          buyerKey,
          vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
          productKey: productRecord.key,
          salesValue,
          purchaseValue: 0,
          revenueCostValue: purchaseValue,
          memoGivenValue: 0,
          memoConvertedValue: 0,
          quantity,
          productType: "stone",
          shape,
          size,
          color,
          clarity,
          stockNumber,
          qcStatus: typeof product.qc_status === "string" ? product.qc_status : "Unknown",
          status: typeof order.invoice_ind_loc === "string" && order.invoice_ind_loc.length > 0 ? "Invoiced" : "Ordered",
          sourceType: "sales",
          orderedUnits: quantity,
          fulfilledUnits: typeof product.qc_status === "string" && product.qc_status.trim().toLowerCase() === "success"
            ? quantity
            : 0
        });
      }

      if (!orderCanceled && purchaseValue > 0) {
        pushRow({
          id: `order-purchase:${getOid(order._id) ?? orderDate}:${stockNumber}`,
          documentId: `order-purchase:${orderId}`,
          date: orderDate,
          warehouseKey,
          buyerKey,
          vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
          productKey: productRecord.key,
          salesValue: 0,
          purchaseValue,
          revenueCostValue: 0,
          memoGivenValue: 0,
          memoConvertedValue: 0,
          quantity,
          productType: "purchase_stone",
          shape,
          size,
          color,
          clarity,
          stockNumber,
          qcStatus: typeof product.qc_status === "string" ? product.qc_status : "Unknown",
          status: typeof order.invoice_ind_loc === "string" && order.invoice_ind_loc.length > 0 ? "Invoiced" : "Ordered",
          sourceType: "purchase"
        });
      }

    }

    if (orderNumber.length > 0) {
      orderWarehouseKeyByOrderNumber.set(orderNumber, orderWarehouseKey);
    }
  }

  for (const orderReturn of rawOrderReturns) {
    const buyerRawId = getOid(orderReturn.user_id);
    const buyerKey = buyerRawId ? (buyerKeyByRaw.get(buyerRawId) ?? null) : null;
    const returnDate =
      getDateOnly(orderReturn.createdAt) ??
      getDateOnly(orderReturn.orderAt) ??
      getDateOnly(orderReturn.updatedAt) ??
      "1970-01-01";
    const returnId = getOid(orderReturn._id) ?? returnDate;
    const orderNumber = String(orderReturn.order_number ?? "").trim();
    const documentId = `return:${returnId}`;
    const baseReason = typeof orderReturn.reason === "string" ? orderReturn.reason.trim() : "";
    const otherReason = typeof orderReturn.other_reason === "string" ? orderReturn.other_reason.trim() : "";
    const reason = baseReason || otherReason || "Unspecified";
    const refundMethod =
      typeof orderReturn.refund_method === "string" && orderReturn.refund_method.trim().length > 0
        ? orderReturn.refund_method.trim()
        : "Unknown";
    const returnType =
      typeof orderReturn.return_type === "string" && orderReturn.return_type.trim().length > 0
        ? orderReturn.return_type.trim()
        : "Unknown";
    const productsInReturn = ensureArray(orderReturn.products);
    let documentWarehouseKey = orderWarehouseKeyByOrderNumber.get(orderNumber) ?? null;
    let documentQuantity = 0;

    for (const product of productsInReturn) {
      const quantity = Math.max(asNumber(product.qty), 1);
      const carat = Math.max(asNumber(product.Carat), 1);
      const price = asNumber(product.DiscountPrice) || asNumber(product.Price) || asNumber(product.DefaultPrice);
      const returnValue = Number((price * carat * quantity).toFixed(2));
      const shape = resolveShape(product.shape_code);
      const size = sizeBucketLabel(carat);
      const color = resolveAttribute(product.colorID, colorByRawId, "CLR");
      const clarity = resolveAttribute(product.clarityID, clarityByRawId, "CLA");
      const stockNumber = stockIdentifier(product, "RTN");
      const vendorRawId = getOid(product.vendorID);
      const fallbackWarehouseRef = typeof product.City === "string" && product.City.trim().length > 0
        ? product.City.trim().toLowerCase()
        : normalizeWarehouseRef(product.warehouse_id);
      const warehouseKey = stockLookupCandidates(product)
        .map((stockRef) => orderWarehouseKeyByStockRef.get(stockRef) ?? inventoryWarehouseKeyByStockRef.get(stockRef) ?? null)
        .find((value): value is number => typeof value === "number")
        ?? resolveWarehouseKey(fallbackWarehouseRef)
        ?? documentWarehouseKey;
      documentWarehouseKey = documentWarehouseKey ?? warehouseKey ?? null;
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "stone"
      });

      pushReturnRow({
        id: `return:${returnId}:${stockNumber}`,
        documentId,
        date: returnDate,
        warehouseKey,
        buyerKey,
        vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
        productKey: productRecord.key,
        returnValue,
        quantity,
        productType: "stone",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: typeof product.qc_status === "string" && product.qc_status.trim().length > 0 ? product.qc_status : "Unknown",
        reason,
        refundMethod,
        returnType
      });

      documentQuantity += quantity;
    }

    returnDocuments.push({
      documentId,
      date: returnDate,
      warehouseKey: documentWarehouseKey,
      buyerKey,
      totalValue: Number((asNumber((orderReturn.cost as RawDocument | undefined)?.total) || 0).toFixed(2)),
      quantity: documentQuantity,
      reason,
      refundMethod,
      returnType
    });
  }

  for (const order of rawLooseLotsMaster) {
    if (!hasOrderStatus(order.status_list, ["order placed"]) || order.payment_method === "memo") {
      continue;
    }

    const buyerRawId = getOid(order.buyer_id);
    const buyerKey = buyerRawId ? (buyerKeyByRaw.get(buyerRawId) ?? null) : null;
    const warehouseKey = resolveWarehouseKey(order.warehouse);
    const orderDate = getDateOnly(order.createdAt) ?? getDateOnly(order.updatedAt) ?? "1970-01-01";
    const orderId = getOid(order._id) ?? orderDate;
    const fulfilled = reachedShippedOrDelivered(order.status_list);

    salesDocuments.push({
      documentId: `loose-master:${orderId}`,
      totalValue: asNumber((order.cost as RawDocument | undefined)?.total),
      taxValue: Number(asNumber((order.cost as RawDocument | undefined)?.gst).toFixed(2)),
      vatValue: Number(asNumber((order.cost as RawDocument | undefined)?.vat).toFixed(2))
    });

    for (const entry of ensureArray(order.entries)) {
      const carat = asNumber(entry.available_carats) || asNumber(entry.total_carat);
      const quantity = asNumber(entry.available_pcs) || asNumber(entry.number_of_stone) || 1;
      const orderedUnits = asNumber(entry.number_of_stone) || quantity;
      const pricePerCarat = asNumber(entry.price_par_carat) || asNumber(entry.price_per_carat) || asNumber(entry.buyer_price_per_carat);
      const salesValue = Number((pricePerCarat * carat).toFixed(2));
      const shape = resolveShape(entry.shape);
      const size = typeof entry.size === "string" && entry.size.trim().length > 0
        ? entry.size.trim()
        : sizeBucketLabel(carat);
      const color = typeof entry.color === "string" && entry.color.trim().length > 0 ? entry.color.trim() : "Unknown";
      const clarity = typeof entry.clarity === "string" && entry.clarity.trim().length > 0 ? entry.clarity.trim() : "Unknown";
      const stockNumber = [entry.lotid, entry.item_no, entry._id]
        .map((value) => String(value ?? "").trim())
        .find((value) => value.length > 0) ?? stockIdentifier(entry, "LLM");
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "loose_lot"
      });

      pushRow({
        id: `loose-master:${getOid(order._id) ?? orderDate}:${stockNumber}`,
        documentId: `loose-master:${orderId}`,
        date: orderDate,
        warehouseKey,
        buyerKey,
        vendorKey: null,
        productKey: productRecord.key,
        salesValue,
        purchaseValue: 0,
        revenueCostValue: 0,
        memoGivenValue: 0,
        memoConvertedValue: 0,
        quantity,
        productType: "loose_lot",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: "Unknown",
        status: typeof order.invoice_ind_loc === "string" && order.invoice_ind_loc.length > 0 ? "Invoiced" : "Ordered",
        sourceType: "sales",
        orderedUnits,
        fulfilledUnits: fulfilled ? quantity : 0
      });

    }
  }

  for (const order of rawLooseLotsOrders) {
    if (!hasOrderStatus(order.status_list, ["order initiated"]) || order.payment_method === "memo") {
      continue;
    }

    const buyerRawId = getOid(order.buyer_id);
    const buyerKey = buyerRawId ? (buyerKeyByRaw.get(buyerRawId) ?? null) : null;
    const sourceOrder = looseLotsById.get(getOid(order.order_id) ?? "");
    const warehouseKey = resolveWarehouseKey(sourceOrder?.warehouse);
    const orderDate = getDateOnly(order.createdAt) ?? getDateOnly(order.updatedAt) ?? "1970-01-01";
    const orderId = getOid(order._id) ?? orderDate;
    const fulfilled = reachedShippedOrDelivered(order.status_list);

    salesDocuments.push({
      documentId: `loose-order:${orderId}`,
      totalValue: asNumber((order.cost as RawDocument | undefined)?.total),
      taxValue: Number(asNumber((order.cost as RawDocument | undefined)?.gst).toFixed(2)),
      vatValue: Number(asNumber((order.cost as RawDocument | undefined)?.vat).toFixed(2))
    });

    for (const stock of ensureArray(order.stocks)) {
      const carat = asNumber(stock.available_carats) || asNumber(stock.total_carat);
      const quantity = asNumber(stock.available_pcs) || asNumber(stock.number_of_stone) || 1;
      const orderedUnits = asNumber(stock.number_of_stone) || quantity;
      const fulfilledUnits = fulfilled ? asNumber(stock.available_pcs) : 0;
      const salesValue = Number(((asNumber(stock.price_per_carat) || 0) * carat).toFixed(2));
      const shape = resolveShape(stock.shape);
      const size = typeof stock.size === "string" && stock.size.trim().length > 0
        ? stock.size.trim()
        : sizeBucketLabel(carat);
      const color = typeof stock.color === "string" && stock.color.length > 0 ? stock.color : "Unknown";
      const clarity = typeof stock.clarity === "string" && stock.clarity.length > 0 ? stock.clarity : "Unknown";
      const stockNumber = stockIdentifier(stock, "LLO");
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "loose_lot"
      });

      pushRow({
        id: `loose-order:${getOid(order._id) ?? orderDate}:${stockNumber}`,
        documentId: `loose-order:${orderId}`,
        date: orderDate,
        warehouseKey,
        buyerKey,
        vendorKey: null,
        productKey: productRecord.key,
        salesValue,
        purchaseValue: 0,
        revenueCostValue: 0,
        memoGivenValue: 0,
        memoConvertedValue: 0,
        quantity,
        productType: "loose_lot",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: "Unknown",
        status: typeof order.invoice_ind_loc === "string" && order.invoice_ind_loc.length > 0 ? "Invoiced" : "Ordered",
        sourceType: "sales",
        orderedUnits,
        fulfilledUnits
      });

    }
  }

  for (const order of rawOwnShapeOrders) {
    if (
      !hasOrderStatus(order.status_list, ["order initiated"]) ||
      order.payment_method === "memo" ||
      (order.cost as RawDocument | undefined)?.paid !== true
    ) {
      continue;
    }

    const buyerRawId = getOid(order.buyer_id);
    const buyerKey = buyerRawId ? (buyerKeyByRaw.get(buyerRawId) ?? null) : null;
    const sourceOrder = ownShapeById.get(getOid(order.order_id) ?? "");
    const warehouseKey = resolveWarehouseKey(sourceOrder?.warehouse);
    const orderDate = getDateOnly(order.createdAt) ?? getDateOnly(order.updatedAt) ?? "1970-01-01";
    const orderId = getOid(order._id) ?? orderDate;

    salesDocuments.push({
      documentId: `own-shape-order:${orderId}`,
      totalValue: asNumber((order.cost as RawDocument | undefined)?.total),
      taxValue: Number(asNumber((order.cost as RawDocument | undefined)?.gst).toFixed(2)),
      vatValue: Number(asNumber((order.cost as RawDocument | undefined)?.vat).toFixed(2))
    });

    for (const stock of ensureArray(order.stocks)) {
      const quantity = asNumber(stock.Pcs) || 1;
      const carat = Math.max(asNumber(stock.Carat), 1);
      const shipped = typeof order.invoice_ind_loc === "string" && order.invoice_ind_loc.length > 0;
      const salesValue = Number(((asNumber(stock.Price_Per_Carat) || 0) * carat * quantity).toFixed(2));
      const shape = resolveShape(stock.Shape);
      const size = sizeBucketLabel(carat);
      const color = typeof stock.Color === "string" && stock.Color.length > 0 ? stock.Color : "Unknown";
      const clarity = typeof stock.Clarity === "string" && stock.Clarity.length > 0 ? stock.Clarity : "Unknown";
      const stockNumber = stockIdentifier(stock, "OSO");
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "own_shape"
      });

      pushRow({
        id: `own-shape-order:${getOid(order._id) ?? orderDate}:${stockNumber}`,
        documentId: `own-shape-order:${orderId}`,
        date: orderDate,
        warehouseKey,
        buyerKey,
        vendorKey: null,
        productKey: productRecord.key,
        salesValue,
        purchaseValue: 0,
        revenueCostValue: 0,
        memoGivenValue: 0,
        memoConvertedValue: 0,
        quantity,
        productType: "own_shape",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: "Unknown",
        status: typeof order.invoice_ind_loc === "string" && order.invoice_ind_loc.length > 0 ? "Invoiced" : "Ordered",
        sourceType: "sales",
        orderedUnits: quantity,
        fulfilledUnits: shipped ? quantity : 0
      });

    }
  }

  for (const memo of rawMemos) {
    const buyerRawId = getOid(memo.buyer_id);
    const buyerKey = buyerRawId ? (buyerKeyByRaw.get(buyerRawId) ?? null) : null;
    const warehouseRef = normalizeWarehouseRef(memo.from_warehouse);
    const memoDate = getDateOnly(memo.createdAt) ?? getDateOnly(memo.updatedAt) ?? "1970-01-01";
    const memoId = getOid(memo._id) ?? memoDate;
    const memoRef = normalizeRef(memo.ref);
    const memoIsConverted = buyerRawId && memoRef ? orderMemoRefIndex.has(`${buyerRawId}:${memoRef}`) : false;

    for (const product of ensureArray(memo.products)) {
      const carat = Math.max(asNumber(product.Carat), 1);
      const quantity = Math.max(asNumber(product.qty), 1);
      const memoGivenValue = Number(((asNumber(product.Price) || 0) * carat).toFixed(2));
      const shape = resolveShape(product.shape_code);
      const size = sizeBucketLabel(carat);
      const color = resolveAttribute(product.colorID, colorByRawId, "CLR");
      const clarity = resolveAttribute(product.clarityID, clarityByRawId, "CLA");
      const stockNumber = stockIdentifier(product, "MEM");
      const vendorRawId = getOid(product.vendorID);
      const inventoryVendorPrice = stockLookupCandidates(product)
        .map((stockRef) => inventoryVendorPriceByStockRef.get(stockRef) ?? 0)
        .find((value) => value > 0) ?? 0;
      const revenueCostPricePerCarat = inventoryVendorPrice || asNumber(product.vendor_price);
      const revenueCostValue = Number((revenueCostPricePerCarat * carat * quantity).toFixed(2));
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "memo"
      });
      const converted = memoIsConverted ? memoGivenValue : 0;

      pushRow({
        id: `memo:${getOid(memo._id) ?? memoDate}:${stockNumber}`,
        documentId: `memo:${memoId}`,
        date: memoDate,
        warehouseKey: resolveWarehouseKey(warehouseRef),
        buyerKey,
        vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
        productKey: productRecord.key,
        salesValue: 0,
        purchaseValue: 0,
        revenueCostValue,
        memoGivenValue,
        memoConvertedValue: converted,
        quantity,
        productType: "memo",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: typeof product.qc_status === "string" ? product.qc_status : "Unknown",
        status: converted > 0 ? "Converted" : "Memo Issued",
        sourceType: "memo"
      });
    }
  }

  for (const purchase of rawLooseLotsPurchases) {
    const warehouseRef = normalizeWarehouseRef(purchase.warehouseID);
    const purchaseDate = getDateOnly(purchase.createdAt) ?? getDateOnly(purchase.updatedAt) ?? "1970-01-01";
    const purchaseId = getOid(purchase._id) ?? purchaseDate;
    const vendorRawId = getOid(purchase.vendorID);

    for (const product of ensureArray(purchase.products)) {
      const carat = asNumber(product.total_carat);
      const quantity = asNumber(product.number_of_stone) || 1;
      const pricePerCarat = negotiatedPricePerCarat(
        product.price_per_carat,
        product.negotiated_price,
        product.negotiated_percentage
      );
      const purchaseValue = Number(
        (pricePerCarat * carat).toFixed(2)
      );
      const shape = resolveShape(product.shape);
      const size = sizeBucketLabel(carat);
      const color = typeof product.color === "string" && product.color.length > 0 ? product.color : "Unknown";
      const clarity = typeof product.clarity === "string" && product.clarity.length > 0 ? product.clarity : "Unknown";
      const stockNumber = stockIdentifier(product, "LPP");
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "purchase_loose_lot"
      });

      pushRow({
        id: `loose-purchase:${getOid(purchase._id) ?? purchaseDate}:${stockNumber}`,
        documentId: `loose-purchase:${purchaseId}`,
        date: purchaseDate,
        warehouseKey: resolveWarehouseKey(warehouseRef),
        buyerKey: null,
        vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
        productKey: productRecord.key,
        salesValue: 0,
        purchaseValue,
        revenueCostValue: 0,
        memoGivenValue: 0,
        memoConvertedValue: 0,
        quantity,
        productType: "purchase_loose_lot",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: "Unknown",
        status: ((purchase.invoice as RawDocument | undefined)?.status as string | undefined) ?? "Purchased",
        sourceType: "purchase"
      });
    }
  }

  for (const purchase of rawWarehousePurchases) {
    const purchaseDate = getDateOnly(purchase.createdAt) ?? getDateOnly(purchase.updatedAt) ?? "1970-01-01";
    const purchaseId = getOid(purchase._id) ?? purchaseDate;

    for (const product of ensureArray(purchase.products)) {
      const warehouseRef = normalizeWarehouseRef(product.warehouse_id);
      const carat = Math.max(asNumber(product.Carat), 1);
      const pricePerCarat = negotiatedPricePerCarat(
        asNumber(product.vendor_price) || asNumber(product.vendor_price_init),
        product.negotiated_price,
        product.negotiated_percentage
      );
      const purchaseValue = Number(
        (pricePerCarat * carat).toFixed(2)
      );
      const shape = resolveShape(product.shape_code);
      const size = sizeBucketLabel(carat);
      const color = resolveAttribute(product.colorID, colorByRawId, "CLR");
      const clarity = resolveAttribute(product.clarityID, clarityByRawId, "CLA");
      const stockNumber = stockIdentifier(product, "WHP");
      const vendorRawId = getOid(product.vendorID);
      const productRecord = ensureProduct({
        sku: stockNumber,
        shape,
        size,
        color,
        clarity,
        productType: "purchase_stone"
      });

      pushRow({
        id: `warehouse-purchase:${getOid(purchase._id) ?? purchaseDate}:${stockNumber}`,
        documentId: `warehouse-purchase:${purchaseId}`,
        date: purchaseDate,
        warehouseKey: resolveWarehouseKey(warehouseRef),
        buyerKey: null,
        vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
        productKey: productRecord.key,
        salesValue: 0,
        purchaseValue,
        revenueCostValue: 0,
        memoGivenValue: 0,
        memoConvertedValue: 0,
        quantity: 1,
        productType: "purchase_stone",
        shape,
        size,
        color,
        clarity,
        stockNumber,
        qcStatus: typeof product.qc_status === "string" ? product.qc_status : "Unknown",
        status: "Purchased",
        sourceType: "purchase"
      });
    }
  }

  for (const stock of rawInventory) {
    const carat = Math.max(asNumber(stock.Carat), 1);
    const stockNumber = stockIdentifier(stock, "INV");
    const shape = resolveShape(stock.shape_code);
    const size = sizeBucketLabel(carat);
    const color = resolveAttribute(stock.colorID, colorByRawId, "CLR");
    const clarity = resolveAttribute(stock.clarityID, clarityByRawId, "CLA");
    const warehouseRef = normalizeWarehouseRef(stock.warehouse_id);
    const vendorRawId = getOid(stock.vendorID);

    inventory.push({
      id: getOid(stock._id) ?? `inventory:${stockNumber}`,
      createdAt: getDateOnly(stock.createdAt) ?? getDateOnly(stock.updatedAt) ?? "1970-01-01",
      warehouseKey: resolveWarehouseKey(warehouseRef),
      vendorKey: vendorRawId ? (vendorKeyByRaw.get(vendorRawId) ?? null) : null,
      stockNumber,
      shape,
      size,
      color,
      clarity,
      inStock: Boolean(stock.in_stock),
      isVerify: Boolean(stock.is_verify),
      hold: Boolean(stock.hold)
    });
  }

  const dates = [...rows.map((row) => row.date), ...returnRows.map((row) => row.date)].filter(Boolean).sort();
  const minDate = dates[0] ?? "1970-01-01";
  const maxDate = dates[dates.length - 1] ?? minDate;

  return {
    adminUsers,
    warehouses,
    buyers,
    buyerMasterCount,
    verifiedBuyerMasterCount,
    verifiedBuyerKeys,
    vendors,
    vendorMasterCount,
    verifiedVendorMasterCount,
    verifiedVendorKeys,
    hasUserVerificationData: rawUsers.length > 0,
    subAdmins,
    subAdminUsers,
    products,
    rows,
    inventory,
    salesDocuments,
    returnRows,
    returnDocuments,
    minDate,
    maxDate
  };
}

export async function ensureLumexDatasetLoaded(forceRefresh = false): Promise<LumexDataset> {
  if (cachedDataset && !forceRefresh) {
    return cachedDataset;
  }

  if (datasetLoadingPromise && !forceRefresh) {
    return datasetLoadingPromise;
  }

  datasetLoadingPromise = (async () => {
    const rawCollections = await loadRawCollections();
    const dataset = buildLumexDataset(rawCollections);
    cachedDataset = dataset;
    return dataset;
  })();

  try {
    return await datasetLoadingPromise;
  } finally {
    datasetLoadingPromise = null;
  }
}

export function getLumexDataset(): LumexDataset {
  if (!cachedDataset) {
    throw new Error(
      "Lumex dataset has not been loaded yet. Call ensureLumexDatasetLoaded() during startup before using analytics services."
    );
  }

  return cachedDataset;
}
