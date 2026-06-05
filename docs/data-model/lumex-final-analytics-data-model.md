# Lumex Final Analytics Data Model

This document is the implementation-ready final data model for the Lumex analytics layer, using only the locked fields and relationship rules provided, with `dataset_schema_sample` used to validate actual nesting patterns where samples exist.

Two guardrails are applied throughout:
- `order_return_master` sample was not present under `dataset_schema_sample`, so its locked field list and relationship rules are treated as authoritative.
- Sample-only fields or arrays that are not part of the locked field set are intentionally excluded from the analytics model.

## 1. Final Data Model Overview

The Lumex analytics layer should be modeled as a controlled star schema with operational lineage links:

- Dimensions hold reusable business entities and readable lookup labels.
- One bridge table resolves the many-to-many buyer to sub-admin assignment.
- Fact header tables represent one transaction/order/memo document per row.
- Fact line tables represent one flattened product/entry/stock row per parent document row.
- Fact status tables represent one status event per parent order where `status_list[]` fields are explicitly locked.
- `fact_inventory` is a stock snapshot fact keyed by stone business key `Stock_No`.

### Dimensions

- `dim_buyer`
- `dim_sub_admin`
- `dim_vendor`
- `dim_warehouse`
- `dim_warehouse_buyer`
- `dim_shape`
- `dim_color`
- `dim_clarity`
- `dim_cut`
- `dim_polish`
- `dim_symmetry`
- `dim_size`
- `dim_fluorescence`
- `dim_growth`
- `dim_intensity`

### Bridge

- `bridge_buyer_sub_admin`

### Fact Headers

- `fact_order_header`
- `fact_memo_header`
- `fact_warehouse_purchase_header`
- `fact_loose_lots_header`
- `fact_loose_lots_order_header`
- `fact_loose_lots_purchase_header`
- `fact_own_shape_header`
- `fact_own_shape_order_header`
- `fact_order_return_header`

### Fact Lines / Entries / Stocks

- `fact_order_line`
- `fact_memo_line`
- `fact_warehouse_purchase_line`
- `fact_loose_lots_entry`
- `fact_loose_lots_purchase_line`
- `fact_own_shape_line`
- `fact_own_shape_order_line`
- `fact_order_return_line`

### Fact Status Tables

- `fact_loose_lots_order_status`
- `fact_own_shape_order_status`

### Snapshot Fact

- `fact_inventory`

### Business Intent

- Stone-level analytics comes from `fact_order_line`, `fact_memo_line`, `fact_warehouse_purchase_line`, `fact_order_return_line`, and `fact_inventory`, all retaining `Stock_No`.
- Loose-lots analytics is handled separately because it is not stone-by-stone inventory and uses free-text attributes instead of lookup IDs.
- Own-shape analytics is handled separately because it is custom-order flow data with free-text stone characteristics.
- Buyer analytics is anchored on `dim_buyer`; sub-admin analytics is anchored on `dim_sub_admin` through `bridge_buyer_sub_admin`.
- Warehouse purchase analytics must use `dim_warehouse_buyer`, not `dim_buyer`.

## 2. Final Table List

### Dimensions

- `dim_buyer`
- `dim_sub_admin`
- `dim_vendor`
- `dim_warehouse`
- `dim_warehouse_buyer`
- `dim_shape`
- `dim_color`
- `dim_clarity`
- `dim_cut`
- `dim_polish`
- `dim_symmetry`
- `dim_size`
- `dim_fluorescence`
- `dim_growth`
- `dim_intensity`

### Bridge

- `bridge_buyer_sub_admin`

### Fact Headers

- `fact_order_header`
- `fact_memo_header`
- `fact_warehouse_purchase_header`
- `fact_loose_lots_header`
- `fact_loose_lots_order_header`
- `fact_loose_lots_purchase_header`
- `fact_own_shape_header`
- `fact_own_shape_order_header`
- `fact_order_return_header`

### Fact Lines / Entries / Stocks

- `fact_order_line`
- `fact_memo_line`
- `fact_warehouse_purchase_line`
- `fact_loose_lots_entry`
- `fact_loose_lots_purchase_line`
- `fact_own_shape_line`
- `fact_own_shape_order_line`
- `fact_order_return_line`

### Fact Status Tables

- `fact_loose_lots_order_status`
- `fact_own_shape_order_status`

### Snapshot Fact

- `fact_inventory`

## 3. Relationship Matrix

