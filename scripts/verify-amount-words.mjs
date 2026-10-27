import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, alias: { "@": process.cwd() } });
const { documentDraftSignature } = await jiti.import("../components/shared/use-unsaved-document.ts");
const document = {
  company: "services", number: "001/2026/AI", date: "2026-10-27", city: "Casablanca",
  client_name: "Test", client_ice: "TEST", client_address: null, partenaire_id: null,
  devis_fuel_driver: "inclus", devis_driver: "inclus", devis_payment_conditions: "À réception",
  devis_bank_name: "BANK", devis_iban: "TEST", reference_facture_number: "001/2026/AI",
  motif: "Correction", avoir_payment_method: "virement", avoir_payment_reference: null,
};
const lineItems = [{ desc: "Test", unit: "Jour", qty: 1, unit_price: 100, tva_rate: 20 }];
const props = {
  document, lineItems, totals: { ht: 100, tva: 20, ttc: 120 }, tvaRate: 20,
  tvaBreakdown: [{ rate: 20, amount: 20 }], hasCachet: true,
  amountWords: "Arrêté le présent document à la somme de cent vingt dirhams", pageKind: "single",
};
for (const [file, name] of [["invoice", "InvoicePage"], ["devis", "DevisPage"], ["bon-commande", "BonCommandePage"], ["avoir", "AvoirPage"]]) {
  const pageModule = await jiti.import(`../components/shared/${file}-page.tsx`);
  const page = pageModule[name];
  assert.ok(page, name);
  const visible = JSON.stringify(page(props));
  const hidden = JSON.stringify(page({ ...props, document: { ...document, show_amount_words: false } }));
  assert.ok(visible.includes('"visibility":"visible"'));
  assert.ok(hidden.includes('"visibility":"hidden"'));
  assert.equal(hidden.replace('"visibility":"hidden"', '"visibility":"visible"'), visible, `${file}: hiding words changed the print/preview element tree`);
}
assert.notEqual(
  documentDraftSignature({ ...document, show_amount_words: true }, lineItems, 20, "Casablanca", true),
  documentDraftSignature({ ...document, show_amount_words: false }, lineItems, 20, "Casablanca", true),
  "The toggle must mark the document as unsaved",
);
console.log("All four preview/print layouts are identical apart from text visibility; toggle state and unsaved changes verified.");
