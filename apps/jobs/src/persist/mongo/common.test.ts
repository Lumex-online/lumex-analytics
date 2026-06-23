import assert from "node:assert/strict";
import test from "node:test";
import { sourceTableForRow } from "./common.js";

test("sourceTableForRow maps sales product types to source collections", () => {
  assert.equal(
    sourceTableForRow({ sourceType: "sales", productType: "stone" }),
    "order_master"
  );
  assert.equal(
    sourceTableForRow({ sourceType: "sales", productType: "loose_lot" }),
    "loose_lots_order_master"
  );
  assert.equal(
    sourceTableForRow({ sourceType: "sales", productType: "own_shape" }),
    "own_shape_order_master"
  );
});

test("sourceTableForRow maps memo and purchase product types to source collections", () => {
  assert.equal(
    sourceTableForRow({ sourceType: "memo", productType: "memo" }),
    "memo_master"
  );
  assert.equal(
    sourceTableForRow({ sourceType: "purchase", productType: "purchase_loose_lot" }),
    "loose_lots_purchase_master"
  );
  assert.equal(
    sourceTableForRow({ sourceType: "purchase", productType: "purchase_stone" }),
    "warehouse_purchase_master"
  );
});
