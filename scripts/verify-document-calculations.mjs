import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { calculateTotals, roundMoney } = await jiti.import("../lib/db/document-calculations.ts");
const line = (qty, unit_price, tva_rate = 20) => ({ desc: "Test", unit: "Heure", qty, unit_price, tva_rate });

assert.deepEqual(calculateTotals([line(11.5, 2000), line(-2, 88), line(-1, 133)], 20), {
  ht: 22691, tva: 4538.2, ttc: 27229.2,
});
assert.deepEqual(calculateTotals([line(-0.5, 100)], 20), { ht: -50, tva: -10, ttc: -60 });
assert.equal(roundMoney(-1.005), -roundMoney(1.005));
assert.equal(roundMoney(-0.005), -0.01);
assert.equal(roundMoney(-0.001), 0);
assert.deepEqual(calculateTotals([line(2, 100), line(0.5, 50, 10)], 20), {
  ht: 225, tva: 42.5, ttc: 267.5,
});
for (const qty of [NaN, Infinity, -Infinity, "-2", null]) {
  assert.throws(() => calculateTotals([line(qty, 100)], 20), /quantity must be a finite number/);
}
assert.throws(() => calculateTotals([line(-2, -88)], 20), /unit price/);
assert.throws(() => calculateTotals([line(-2, 88, -20)], 20), /TVA rate/);

const invoice = JSON.parse(await readFile(new URL("../data/import-review/services-074-negative-quantity-correction.json", import.meta.url), "utf8"));
assert.equal(invoice.line_items.length, 29);
assert.deepEqual(calculateTotals(invoice.line_items, invoice.tva_rate), {
  ht: invoice.ht, tva: invoice.tva, ttc: invoice.ttc,
});
console.log("Negative/decimal quantities, signed rounding, price validation and invoice 074 totals passed.");