| Parent table | Child table | Join key | Cardinality | Relationship purpose |
|---|---|---|---|---|
| `dim_buyer` | `bridge_buyer_sub_admin` | `dim_buyer.buyer_id = bridge_buyer_sub_admin.buyer_id` | 1:M | Buyer to assigned sub-admins |
| `dim_sub_admin` | `bridge_buyer_sub_admin` | `dim_sub_admin.sub_admin_id = bridge_buyer_sub_admin.sub_admin_id` | 1:M | Sub-admin to managed buyers |
| `dim_buyer` | `fact_order_header` | `dim_buyer.buyer_id = fact_order_header.buyer_id` | 1:M | Buyer-wise order analytics |
| `dim_buyer` | `fact_memo_header` | `dim_buyer.buyer_id = fact_memo_header.buyer_id` | 1:M | Buyer-wise memo analytics |
| `dim_buyer` | `fact_loose_lots_header` | `dim_buyer.buyer_id = fact_loose_lots_header.buyer_id` | 1:M | Buyer-wise loose-lots demand |
| `dim_buyer` | `fact_loose_lots_order_header` | `dim_buyer.buyer_id = fact_loose_lots_order_header.buyer_id` | 1:M | Buyer-wise loose-lots order analytics |
| `dim_buyer` | `fact_own_shape_header` | `dim_buyer.buyer_id = fact_own_shape_header.buyer_id` | 1:M | Buyer-wise own-shape request analytics |
| `dim_buyer` | `fact_own_shape_order_header` | `dim_buyer.buyer_id = fact_own_shape_order_header.buyer_id` | 1:M | Buyer-wise own-shape order analytics |
| `dim_buyer` | `fact_order_return_header` | `dim_buyer.buyer_id = fact_order_return_header.buyer_id` | 1:M | Buyer-wise return analytics |
| `dim_warehouse_buyer` | `fact_warehouse_purchase_header` | `dim_warehouse_buyer.warehouse_buyer_id = fact_warehouse_purchase_header.warehouse_buyer_id` | 1:M | Warehouse-buyer purchase analytics |
| `dim_vendor` | `fact_order_line` | `dim_vendor.vendor_id = fact_order_line.vendor_id` | 1:M | Order line vendor analysis |
| `dim_vendor` | `fact_memo_line` | `dim_vendor.vendor_id = fact_memo_line.vendor_id` | 1:M | Memo line vendor analysis |
| `dim_vendor` | `fact_warehouse_purchase_line` | `dim_vendor.vendor_id = fact_warehouse_purchase_line.vendor_id` | 1:M | Warehouse purchase vendor analysis |
| `dim_vendor` | `fact_loose_lots_purchase_header` | `dim_vendor.vendor_id = fact_loose_lots_purchase_header.vendor_id` | 1:M | Loose-lots purchase vendor analysis |
| `dim_vendor` | `fact_order_return_line` | `dim_vendor.vendor_id = fact_order_return_line.vendor_id` | 1:M | Return line vendor analysis |
| `dim_vendor` | `fact_inventory` | `dim_vendor.vendor_id = fact_inventory.vendor_id` | 1:M | Vendor stock position |
| `dim_warehouse` | `dim_warehouse_buyer` | `dim_warehouse.warehouse_id = dim_warehouse_buyer.warehouse_id` | 1:M | Warehouse to warehouse-buyer ownership |
| `dim_warehouse` | `fact_memo_header` | `dim_warehouse.warehouse_id = fact_memo_header.from_warehouse_id` | 1:M | Memo dispatch warehouse |
| `dim_warehouse` | `fact_warehouse_purchase_line` | `dim_warehouse.warehouse_id = fact_warehouse_purchase_line.warehouse_id` | 1:M | Purchase receiving warehouse |
| `dim_warehouse` | `fact_inventory` | `dim_warehouse.warehouse_id = fact_inventory.warehouse_id` | 1:M | Warehouse stock analytics |
| `dim_shape` | `fact_order_line` | `dim_shape.shape_code = fact_order_line.shape_code` | 1:M | Readable shape on order lines |
| `dim_shape` | `fact_memo_line` | `dim_shape.shape_code = fact_memo_line.shape_code` | 1:M | Readable shape on memo lines |
| `dim_shape` | `fact_warehouse_purchase_line` | `dim_shape.shape_code = fact_warehouse_purchase_line.shape_code` | 1:M | Readable shape on purchase lines |
| `dim_shape` | `fact_order_return_line` | `dim_shape.shape_code = fact_order_return_line.shape_code` | 1:M | Readable shape on return lines |
| `dim_shape` | `fact_inventory` | `dim_shape.shape_code = fact_inventory.shape_code` | 1:M | Readable shape on inventory |
| `dim_color` | `fact_order_line` | `dim_color.color_id = fact_order_line.color_id` | 1:M | Readable color on order lines |
| `dim_color` | `fact_memo_line` | `dim_color.color_id = fact_memo_line.color_id` | 1:M | Readable color on memo lines |
| `dim_color` | `fact_warehouse_purchase_line` | `dim_color.color_id = fact_warehouse_purchase_line.color_id` | 1:M | Readable color on purchase lines |
| `dim_color` | `fact_order_return_line` | `dim_color.color_id = fact_order_return_line.color_id` | 1:M | Readable color on return lines |
| `dim_color` | `fact_inventory` | `dim_color.color_id = fact_inventory.color_id` | 1:M | Readable color on inventory |
| `dim_clarity` | `fact_order_line` | `dim_clarity.clarity_id = fact_order_line.clarity_id` | 1:M | Readable clarity on order lines |
| `dim_clarity` | `fact_memo_line` | `dim_clarity.clarity_id = fact_memo_line.clarity_id` | 1:M | Readable clarity on memo lines |
| `dim_clarity` | `fact_warehouse_purchase_line` | `dim_clarity.clarity_id = fact_warehouse_purchase_line.clarity_id` | 1:M | Readable clarity on purchase lines |
| `dim_clarity` | `fact_order_return_line` | `dim_clarity.clarity_id = fact_order_return_line.clarity_id` | 1:M | Readable clarity on return lines |
| `dim_clarity` | `fact_inventory` | `dim_clarity.clarity_id = fact_inventory.clarity_id` | 1:M | Readable clarity on inventory |
| `dim_cut` | `fact_order_line` | `dim_cut.cut_id = fact_order_line.cut_id` | 1:M | Readable cut on order lines |
| `dim_cut` | `fact_memo_line` | `dim_cut.cut_id = fact_memo_line.cut_id` | 1:M | Readable cut on memo lines |
| `dim_cut` | `fact_order_return_line` | `dim_cut.cut_id = fact_order_return_line.cut_id` | 1:M | Readable cut on return lines |
| `dim_cut` | `fact_inventory` | `dim_cut.cut_id = fact_inventory.cut_id` | 1:M | Readable cut on inventory |
| `dim_polish` | `fact_order_line` | `dim_polish.polish_id = fact_order_line.polish_id` | 1:M | Readable polish on order lines |
| `dim_polish` | `fact_memo_line` | `dim_polish.polish_id = fact_memo_line.polish_id` | 1:M | Readable polish on memo lines |
| `dim_polish` | `fact_warehouse_purchase_line` | `dim_polish.polish_id = fact_warehouse_purchase_line.polish_id` | 1:M | Readable polish on purchase lines |
| `dim_polish` | `fact_order_return_line` | `dim_polish.polish_id = fact_order_return_line.polish_id` | 1:M | Readable polish on return lines |
| `dim_polish` | `fact_inventory` | `dim_polish.polish_id = fact_inventory.polish_id` | 1:M | Readable polish on inventory |
| `dim_symmetry` | `fact_order_line` | `dim_symmetry.symmetry_id = fact_order_line.symmetry_id` | 1:M | Readable symmetry on order lines |
| `dim_symmetry` | `fact_memo_line` | `dim_symmetry.symmetry_id = fact_memo_line.symmetry_id` | 1:M | Readable symmetry on memo lines |
| `dim_symmetry` | `fact_warehouse_purchase_line` | `dim_symmetry.symmetry_id = fact_warehouse_purchase_line.symmetry_id` | 1:M | Readable symmetry on purchase lines |
| `dim_symmetry` | `fact_order_return_line` | `dim_symmetry.symmetry_id = fact_order_return_line.symmetry_id` | 1:M | Readable symmetry on return lines |
| `dim_symmetry` | `fact_inventory` | `dim_symmetry.symmetry_id = fact_inventory.symmetry_id` | 1:M | Readable symmetry on inventory |
| `dim_size` | `fact_order_line` | `dim_size.size_id = fact_order_line.size_id` | 1:M | Readable size band on order lines |
| `dim_size` | `fact_memo_line` | `dim_size.size_id = fact_memo_line.size_id` | 1:M | Readable size band on memo lines |
| `dim_size` | `fact_warehouse_purchase_line` | `dim_size.size_id = fact_warehouse_purchase_line.size_id` | 1:M | Readable size band on purchase lines |
| `dim_size` | `fact_order_return_line` | `dim_size.size_id = fact_order_return_line.size_id` | 1:M | Readable size band on return lines |
| `dim_size` | `fact_inventory` | `dim_size.size_id = fact_inventory.size_id` | 1:M | Readable size band on inventory |
| `dim_fluorescence` | `fact_order_line` | `dim_fluorescence.fluorescence_id = fact_order_line.fluorescence_id` | 1:M | Readable fluorescence on order lines |
| `dim_fluorescence` | `fact_memo_line` | `dim_fluorescence.fluorescence_id = fact_memo_line.fluorescence_id` | 1:M | Readable fluorescence on memo lines |
| `dim_fluorescence` | `fact_warehouse_purchase_line` | `dim_fluorescence.fluorescence_id = fact_warehouse_purchase_line.fluorescence_id` | 1:M | Readable fluorescence on purchase lines |
| `dim_fluorescence` | `fact_order_return_line` | `dim_fluorescence.fluorescence_id = fact_order_return_line.fluorescence_id` | 1:M | Readable fluorescence on return lines |
| `dim_fluorescence` | `fact_inventory` | `dim_fluorescence.fluorescence_id = fact_inventory.fluorescence_id` | 1:M | Readable fluorescence on inventory |
| `dim_growth` | `fact_order_line` | `dim_growth.growth_id = fact_order_line.growth_id` | 1:M | Readable growth on order lines |
| `dim_growth` | `fact_memo_line` | `dim_growth.growth_id = fact_memo_line.growth_id` | 1:M | Readable growth on memo lines |
| `dim_growth` | `fact_warehouse_purchase_line` | `dim_growth.growth_id = fact_warehouse_purchase_line.growth_id` | 1:M | Readable growth on purchase lines |
| `dim_growth` | `fact_order_return_line` | `dim_growth.growth_id = fact_order_return_line.growth_id` | 1:M | Readable growth on return lines |
| `dim_growth` | `fact_inventory` | `dim_growth.growth_id = fact_inventory.growth_id` | 1:M | Readable growth on inventory |
| `dim_intensity` | `fact_inventory` | `dim_intensity.intensity_id = fact_inventory.intensity_id` | 1:M | Readable intensity on inventory |
| `fact_order_header` | `fact_order_line` | `fact_order_header.order_id = fact_order_line.order_id` | 1:M | Order header to order lines |
| `fact_memo_header` | `fact_memo_line` | `fact_memo_header.memo_id = fact_memo_line.memo_id` | 1:M | Memo header to memo lines |
| `fact_warehouse_purchase_header` | `fact_warehouse_purchase_line` | `fact_warehouse_purchase_header.warehouse_purchase_id = fact_warehouse_purchase_line.warehouse_purchase_id` | 1:M | Warehouse purchase header to lines |
| `fact_loose_lots_header` | `fact_loose_lots_entry` | `fact_loose_lots_header.loose_lots_id = fact_loose_lots_entry.loose_lots_id` | 1:M | Loose-lots header to entries |
| `fact_loose_lots_purchase_header` | `fact_loose_lots_purchase_line` | `fact_loose_lots_purchase_header.loose_lots_purchase_id = fact_loose_lots_purchase_line.loose_lots_purchase_id` | 1:M | Loose-lots purchase header to lines |
| `fact_own_shape_header` | `fact_own_shape_line` | `fact_own_shape_header.own_shape_id = fact_own_shape_line.own_shape_id` | 1:M | Own-shape header to requested lines |
| `fact_own_shape_order_header` | `fact_own_shape_order_line` | `fact_own_shape_order_header.own_shape_order_id = fact_own_shape_order_line.own_shape_order_id` | 1:M | Own-shape order header to delivered stock lines |
| `fact_loose_lots_order_header` | `fact_loose_lots_order_status` | `fact_loose_lots_order_header.loose_lots_order_id = fact_loose_lots_order_status.loose_lots_order_id` | 1:M | Loose-lots order lifecycle tracking |
| `fact_own_shape_order_header` | `fact_own_shape_order_status` | `fact_own_shape_order_header.own_shape_order_id = fact_own_shape_order_status.own_shape_order_id` | 1:M | Own-shape order lifecycle tracking |
| `fact_loose_lots_header` | `fact_loose_lots_order_header` | `fact_loose_lots_header.loose_lots_id = fact_loose_lots_order_header.loose_lots_id` | 1:M logical | Loose-lots request to loose-lots orders |
| `fact_own_shape_header` | `fact_own_shape_order_header` | `fact_own_shape_header.own_shape_id = fact_own_shape_order_header.own_shape_id` | 1:M logical | Own-shape request to own-shape orders |
| `fact_order_header` | `fact_memo_header` | `fact_order_header.order_number = fact_memo_header.order_number` | 1:M logical | Invoice/order to memo linkage |
| `fact_order_header` | `fact_order_return_header` | `fact_order_header.order_number = fact_order_return_header.order_number` | 1:M logical | Invoice/order to return linkage |
| `fact_inventory` | `fact_order_line` | `fact_inventory.stock_no = fact_order_line.stock_no` | 1:M logical | Stone movement from inventory to order lines |
| `fact_inventory` | `fact_memo_line` | `fact_inventory.stock_no = fact_memo_line.stock_no` | 1:M logical | Stone movement from inventory to memo lines |
| `fact_inventory` | `fact_warehouse_purchase_line` | `fact_inventory.stock_no = fact_warehouse_purchase_line.stock_no` | 1:M logical | Stone movement from inventory to purchase lines |
| `fact_inventory` | `fact_order_return_line` | `fact_inventory.stock_no = fact_order_return_line.stock_no` | 1:M logical | Stone movement from inventory to return lines |

