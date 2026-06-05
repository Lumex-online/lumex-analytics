# Lumex.online Executive Dashboard Design

This document defines a single executive-level dashboard for Lumex.online using the current analytics model and locked source rules. The design follows a top-to-bottom storytelling flow so leadership can move from headline performance to trend, mix, operational health, and risk.

## 1. Final Dashboard Layout

The dashboard should be one scrollable page with nine sections in this order:

1. Global filter bar
2. Top KPI bar
3. Sales trend
4. Revenue distribution
5. Inventory and stock movement
6. Memo and conversion analysis
7. Buyer and sub-admin performance
8. SKU / stone performance
9. Purchase, QC, and return risk

### Page Story

- Start with "What happened?"
- Then show "Where is it happening?"
- Then show "What is moving through the pipeline?"
- Then show "Who is driving it?"
- End with "What needs attention now?"

## 2. Recommended Global Filters

These filters should stay pinned at the top and apply consistently across the page:

- `Date Range`
- `Warehouse`
- `Buyer`
- `Sub-admin`
- `Vendor`

### Filter Behavior

- Default date filter: current month with comparison to previous equal-length period
- `Warehouse` should filter inventory, memo, and warehouse-related sales views
- `Buyer` should filter buyer-linked sales, memo, own-shape, loose-lots, and return views
- `Sub-admin` should filter through `bridge_buyer_sub_admin`
- `Vendor` should filter purchase, inventory, stone-level sales, memo, and return views

## 3. Section-Wise Dashboard Design

## Section 1. Top KPI Bar

Purpose: give leadership a 15-second read on commercial performance.

| KPI card | Metric | Comparison | Business question answered | Notes |
|---|---|---|---|---|
| Total Sales | Sum of `fact_order_header.total`, excluding double count from combined orders | % change vs previous period | How much did we sell in the selected period? | Use header-level total for executive view |
| Total Purchase | Sum of purchase value from `fact_warehouse_purchase_line.vendor_price` and loose-lots purchase value from `fact_loose_lots_purchase_line.negotiated_price` or `price_per_carat * total_carat` | % change vs previous period | How much did we buy in the selected period? | Keep stone and loose-lots logic aligned in metric definition |
| Net Revenue | `Total Sales - Total Returns` | % change vs previous period | What revenue remains after returns? | Returns sourced from `fact_order_return_header.total` |
| Avg Order Value | `Total Sales / distinct order_count` | % change vs previous period | Are we growing through more orders or bigger orders? | Use distinct `order_id` at header grain |
| Memo Conversion % | `Converted memos / total memos` | % change vs previous period | Are memos turning into revenue efficiently? | Use `order_number` and `stock_no` linkage |
| Return % | `Total Returns / Total Sales` | % change vs previous period | How much revenue risk is coming back? | Use value-based ratio for executive view |
| Total Buyers | Distinct count of buyers in `dim_buyer` | % change vs previous period or prior month-end | Is the active buyer base expanding? | Clarify whether this is all buyers or filtered buyers |
| Verified Buyers | Count of buyers where `buyer_master.is_verify = true` | % change vs previous period or prior month-end | Is the qualified buyer base improving? | Current dependency: `is_verify` is not present in the locked buyer analytics model and must be added before this card can go live |

### Visual Design

- Single horizontal KPI bar
- 8 cards in two rows of 4 on medium screens, one row on large screens
- Each card should show:
- current value
- previous-period arrow
- % delta
- tiny trend sparkline for the last 12 periods where practical

### Alerts on KPI Bar

- Sales down more than 15% vs previous period
- Net revenue down while sales are flat or up
- Return % above threshold
- Memo conversion % below threshold

## Section 2. Sales Trend

Purpose: show growth momentum and timing.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Sales over time | Line chart with toggle for daily / weekly / monthly | Sum of `fact_order_header.total` by selected time grain | Is revenue growing, flattening, or dropping? |
| Returns overlay | Secondary line or shaded band | Sum of `fact_order_return_header.total` by selected time grain | Are return spikes offsetting sales momentum? |

### Design Notes

- Default grain should auto-switch:
- daily for short ranges
- weekly for medium ranges
- monthly for long ranges
- Add a comparison line for previous period
- Add anomaly markers on unusual spikes or drops

### Alerts

- Sales spike > 2 standard deviations from trailing average
- 3-period downward streak
- Return spike on same period as sales dip

## Section 3. Revenue Distribution

