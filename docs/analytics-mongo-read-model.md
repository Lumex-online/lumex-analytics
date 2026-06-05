# Analytics Mongo Read Model

This document defines the MongoDB warehouse read model for the Lumex analytics API.
The warehouse database is `lumex_analytics`, separate from the source `lumex`
database. Source reads remain owned by `@lumex/lumex-source`; analytics writes must
only target `lumex_analytics`.

The read model mirrors the `LumexDataset` interface in
`packages/lumex-source/src/index.ts`, not the previous Postgres star schema. The
API read path should not use `$lookup`; facts embed the labels needed for
dashboard responses.

## Day 0 Decisions

- `ANALYTICS_STORE` selects the warehouse backend: `bootstrap` or `mongo`.
- `LUMEX_MONGO_URI` and `LUMEX_MONGO_DATABASE` remain source-only.
- `ANALYTICS_MONGO_URI` and `ANALYTICS_MONGO_DATABASE` are analytics-only.
- `ANALYTICS_MONGO_DATABASE` defaults to `lumex_analytics`.
- `analytics_inventory` stores the current inventory snapshot indefinitely.
- `analytics_inventory_snapshots` stores hourly point-in-time inventory rows with
  7-day TTL retention.
- MongoDB TTL indexes are single-field only, so inventory snapshots need both a
  query index and a separate TTL index.

## Collection Summary

| Collection | Mirrors | Write source |
|---|---|---|
| `analytics_rows` | `LumexDataset.rows` | `sync-sales-facts`, `sync-memo-facts`, `sync-purchase-facts` |
| `analytics_inventory` | `LumexDataset.inventory` current state | `build-inventory-snapshot` |
| `analytics_inventory_snapshots` | Hourly point-in-time inventory rows | `build-inventory-snapshot` |
| `analytics_sales_documents` | `LumexDataset.salesDocuments` | `sync-sales-facts` |
| `analytics_return_rows` | `LumexDataset.returnRows` | `sync-sales-facts` via return persistence |
| `analytics_return_documents` | `LumexDataset.returnDocuments` | `sync-sales-facts` via return persistence |
| `analytics_warehouses` | `LumexDataset.warehouses` | dimension persistence |
| `analytics_buyers` | `LumexDataset.buyers` | dimension persistence |
| `analytics_vendors` | `LumexDataset.vendors` | dimension persistence |
| `analytics_products` | `LumexDataset.products` | dimension persistence |
| `analytics_sub_admins` | `LumexDataset.subAdmins` | dimension persistence |
| `analytics_users` | `adminUsers` and `subAdminUsers` | `sync-users-permissions` |
| `analytics_access_policies` | `AnalyticsAccessPolicy` | setup, `sync-users-permissions`, admin API |
| `analytics_kpi_targets` | `KpiTargetDefinition` | admin API |
| `analytics_dataset_metadata` | dataset scalar metadata | dimension/fact persistence |

## Shared Conventions

- Collection names use the `analytics_` prefix.
- Documents use camelCase field names.
- Dimension `key` fields stay numeric and are stable across ETL runs.
- `_id` is deterministic wherever possible so ETL can use idempotent
  `bulkWrite` upserts.
- Date filter fields keep the current `date` string for response parity and add
  `orderDate` as an indexed `Date` value for efficient range queries.
- Fact rows embed dimension snapshots so read services do not perform joins.
- Every ETL write stores `etlBatchId`, `createdAt`, and `updatedAt` where useful.

### Date Conventions

Every `orderDate`, `returnDate`, or other `Date` field derived from a
`YYYY-MM-DD` string is parsed as UTC midnight:

```ts
new Date(`${date}T00:00:00.000Z`)
```

ETL writers and read pipelines must use this consistently to avoid timezone
drift between bootstrap string filtering and Mongo date filtering.

## `analytics_rows`

Denormalized fact rows for sales, memo, purchase, and revenue-cost analytics.
Each row corresponds to one source line from `LumexAnalyticsRow`.

Document shape:

```ts
{
  _id: string; // `${sourceType}:${sourceTable}:${id}`
  id: string;
  documentId: string;
  date: string; // YYYY-MM-DD, compatible with LumexAnalyticsRow.date
  orderDate: Date; // derived from date, used for indexes and range filters
  sourceType: "sales" | "purchase" | "memo";
  sourceTable: string;

  warehouseKey: number | null;
  buyerKey: number | null;
  subAdminKey: number | null;
  subAdminKeys: number[];
  vendorKey: number | null;
  productKey: number;

  warehouse: { key: number; code: string; name: string } | null;
  buyer: { key: number; code: string; name: string; country: string; location: string; isVerified: boolean } | null;
  subAdmin: { key: number; code: string; name: string } | null;
  subAdmins: Array<{ key: number; code: string; name: string }>;
  vendor: { key: number; code: string; name: string; country: string; isVerified: boolean } | null;
  product: {
    key: number;
    sku: string;
    name: string;
    shape: string;
    size: string;
    color: string;
    clarity: string;
  };

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
  orderedUnits?: number;
  fulfilledUnits?: number;

  etlBatchId: number;
  createdAt: Date;
  updatedAt: Date;
}
```

`sourceTable` is derived during ETL; it is not present on `LumexAnalyticsRow`.
The canonical rule lives in `apps/jobs/src/persist/facts.ts:5-19`:

- `sourceType === "sales"` -> `productType === "loose_lots" ? "loose_lots_order_master" : "own_shape_order_master"`
- `sourceType === "purchase"` -> `productType === "loose_lots" ? "loose_lots_purchase_master" : "warehouse_purchase_master"`
- `sourceType === "memo"` -> `"memo_master"`

Indexes:

```ts
db.analytics_rows.createIndex({ orderDate: -1, warehouseKey: 1, buyerKey: 1 });
db.analytics_rows.createIndex({ productKey: 1 });
db.analytics_rows.createIndex({ subAdminKeys: 1 });
db.analytics_rows.createIndex({ sourceType: 1, orderDate: -1 });
db.analytics_rows.createIndex({ warehouseKey: 1, buyerKey: 1, productKey: 1 });
db.analytics_rows.createIndex({ stockNumber: 1 });
```

Write source:

- `sync-sales-facts` writes `sourceType: "sales"` rows.
- `sync-memo-facts` writes `sourceType: "memo"` rows.
- `sync-purchase-facts` writes `sourceType: "purchase"` rows.

## `analytics_inventory`

Current inventory snapshot per `(warehouseKey, itemId)`. `itemId` is explicitly
the same value as `stockNumber`, carried over from the former SQL `item_id`
column. This collection has no TTL and should represent the latest ETL view.

Document shape:

```ts
{
  _id: string; // `${warehouseKey}:${stockNumber}`
  id: string;
  createdAt: string; // source createdAt string for inventory aging logic
  warehouseKey: number | null;
  vendorKey: number | null;
  itemId: string;
  stockNumber: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  inStock: boolean;
  isVerify: boolean;
  hold: boolean;

  warehouse: { key: number; code: string; name: string } | null;
  vendor: { key: number; code: string; name: string; country: string; isVerified: boolean } | null;

  snapshotAt: Date;
  etlBatchId: number;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_inventory.createIndex({ warehouseKey: 1, inStock: 1 });
db.analytics_inventory.createIndex({ vendorKey: 1 });
db.analytics_inventory.createIndex({ shape: 1, size: 1, color: 1, clarity: 1 });
db.analytics_inventory.createIndex({ stockNumber: 1 });
```

Write source:

- `build-inventory-snapshot` replaces/upserts current rows for the latest dataset.

## `analytics_inventory_snapshots`

Hourly point-in-time inventory rows for short-term inventory trend analysis.
Retention is 7 days.

Document shape:

```ts
{
  _id: string; // `${snapshotDate.toISOString().slice(0,13)}:${warehouseKey}:${stockNumber}`
  snapshotDate: Date; // hourly capture timestamp, used by TTL
  snapshotDay: string; // YYYY-MM-DD
  id: string;
  warehouseKey: number | null;
  vendorKey: number | null;
  itemId: string;
  stockNumber: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  inStock: boolean;
  isVerify: boolean;
  hold: boolean;

  warehouse: { key: number; code: string; name: string } | null;
  vendor: { key: number; code: string; name: string; country: string; isVerified: boolean } | null;

  etlBatchId: number;
  createdAt: Date;
}
```

Indexes:

```ts
db.analytics_inventory_snapshots.createIndex({ snapshotDate: -1, warehouseKey: 1 });
db.analytics_inventory_snapshots.createIndex({ snapshotDate: 1 }, { expireAfterSeconds: 604800 });
db.analytics_inventory_snapshots.createIndex({ warehouseKey: 1, itemId: 1, snapshotDate: -1 });
```