## 4. Flattening Rules

### `products[]`

- `order_master.products[]` becomes `fact_order_line`.
- `memo_master.products[]` becomes `fact_memo_line`.
- `warehouse_purchase_master.products[]` becomes `fact_warehouse_purchase_line`.
- `loose_lots_purchase_master.products[]` becomes `fact_loose_lots_purchase_line`.
- `own_shape_master.products[]` becomes `fact_own_shape_line`.
- `order_return_master.products[]` becomes `fact_order_return_line`.
- Flatten one child row per array element.
- Parent key is the parent document key.
- Child technical key is `(parent_key, line_number)`, where `line_number` is the 1-based array ordinal in source order.
- Only locked child fields are projected, even if the sample contains extra child fields.

### `entries[]`

- `loose_lots_master.entries[]` becomes `fact_loose_lots_entry`.
- Child technical key is `(loose_lots_id, entry_number)`, where `entry_number` is the 1-based array ordinal.
- Only the locked fields are exposed.

### `stocks[]`

- `own_shape_order_master.stocks[]` becomes `fact_own_shape_order_line`.
- Child technical key is `(own_shape_order_id, line_number)`, where `line_number` is the 1-based array ordinal.
- `loose_lots_order_master` sample contains `stocks[]`, but no `stocks[]` field set was locked for that source, so no `fact_loose_lots_order_line` is created.