Purpose: show where money and customer concentration sit.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Sales by Warehouse | Sorted horizontal bar | Sum of `fact_order_header.total`, sliced by warehouse-related sales attribution | Which warehouses are driving revenue? |
| Sales by Vendor | Sorted horizontal bar | Sum of `fact_order_line.price` by `vendor_id` | Which vendors are tied to sold stones? |
| Sales by Buyer | Sorted horizontal bar | Sum of `fact_order_header.total` or `fact_order_line.price` by `buyer_id` | Which buyers contribute the most revenue? |
| Orders by Country | Donut chart | Distinct order count grouped by buyer country | Where are orders coming from geographically? |
| Buyers by Country | Donut chart | Distinct buyer count by buyer country | Where is our buyer base concentrated? |
| Vendors by Country | Donut chart | Distinct vendor count by vendor country | Are we concentrated on a narrow supplier geography? |

### Design Notes

- Use Top 10 bars with an "Others" bucket
- Place the three bar charts in one row and the three donuts below them
- Show contribution % labels on bars

### Alerts

- Top 3 buyers > 60% of sales
- Top 3 vendors > 60% of sold value
- One country dominating orders beyond concentration threshold

## Section 4. Inventory and Stock Movement

Purpose: show stock health and lifecycle efficiency.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| In Stock Stones | KPI card | Count of `fact_inventory.stock_no` where `in_stock = true` | How much saleable stock do we currently hold? |
| Verified Stones | KPI card | Count of `fact_inventory.stock_no` where `is_verify = true` | How much of inventory is verified and ready? |
| Inventory by Warehouse | Bar chart | Count of in-stock stones by `warehouse_id` | Where is stock sitting? |
| Inventory Aging | Column chart with aging buckets | Count of in-stock stones by `today - fact_inventory.created_at` bucket | How much stock is aging and slowing down? |
| Stock Movement Funnel | Funnel chart | Distinct `stock_no` across stages: Inventory -> Memo -> Order -> Return | How efficiently are stones moving through the lifecycle? |

### Recommended Aging Buckets

- `0-30 days`
- `31-60 days`
- `61-90 days`
- `91-180 days`
- `180+ days`

### Movement Funnel Logic

- Inventory stage: distinct `stock_no` in `fact_inventory`
- Memo stage: distinct `stock_no` in `fact_memo_line`
- Order stage: distinct `stock_no` in `fact_order_line`
- Return stage: distinct `stock_no` in `fact_order_return_line`

### Alerts

- `180+ days` bucket exceeds threshold
- Verified stones ratio falls
- Memo volume rises but order conversion does not

## Section 5. Memo and Conversion Analysis

Purpose: diagnose memo leakage and sales effectiveness.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Memo to Order Conversion | Funnel chart | Distinct memo count -> distinct converted memo count | How much memo activity turns into orders? |
| Conversion % by Buyer | Ranked bar | `converted memo count / total memo count` by buyer | Which buyers convert memos well and which leak? |
| Conversion % by Warehouse | Ranked bar | `converted memo count / total memo count` by warehouse | Which warehouse-led memo flow is most effective? |

### Conversion Logic

- Header-level conversion: `fact_memo_header.order_number` linked to `fact_order_header.order_number`
- Stone-level validation: `fact_memo_line.stock_no` linked to `fact_order_line.stock_no`
- Executive scorecard should prefer header-level conversion with stone-level drillthrough

### Alerts

- Memo conversion % below target
- High-memo buyers with low conversion
- Warehouse with growing memo count but falling conversion

## Section 6. Buyer and Sub-Admin Performance

Purpose: show who is driving sales and relationship performance.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Sales by Buyer | Ranked horizontal bar | Sum of sales by buyer | Which buyers matter most right now? |
| Sales by Sub-admin | Ranked horizontal bar | Sum of buyer-linked sales rolled up through `bridge_buyer_sub_admin` | Which sub-admin portfolios are producing revenue? |
| Buyer Contribution % | Pareto chart | Buyer sales share and cumulative contribution % | How concentrated is sales among top buyers? |

### Design Notes

- Show Top 15 buyers by default
- Pareto should include cumulative 80% line
- Add drillthrough from sub-admin to buyer portfolio detail

### Alerts

- One buyer contribution jumps sharply
- Sub-admin portfolio underperforms despite large buyer base
- Sales concentration exceeds target threshold

## Section 7. SKU / Stone Performance

Purpose: show what product mix sells.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Attribute Demand Matrix | Heatmap / matrix | Sales value or stone count by `Shape x Size x Color x Clarity` | Which combinations are in demand? |
| Top Selling Combinations | Horizontal bar | Top attribute combinations by sales value and sold stone count | What exact mix should inventory planning prioritize? |

### Design Notes

- Use `fact_order_line` with lookup joins:
- `shape_code -> dim_shape.shape_name`
- `size_id -> dim_size.size`
- `color_id -> dim_color.color`
- `clarity_id -> dim_clarity.clarity`
- Default heatmap measure: sold stone count
- Toggle to sales value

### Alerts

- Fast-selling combinations with low current inventory
- High inventory in combinations with low demand