Write source:

- `build-inventory-snapshot` inserts one hourly snapshot row per current inventory
  item.

## `analytics_sales_documents`

Document-level sales totals from `LumexSalesDocument`. These are required by the
executive dashboard because line-level `salesValue` is not always equivalent to
document totals.

Document shape:

```ts
{
  _id: string; // documentId
  documentId: string;
  totalValue: number;
  taxValue: number;
  vatValue: number;
  etlBatchId: number;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_sales_documents.createIndex({ documentId: 1 }, { unique: true });
```

Write source:

- `sync-sales-facts` writes sales document totals.

## `analytics_return_rows`

Denormalized return lines from `LumexReturnRow`. This collection mirrors the
filter behavior of `analytics_rows`.

Document shape:

```ts
{
  _id: string; // id
  id: string;
  documentId: string;
  date: string;
  orderDate: Date; // derived from return date for shared filter/index logic
  returnDate: Date;

  warehouseKey: number | null;
  buyerKey: number | null;
  subAdminKey: number | null;
  subAdminKeys: number[];
  vendorKey: number | null;
  productKey: number;

  warehouse: { key: number; code: string; name: string } | null;
  buyer: { key: number; code: string; name: string; country: string; location: string; isVerified: boolean } | null;
  subAdmin: { key: number; code: string; name: string } | null;
  subAdmins: Array<{ key: number; code: string; name: string }>;
  vendor: { key: number; code: string; name: string; country: string; isVerified: boolean } | null;
  product: {
    key: number;
    sku: string;
    name: string;
    shape: string;
    size: string;
    color: string;
    clarity: string;
  };

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

  etlBatchId: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_return_rows.createIndex({ orderDate: -1, warehouseKey: 1, buyerKey: 1 });
db.analytics_return_rows.createIndex({ productKey: 1 });
db.analytics_return_rows.createIndex({ subAdminKeys: 1 });
db.analytics_return_rows.createIndex({ vendorKey: 1, orderDate: -1 });
db.analytics_return_rows.createIndex({ stockNumber: 1 });
```

Write source:

- `sync-sales-facts` writes return rows via return persistence.

## `analytics_return_documents`

Document-level return totals from `LumexReturnDocument`.

Document shape:

```ts
{
  _id: string; // documentId
  documentId: string;
  date: string;
  orderDate: Date;
  warehouseKey: number | null;
  buyerKey: number | null;
  totalValue: number;
  quantity: number;
  reason: string;
  refundMethod: string;
  returnType: string;
  etlBatchId: number;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_return_documents.createIndex({ documentId: 1 }, { unique: true });
db.analytics_return_documents.createIndex({ orderDate: -1, warehouseKey: 1, buyerKey: 1 });
```

Write source:

- `sync-sales-facts` writes return document totals via return persistence.

## Dimension Collections

Dimensions support filter metadata, embedded fact labels, and admin access UI
options. They are not used with `$lookup` in dashboard read pipelines.

### `analytics_warehouses`

Shape:

```ts
{
  _id: number; // key
  key: number;
  sourceWarehouseId?: string;
  code: string;
  name: string;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_warehouses.createIndex({ key: 1 }, { unique: true });
db.analytics_warehouses.createIndex({ sourceWarehouseId: 1 });
```

Write source:

- dimension persistence from the current loaded dataset.

### `analytics_buyers`

Shape:

```ts
{
  _id: number; // key
  key: number;
  sourceBuyerId?: string;
  code: string;
  name: string;
  location: string;
  country: string;
  isVerified: boolean;
  warehouseKeys: number[];
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_buyers.createIndex({ key: 1 }, { unique: true });
db.analytics_buyers.createIndex({ sourceBuyerId: 1 });
db.analytics_buyers.createIndex({ isVerified: 1 });
db.analytics_buyers.createIndex({ warehouseKeys: 1 });
```

Write source:

- dimension persistence from the current loaded dataset.

### `analytics_vendors`

Shape:

```ts
{
  _id: number; // key
  key: number;
  code: string;
  name: string;
  country: string;
  isVerified: boolean;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_vendors.createIndex({ key: 1 }, { unique: true });
db.analytics_vendors.createIndex({ isVerified: 1 });
```

Write source:

- dimension persistence from the current loaded dataset.

### `analytics_products`

Shape:

```ts
{
  _id: number; // key
  key: number;
  sku: string;
  name: string;
  shape: string;
  size: string;
  color: string;
  clarity: string;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_products.createIndex({ key: 1 }, { unique: true });
db.analytics_products.createIndex({ sku: 1 });
db.analytics_products.createIndex({ shape: 1, size: 1, color: 1, clarity: 1 });
```

Write source:

- dimension persistence from the current loaded dataset.

### `analytics_sub_admins`

Shape:

```ts
{
  _id: number; // key
  key: number;
  sourceSubAdminId?: string;
  code: string;
  name: string;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_sub_admins.createIndex({ key: 1 }, { unique: true });
db.analytics_sub_admins.createIndex({ sourceSubAdminId: 1 });
```

Write source:

- dimension persistence from the current loaded dataset.

## `analytics_users`

User identity documents for auth resolution. A Mongo permission repository must
implement `getUserByWebsiteUserId` against this collection.

`sync-users-permissions` sets `isActive: true` for every user seen in the
current dataset. Users present in a previous ETL batch but missing from the
current dataset are marked `isActive: false` in the same batch. New documents
default to `isActive: true`.

Document shape:

```ts
{
  _id: number; // sourceUserId
  sourceUserId: number;
  websiteUserId?: string;
  email: string;
  fullName: string;
  websiteRole: string;
  analyticsRole: "founder" | "admin" | "sub_admin" | "buyer_user";
  isActive: boolean;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_users.createIndex({ websiteUserId: 1 }, { sparse: true });
db.analytics_users.createIndex({ email: 1 });
db.analytics_users.createIndex({ analyticsRole: 1, isActive: 1 });
```

Write source:

- `sync-users-permissions` writes user identities from `adminUsers` and
  `subAdminUsers`.

## `analytics_access_policies`

One document per user. This replaces `analytics_access_policy`,
`bridge_user_warehouse_access`, `bridge_user_buyer_access`, and
`bridge_buyer_sub_admin`.

Document shape:

```ts
{
  _id: number; // sourceUserId
  sourceUserId: number;
  analyticsRole: "founder" | "admin" | "sub_admin" | "buyer_user";
  accessMode: "full_access" | "scoped_access";
  allowGlobalTotals: boolean;
  allowExport: boolean;
  allowDrilldown: boolean;
  allowPurchaseVisibility: boolean;
  allowMemoVisibility: boolean;
  allowSkuAnalytics: boolean;
  allowManageOrganizationTargets: boolean;
  allowManageOwnTargets: boolean;
  dashboards: string[];
  metricGroups: string[];
  filterVisibility: Record<string, boolean | string>;
  isActive: boolean;

  warehouseAccess: number[]; // empty array means ALL only when warehouseScopeMode is "all"
  buyerAccess: number[]; // empty array means ALL only when buyerScopeMode is "all"
  subAdminAssociations: number[];
  warehouseScopeMode: "all" | "custom";
  buyerScopeMode: "all" | "associated";

  version: number;
  createdBy?: number;
  updatedBy?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Repository mapping:

- `warehouseKeys` response is `"ALL"` when `warehouseScopeMode === "all"`,
  otherwise `warehouseAccess`.
- `buyerKeys` response is `"ALL"` when `buyerScopeMode === "all"`, otherwise
  `buyerAccess`.
- `subAdminKeys` response is `"ALL"` for full-access users, otherwise
  `subAdminAssociations`.

Indexes:

```ts
db.analytics_access_policies.createIndex({ analyticsRole: 1, isActive: 1 });
db.analytics_access_policies.createIndex({ warehouseAccess: 1 });
db.analytics_access_policies.createIndex({ buyerAccess: 1 });
db.analytics_access_policies.createIndex({ subAdminAssociations: 1 });
```

Write source:

- `setup-analytics-mongo.ts` seeds initial founder/admin/sub-admin policies.
- `sync-users-permissions` keeps default derived sub-admin associations current.
- `PATCH /api/v1/admin/access-policies/:sourceUserId` updates policy settings.

## `analytics_kpi_targets`

KPI target ranges for organization and own-user targets.

Document shape:

```ts
{
  _id: string; // `${metricKey}:${scope}:${scopeKey}:${targetFrom}:${targetTo}`
  metricKey: "totalSales";
  scope: "organization" | "own";
  scopeKey: "organization" | string; // sourceUserId string for own targets
  targetFrom: string; // YYYY-MM-DD
  targetTo: string; // YYYY-MM-DD
  targetValue: number;
  isActive: boolean;
  createdBy?: number;
  updatedBy?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

```ts
db.analytics_kpi_targets.createIndex(
  { metricKey: 1, scope: 1, scopeKey: 1, targetFrom: 1, targetTo: 1 },
  { unique: true }
);
db.analytics_kpi_targets.createIndex({ scope: 1, scopeKey: 1, isActive: 1 });
```

Write source:

- `PUT /api/v1/admin/kpi-targets` upserts active target ranges.
- `DELETE /api/v1/admin/kpi-targets` soft-deletes target ranges.

## `analytics_dataset_metadata`

Single document for scalar fields from `LumexDataset` that are not naturally a
collection. This prevents Mongo mode from loading bootstrap data to answer
filters or executive summary cards.

Document shape:

```ts
{
  _id: "current";
  buyerMasterCount: number;
  verifiedBuyerMasterCount: number;
  verifiedBuyerKeys: number[];
  vendorMasterCount: number;
  verifiedVendorMasterCount: number;
  verifiedVendorKeys: number[];
  hasUserVerificationData: boolean;
  minDate: string;
  maxDate: string;
  lastEtlBatchId: number;
  updatedAt: Date;
}
```

Indexes:

```ts
// _id is sufficient.
```

Write source:

- dimension/fact persistence updates this after loading the current dataset.

## Read Path Notes

- `mongo-analytics.ts` should expose bootstrap-compatible helpers, but the
  implementation should push filtering and aggregation into Mongo pipelines.
- Dashboard reads must only query `lumex_analytics`.
- Fact read pipelines should start with `$match` on indexed fields, then use
  `$group`, `$sort`, `$limit`, and `$facet` as needed.
- No dashboard read path should depend on `getLumexDataset()` when
  `ANALYTICS_STORE=mongo`.
- The comparison smoke harness should diff Mongo responses against bootstrap
  responses while ignoring time-dependent fields such as `lastUpdatedAt`.

## Setup Script Responsibilities

`apps/api/src/scripts/setup-analytics-mongo.ts` should be idempotent and should:

- Assert `ANALYTICS_MONGO_URI` and `ANALYTICS_MONGO_DATABASE` are configured.
- Create the collections listed in this document if absent.
- Create all indexes listed in this document.
- Seed default access policies without overwriting existing admin-edited policy
  documents.
- Not create Mongo users.
- Not write to the source `lumex` database.

## Operational Setup

Applications must not create database users. Provision Mongo users out-of-band as
an ops task before deploying Mongo analytics mode.

```js
// Run as a Mongo admin (one-time, out-of-band) before any app deploy.

// Reader for the source DB
use lumex
db.createUser({
  user: "analytics_reader",
  pwd: "<set-via-env>",
  roles: [{ role: "read", db: "lumex" }]
})

// Writer for the analytics warehouse (no access to source)
use lumex_analytics
db.createUser({
  user: "analytics_writer",
  pwd: "<set-via-env>",
  roles: [{ role: "readWrite", db: "lumex_analytics" }]
})
```

Connection string usage:

- `LUMEX_MONGO_URI` uses `analytics_reader` credentials and points at source DB
  `lumex`.
- `ANALYTICS_MONGO_URI` uses `analytics_writer` credentials and points at
  analytics DB `lumex_analytics`.

Startup invariant:

- When `ANALYTICS_STORE=mongo`, API and jobs should parse both Mongo URIs,
  assert the usernames are different, and fail fast if they match.
- Local development may use an unauthenticated localhost Mongo only when
  `NODE_ENV !== "production"` and
  `ANALYTICS_ALLOW_UNAUTHENTICATED_MONGO=true`. In that mode, both URIs must
  omit usernames and `LUMEX_MONGO_DATABASE` must differ from
  `ANALYTICS_MONGO_DATABASE`. Do not use this flag on the VPS or any shared
  environment.
- On success, log a one-line assertion such as:

```text
[mongo] source user and analytics user are distinct; source DB is read-only and analytics DB is write target
```

This guards against accidentally giving analytics code write access to the
source `lumex` database.

## Future Extension

If inventory trends beyond seven days are needed, add
`analytics_inventory_daily` in a later iteration. It should store one daily
rollup per warehouse/product/status and use a longer retention window. It is
intentionally out of scope for this migration.