### `status_list[]`

- `loose_lots_order_master.status_list[]` becomes `fact_loose_lots_order_status`.
- `own_shape_order_master.status_list[]` becomes `fact_own_shape_order_status`.
- Child technical key is `(parent_order_id, status_number)`, where `status_number` is the 1-based array ordinal.
- Only `order_status` and `date` are exposed because those are the only locked status fields.
- `order_master` and `loose_lots_master` samples contain `status_list[]`, but no status fields were locked for those sources, so no status tables are created for them.

### `assign_sub_admin_id[]`

- `buyer_master.assign_sub_admin_id[]` becomes `bridge_buyer_sub_admin`.
- One bridge row is created per `(buyer_id, sub_admin_id)` pair.
- Duplicate pairs should be removed during ETL.

## 5. Final Reporting Columns

The lists below are the reporting columns to expose in the analytics model. Raw IDs are retained where available for traceability.

### Dimensions and Bridge

- `dim_buyer`: `buyer_id`, `company_email`, `company_name`, `created_at`, `city`, `country`
- `dim_sub_admin`: `sub_admin_id`, `created_at`, `email`, `firstname`
- `bridge_buyer_sub_admin`: `buyer_id`, `sub_admin_id`
- `dim_vendor`: `vendor_id`, `city`, `company_name`, `country`, `created_at`, `email`, `warehouse`
- `dim_warehouse`: `warehouse_id`, `warehouse_name`, `city`, `state`, `country`, `created_at`, `is_active`
- `dim_warehouse_buyer`: `warehouse_buyer_id`, `name`, `phone`, `email`, `warehouse_id`, `created_at`
- `dim_shape`: `shape_code`, `shape_name`, `shape_type`
- `dim_color`: `color_id`, `color`, `color_type`
- `dim_clarity`: `clarity_id`, `clarity`
- `dim_cut`: `cut_id`, `cut`
- `dim_polish`: `polish_id`, `polish`
- `dim_symmetry`: `symmetry_id`, `symmetry`
- `dim_size`: `size_id`, `size`, `size_from`, `size_to`
- `dim_fluorescence`: `fluorescence_id`, `fluor`
- `dim_growth`: `growth_id`, `growth`
- `dim_intensity`: `intensity_id`, `intensity`

