import { getCompany } from "@/lib/company-server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { safePrintName } from "@/lib/print-title";
import { renderDocumentPdf, type PdfDocumentData } from "@/lib/pdf/document-pdf";
import { createClient } from "@/lib/supabase/server";
import { companies, type CompanyId } from "@/lib/company-details";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOCUMENT_KINDS = {
  facture: { type: "facture", label: "Facture" },
  devis: { type: "devis", label: "Devis" },
  avoir: { type: "avoir", label: "Avoir" },
  "bon-commande": {
    type: "bon_commande",
    label: "Bon-de-commande",
  },
} as const;

type DocumentKind = keyof typeof DOCUMENT_KINDS;

function isDocumentKind(value: string): value is DocumentKind {
  return value in DOCUMENT_KINDS;
}

export async function GET(
  _request: Request,
  context: RouteContext<"/[company]/api/documents/[kind]/[id]/pdf">,
) {
  const { kind, id } = await context.params;
  if (!isDocumentKind(kind)) {
    return new Response("Type de document inconnu.", { status: 404 });
  }

  const definition = DOCUMENT_KINDS[kind];
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return new Response("Authentification requise.", { status: 401 });
  }

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, company, type, number, date, city, has_cachet, client_name, client_ice, client_address, line_items, tva_rate, ht, tva, ttc, period_start, period_end, devis_fuel_driver, devis_driver, devis_payment_conditions, devis_bank_name, devis_iban, reference_facture_number, motif, avoir_payment_method, avoir_payment_reference").eq("company", await getCompany())
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return new Response("Impossible de charger le document.", { status: 500 });
  }
  if (!document || document.type !== definition.type) {
    return new Response("Document introuvable.", { status: 404 });
  }

  try {
    const company = companies[document.company as CompanyId];
    const [logo, cachet] = await Promise.all([
      readFile(path.join(process.cwd(), "public", company.logo)),
      company.cachet ? readFile(path.join(process.cwd(), "public", company.cachet)) : null,
    ]);
    const pdf = await renderDocumentPdf(document as PdfDocumentData, {
      logo: `data:image/png;base64,${logo.toString("base64")}`,
      cachet: cachet ? `data:image/png;base64,${cachet.toString("base64")}` : null,
    });

    const identifier = document.number || `Brouillon-${document.client_name}`;
    const filename = `${safePrintName(`${definition.label}-${identifier}`)}.pdf`;

    return new Response(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (pdfError) {
    console.error("PDF generation failed", pdfError);
    return new Response("La génération du PDF a échoué.", { status: 500 });
  }
}