## Section 8. Purchase and Vendor Analysis

Purpose: assess supply efficiency, sourcing dependence, and quality.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Purchase vs Sales by Vendor | Dual bar chart | Purchase value vs sold value by vendor | Which vendors are yielding commercial performance and which are overstocked? |
| QC Status Distribution | Stacked bar or donut | Count of stones by `qc_status` | Are quality issues building up in the inbound flow? |

### Design Notes

- Purchase side should use `fact_warehouse_purchase_line.vendor_price`
- Sales side should use `fact_order_line.price`
- QC distribution should combine line-level purchase and memo/order records only if the business signs off on a unified QC view; otherwise default to purchase-side QC

### Alerts

- Vendor purchase up while sales contribution is down
- High pending or failed QC share
- Vendor dependence exceeding threshold

## Section 9. Return and Risk Analysis

Purpose: end the story with risk exposure and corrective action areas.

| Insight | Chart type | Metric | Business question answered |
|---|---|---|---|
| Return % by Buyer | Ranked bar | `return value / sales value` by buyer | Which buyers create disproportionate return risk? |
| Return % by Vendor | Ranked bar | `return value / sold value` by vendor | Which vendors are linked to more return exposure? |
| Return % by Warehouse | Ranked bar | `return value / sales value` by warehouse | Which operating locations show elevated risk? |

### Alerts

- Buyer return % above threshold
- Vendor return % above threshold
- Warehouse return % rising for 2 or more periods

## 4. Metrics Used in the Dashboard

### Executive Metrics

- `Total Sales`
- `Total Purchase`
- `Net Revenue`
- `Avg Order Value`
- `Memo Conversion %`
- `Return %`
- `Total Buyers`
- `Verified Buyers`

### Operational Metrics

- `In Stock Stones`
- `Verified Stones`
- `Inventory Turnover = Sold Stones / Total Inventory`
- `Stock Aging = Today - inventory.created_at`
- `Buyer Contribution % = Buyer Sales / Total Sales`
- `QC Status Distribution`

## 5. Calculation Guardrails

### Avoiding Double Counting

- Use header tables for headline totals and order counts.
- Use line tables for vendor, SKU, and stone-level analysis.
- Exclude or carefully handle `fact_order_header.combine` logic in sales totals so combined orders are not counted twice.
- Do not sum header totals and line prices together in the same metric.
- Use distinct `stock_no` for stone movement and lifecycle analytics.

### Grain Rules

- Sales KPIs: header grain
- Buyer, vendor, SKU, QC, and stone analysis: line grain
- Inventory and stock health: inventory snapshot grain
- Memo conversion: header link first, stone link second

## 6. Recommended Alerts and Anomaly Indicators

These should appear as small badges or callout strips above the relevant section.

### Commercial Alerts

- Sales down more than 15% vs previous period
- Avg order value down more than 10%
- Top buyer concentration above 40%
- Net revenue negative trend for 3 consecutive periods

### Operational Alerts

- Aging stock in `180+ days` above threshold
- Verified stone ratio below threshold
- QC pending share above threshold
- Warehouse stock imbalance beyond target

### Conversion Alerts

- Memo conversion % below target
- Buyer with high memo volume and low conversion
- Warehouse with memo leakage

### Risk Alerts

- Return % above target
- Buyer return spike
- Vendor return spike
- Country or vendor concentration risk

## 7. Final Executive Storytelling Flow

The final page should read like this:

1. We start with headline business health through KPI cards.
2. We show whether momentum is improving or weakening in the sales trend.
3. We reveal where revenue is concentrated across warehouse, vendor, buyer, and geography.
4. We explain whether inventory is healthy and whether stones are moving efficiently.
5. We diagnose whether memo activity is turning into actual orders.
6. We identify which buyers and sub-admin portfolios are truly driving the business.
7. We show what stone combinations are winning in the market.
8. We evaluate whether sourcing quality and vendor economics are strong.
9. We finish with return and risk hotspots so leadership knows where to intervene.

## 8. Implementation Notes

- Best dashboard canvas: one-page executive report with drillthrough pages for buyer, vendor, warehouse, and stone detail
- Default visuals should prioritize:
- clean typography
- limited colors
- only one highlight color for exceptions
- neutral palette for baseline comparison
- All charts should support cross-filtering, but only from left to right in the storytelling flow where possible
- Keep the page to 14-18 visuals total including KPI cards

## 9. Open Dependency

`Verified Buyers` is requested as a top KPI, but `buyer_master.is_verify` is not currently present in the locked buyer analytics model defined in [lumex-final-analytics-data-model.md](/mnt/c/Users/lumex/Documents/Analytics/analytics_minimal/docs/data-model/lumex-final-analytics-data-model.md). To activate this KPI, that field must be added to the approved buyer dimension contract.