### Fact Headers

- `fact_order_header`: `order_id`, `order_number`, `combine`, `created_at`, `buyer_id`, `shipping_charges`, `discount`, `tax`, `vat`, `total`
- `fact_memo_header`: `memo_id`, `buyer_id`, `created_at`, `from_warehouse_id`, `invoice`, `export_dubai_country_of_origin`, `export_dubai_weight`, `order_number`
- `fact_warehouse_purchase_header`: `warehouse_purchase_id`, `warehouse_buyer_id`, `created_at`
- `fact_loose_lots_header`: `loose_lots_id`, `buyer_id`, `created_at`, `confirmation`, `warehouse`
- `fact_loose_lots_order_header`: `loose_lots_order_id`, `buyer_id`, `created_at`, `loose_lots_id`, `free_shipping`, `gst`, `vat`, `total`, `invoice_dub_exp`, `invoice_dub_ldexp`, `invoice_dub_loc`, `invoice_dub_loexp`, `invoice_ind_exp`, `invoice_ind_loc`
- `fact_loose_lots_purchase_header`: `loose_lots_purchase_id`, `created_at`, `vendor_id`, `warehouseID`
- `fact_own_shape_header`: `own_shape_id`, `buyer_id`, `created_at`, `warehouse`, `price`, `gst`, `vat`, `shipping`, `total`
- `fact_own_shape_order_header`: `own_shape_order_id`, `buyer_id`, `created_at`, `own_shape_id`, `invoice_dub_exp`, `invoice_dub_ldexp`, `invoice_dub_loc`, `invoice_dub_loexp`, `invoice_ind_exp`, `invoice_ind_loc`, `gst`, `vat`, `shipping`, `total`
- `fact_order_return_header`: `order_return_key`, `buyer_id`, `created_at`, `order_at`, `discount`, `shipping_charges`, `tax`, `vat`, `total`, `warehouse_import`, `export_dubai`, `invoice`, `order_number`, `invoice_ind_loc`, `invoice_ind_exp`, `invoice_dub_loc`, `invoice_dub_ldexp`, `invoice_dub_exp`

