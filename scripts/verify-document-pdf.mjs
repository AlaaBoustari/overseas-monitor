import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, alias: { "@": process.cwd() } });
const { renderDocumentPdf } = await jiti.import("../lib/pdf/document-pdf.tsx");
const { calculateTotals } = await jiti.import("../lib/db/document-calculations.ts");
const assets = { logo: `${process.cwd()}/public/logo.png`, cachet: `${process.cwd()}/public/cachet.png` };
const descriptions = [
  "-LOCATION NACELLE CISEAUX 8M (1)",
  "-MOBILISATION NACELLE CISEAUX 8M",
  "-LOCATION D’UNE NACELLE ELECTRIQUE 16M (2)",
  "-LOCATION CHARIOT TELESCOPIQUE",
];
await mkdir("tmp/pdfs", { recursive: true });
for (const type of ["facture", "devis", "bon_commande", "avoir"]) {
  for (const count of [0, 1, 24, 30, 45]) {
    const line_items = Array.from({ length: count }, (_, index) => ({
      desc: `LIGNE-${String(index + 1).padStart(3, "0")} ${descriptions[index % descriptions.length]}`,
      unit: index % 4 === 1 ? "Aller-retour" : "MOIS",
      qty: index % 3 === 0 ? 26.5 : 1,
      unit_price: count === 1 ? 28748979 : 1500,
      tva_rate: index % 3 === 0 ? 0 : 20,
      ...(index % 5 === 0 ? { period_start: "2026-08-01", period_end: "2026-08-31" } : {}),
    }));
    const document = {
      id: "pdf-regression-fixture", type, number: "073/2026/AI", date: "2026-10-07", city: "Casablanca",
      has_cachet: count !== 1, client_name: "CHINA OVERSEAS ENGINEERING CORPORATION",
      client_address: "6, AVENUE MOULAY ISMAIL, LOTIS ROCHES NOIRES, MANAZIL AL GHARB, IMMEUBLE AL GHARB CENTER, BLOC D 6EME ÉTAGE, CASABLANCA",
      client_ice: "001596313000044", line_items, tva_rate: 20, ...calculateTotals(line_items, 20),
      period_start: "2026-08-01", period_end: "2026-08-31", devis_fuel_driver: "inclus", devis_driver: "inclus",
      devis_payment_conditions: "À réception", devis_bank_name: "BANK", devis_iban: "123456789",
      reference_facture_number: "072/2026/AI", motif: "Correction de prix", avoir_payment_method: "virement", avoir_payment_reference: null,
    };
    const started = performance.now();
    const pdf = await renderDocumentPdf(document, assets);
    const file = `tmp/pdfs/${type}-${count}.pdf`;
    await writeFile(file, pdf);
    const output = JSON.parse(execFileSync(process.env.PDF_TEST_PYTHON || "python3", ["-c", "import json,sys; from pypdf import PdfReader; print(json.dumps([{'text':p.extract_text(),'width':float(p.mediabox.width),'height':float(p.mediabox.height)} for p in PdfReader(sys.argv[1]).pages]))", file], { encoding: "utf8" }));
    for (const page of output) {
      assert.ok(Math.abs(page.width - 595.28) < 0.1 && Math.abs(page.height - 841.89) < 0.1, `${file}: page is not A4`);
    }
    const pages = output.map((page) => page.text);
    const text = pages.join("\n");
    for (let index = 1; index <= count; index++) {
      const marker = `LIGNE-${String(index).padStart(3, "0")}`;
      assert.equal(text.split(marker).length - 1, 1, `${file}: missing/duplicated ${marker}`);
    }
    assert.equal(text.split("Total TTC").length - 1, 1, `${file}: missing/duplicated totals`);
    assert.ok(pages.every((page) => page.includes("LIGNE-") || (count === 0 && page.includes("Aucune ligne"))), `${file}: blank or totals-only spill page`);
    if (type === "facture" && count === 24) assert.equal(pages.length, 2, "24 long invoice rows must fit two pages");
    console.log(`${type} ${count} rows: ${pages.length} pages, ${Math.round(performance.now() - started)}ms`);
  }
}