### Fact Lines / Entries / Stocks

- `fact_order_line`: `order_id`, `line_number`, `vendor_id`, `price`, `default_price`, `qc_status`, `is_daily_deal`, `stock_no`, `shape_code`, `color_id`, `clarity_id`, `cut_id`, `polish_id`, `symmetry_id`, `size_id`, `fluorescence_id`, `growth_id`, `carat`, `lab`, `certificate_no`
- `fact_memo_line`: `memo_id`, `line_number`, `vendor_id`, `warehouse_id`, `qc_status`, `stock_no`, `shape_code`, `color_id`, `clarity_id`, `cut_id`, `polish_id`, `symmetry_id`, `size_id`, `fluorescence_id`, `growth_id`, `carat`, `lab`, `certificate_no`, `price`, `vendor_price`
- `fact_warehouse_purchase_line`: `warehouse_purchase_id`, `line_number`, `vendor_id`, `warehouse_id`, `qc_status`, `stock_no`, `shape_code`, `color_id`, `clarity_id`, `polish_id`, `symmetry_id`, `size_id`, `fluorescence_id`, `growth_id`, `carat`, `lab`, `certificate_no`, `vendor_price`
- `fact_loose_lots_entry`: `loose_lots_id`, `entry_number`, `shape`, `pointer`, `size`, `seive_size`, `total_carat`, `color`, `intensity`, `clarity`, `timeline`, `number_of_stone`, `tolerance`, `mix_seive`, `growth_type`, `cut`, `price_per_carat`
- `fact_loose_lots_purchase_line`: `loose_lots_purchase_id`, `line_number`, `shape`, `pointer`, `size`, `seive_size`, `total_carat`, `color`, `intensity`, `clarity`, `timeline`, `number_of_stone`, `tolerance`, `mix_seive`, `growth_type`, `cut`, `price_per_carat`, `negotiated_price`, `negotiated_percentage`
- `fact_own_shape_line`: `own_shape_id`, `line_number`, `stone_shape`, `carat`, `color`, `clarity`, `length`, `width`, `height`, `growth_type`, `lab`, `price`, `pcs`, `total_carat`, `order_date`, `delivery_date_request`
- `fact_own_shape_order_line`: `own_shape_order_id`, `line_number`, `shape`, `carat`, `color`, `fancy_intensity`, `fancy_overtone`, `clarity`, `sub_clarity`, `cut`, `polish`, `sym`, `fls`, `growth`, `sustainability`, `length`, `width`, `height`, `ratio`, `table_percentage`, `depth_percentage`, `price_per_carat`
- `fact_order_return_line`: `order_return_key`, `line_number`, `vendor_id`, `shape_code`, `color_id`, `clarity_id`, `cut_id`, `polish_id`, `symmetry_id`, `size_id`, `fluorescence_id`, `growth_id`, `sustainability_id`, `stock_no`, `lab`, `certificate_no`, `carat`, `fancy_intensity`, `price`, `vendor_price`

### Fact Status and Snapshot

- `fact_loose_lots_order_status`: `loose_lots_order_id`, `status_number`, `order_status`, `status_date`
- `fact_own_shape_order_status`: `own_shape_order_id`, `status_number`, `order_status`, `status_date`
- `fact_inventory`: `inventory_id`, `vendor_id`, `shape_code`, `color_id`, `clarity_id`, `cut_id`, `polish_id`, `symmetry_id`, `size_id`, `fluorescence_id`, `growth_id`, `intensity_id`, `stock_no`, `lab`, `certificate_no`, `carat`, `in_stock`, `is_verify`, `created_at`, `warehouse_id`, `hold`, `country`, `city`

## 6. Modeling Conventions

### Surrogate key strategy

- Every dimension should have an analytics surrogate primary key for warehouse storage if needed by the physical platform.
- Raw source IDs remain in dedicated columns for traceability.
- `fact_order_return_header` requires an analytics surrogate key such as `order_return_key` because `_id` was not included in the locked field list.

### Natural / business keys

- Buyer natural key: `buyer_id`
- Sub-admin natural key: `sub_admin_id`
- Vendor natural key: `vendor_id`
- Warehouse natural key: `warehouse_id`
- Warehouse-buyer natural key: `warehouse_buyer_id`
- Shape natural key: `shape_code`
- Lookup natural keys: corresponding master `_id` values (`color_id`, `clarity_id`, `cut_id`, `polish_id`, `symmetry_id`, `size_id`, `fluorescence_id`, `growth_id`, `intensity_id`)
- Stone business key: `stock_no`
- Header natural keys: source `_id` where locked; otherwise use analytics surrogate plus available business fields
- Line natural keys: `(header_key, line_number)`
- Status natural keys: `(header_key, status_number)`

### Naming conventions

- Dimensions use `dim_`
- Bridges use `bridge_`
- Facts use `fact_`
- Header tables end with `_header`
- Child arrays become `_line`, `_entry`, or `_status`
- Raw source `_id` values are normalized to entity-specific names such as `buyer_id`, `vendor_id`, `warehouse_id`, `order_id`, `memo_id`
- Nested fields are flattened to snake_case, for example `export_dubai.country_of_origin` becomes `export_dubai_country_of_origin`
- Source fields are normalized to business-safe names where required by the relationship rules:
- `order_master.user_id` -> `buyer_id`
- `order_return_master.user_id` -> `buyer_id`
- `warehouse_purchase_master.buyer_id` -> `warehouse_buyer_id`
- `loose_lots_order_master.order_id` -> `loose_lots_id`
- `own_shape_order_master.order_id` -> `own_shape_id`

### ID retention strategy

- Retain all locked raw IDs in dimensions and facts.
- Retain lookup raw IDs on facts even when readable labels are available from dimensions.
- Do not drop `shape_code`; it is both a readable business code and the required join key.
- Retain `warehouseID` on `fact_loose_lots_purchase_header` as raw only because no relationship rule was provided for it.
- Retain `sustainability_id` on `fact_order_return_line` as raw only because no master table was provided for it.

### Date field handling

- Keep all source date-time fields as timestamps in the warehouse.
- Expose date columns for BI from the timestamp fields as needed by the semantic layer.
- Do not merge different business dates. `created_at`, `order_at`, `order_date`, `delivery_date_request`, and `status_date` remain separate.

### Status handling

- Status history is modeled only where status fields are explicitly locked.
- Do not overwrite history with only the latest status.
- Latest-status reporting can be derived from the max `status_number` or latest `status_date` in the semantic layer.

### Line numbering strategy

- Use 1-based array ordinal as `line_number`, `entry_number`, or `status_number`.
- Preserve original source array order.
- Because child `_id` values were not locked for reporting, array ordinal is the required deterministic child grain.

## 7. BI Guidance

### Which tables are dimensions

- `dim_buyer`
- `dim_sub_admin`
- `dim_vendor`
- `dim_warehouse`
- `dim_warehouse_buyer`
- `dim_shape`
- `dim_color`
- `dim_clarity`
- `dim_cut`
- `dim_polish`
- `dim_symmetry`
- `dim_size`
- `dim_fluorescence`
- `dim_growth`
- `dim_intensity`
- `bridge_buyer_sub_admin` is a bridge, not a fact

### Which tables are facts

- All `fact_*` tables are facts.
- Header facts support document counts, financial totals, and high-level process analytics.
- Line/entry/stock facts support product-, stone-, and SKU-level analytics.
- `fact_inventory` is a snapshot fact for current stock position.

### Which tables should filter others

- Dimensions should filter fact tables in single direction.
- Header tables may filter their own child line/status tables in single direction.
- `dim_sub_admin` should filter buyer-based facts through `bridge_buyer_sub_admin` and then `dim_buyer`.
- `dim_warehouse_buyer` should filter `fact_warehouse_purchase_header`.
- Lookup dimensions should filter only the fact tables that actually carry their IDs.

### How to avoid ambiguous relationships

- Keep active relationships only between dimensions and facts, plus header-to-own-child tables.
- Treat fact-to-fact links as logical lineage links, not general active slicer paths in Power BI.
- Specifically keep these as inactive or semantic-only links unless a dedicated subject-area model is built:
- `fact_order_header` to `fact_memo_header` on `order_number`
- `fact_order_header` to `fact_order_return_header` on `order_number`
- `fact_loose_lots_header` to `fact_loose_lots_order_header` on `loose_lots_id`
- `fact_own_shape_header` to `fact_own_shape_order_header` on `own_shape_id`
- `fact_inventory` to stone-level transaction facts on `stock_no`
- This prevents filter loops between buyer, warehouse, vendor, and stock movement paths.

### How to support buyer-wise, sub-admin-wise, vendor-wise, warehouse-wise, and stone-wise analytics

- Buyer-wise analytics: use `dim_buyer` against buyer-linked headers and lines.
- Sub-admin-wise analytics: use `dim_sub_admin -> bridge_buyer_sub_admin -> dim_buyer -> buyer-linked facts`.
- Vendor-wise analytics: use `dim_vendor` against stone transaction lines, `fact_loose_lots_purchase_header`, and `fact_inventory`.
- Warehouse-wise analytics: use `dim_warehouse` against `fact_memo_header`, `fact_warehouse_purchase_line`, `fact_inventory`, and `dim_warehouse_buyer`.
- Stone-wise analytics: use `stock_no` across `fact_inventory`, `fact_order_line`, `fact_memo_line`, `fact_warehouse_purchase_line`, and `fact_order_return_line`.
- Loose-lots and own-shape analytics should remain in their own subject areas because they use different grains and mostly free-text product attributes.

## 8. KPI Readiness

The model is ready for the following KPI families without adding new source fields:

- Total sales: `fact_order_header.total` or line-level detail from `fact_order_line.price`
- Total purchase: `fact_warehouse_purchase_line.vendor_price` and `fact_loose_lots_purchase_line.negotiated_price` or `price_per_carat`
- Memo given: count and value from `fact_memo_header` and `fact_memo_line`
- Memo to invoice conversion: link `fact_memo_header.order_number` to `fact_order_header.order_number`; for stone-level conversion use `stock_no` between `fact_memo_line` and `fact_order_line`
- Buyer-wise sales: `dim_buyer` with `fact_order_header` and `fact_order_line`
- Sub-admin-wise sales: `dim_sub_admin` through `bridge_buyer_sub_admin` to buyer-linked sales facts
- Vendor-wise purchases: `dim_vendor` with `fact_warehouse_purchase_line` and `fact_loose_lots_purchase_header/line`
- Warehouse-wise stock: `dim_warehouse` with `fact_inventory`
- Stone movement by `Stock_No`: `fact_inventory`, `fact_order_line`, `fact_memo_line`, `fact_warehouse_purchase_line`, `fact_order_return_line`
- Return order analysis: `fact_order_return_header` and `fact_order_return_line`
- Loose lots performance: `fact_loose_lots_header`, `fact_loose_lots_entry`, `fact_loose_lots_order_header`, `fact_loose_lots_order_status`, `fact_loose_lots_purchase_header`, `fact_loose_lots_purchase_line`
- Own shape order analysis: `fact_own_shape_header`, `fact_own_shape_line`, `fact_own_shape_order_header`, `fact_own_shape_order_line`, `fact_own_shape_order_status`

## Explicit Non-Modeled Items

These items exist in samples or may look joinable, but are intentionally not modeled because they were not explicitly locked or related:

- `order_master.status_list[]`
- `loose_lots_master.status_list[]`
- `loose_lots_order_master.stocks[]`
- `vendor_master.warehouse` to `dim_warehouse`
- `loose_lots_master.warehouse` to `dim_warehouse`
- `own_shape_master.warehouse` to `dim_warehouse`
- `loose_lots_purchase_master.warehouseID` to any dimension

This keeps the analytics model compliant with the locked source contract and prevents unsupported joins.
