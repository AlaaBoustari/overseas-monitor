/* eslint-disable jsx-a11y/alt-text -- These are PDF primitives, not HTML images. */
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import path from "node:path";
import { companies, type CompanyId } from "@/lib/company-details";
import { amountInFrenchWords } from "@/lib/format/amount-in-words";
import type { DocumentType } from "@/lib/db/documents";
import { roundMoney, type LineItem } from "@/lib/db/document-calculations";

export type PdfDocumentData = {
  id: string;
  company: CompanyId;
  type: DocumentType;
  number: string | null;
  date: string;
  city: string | null;
  has_cachet: boolean;
  client_name: string;
  client_ice: string | null;
  client_address: string | null;
  line_items: LineItem[];
  tva_rate: number;
  ht: number;
  tva: number;
  ttc: number;
  period_start: string | null;
  period_end: string | null;
  devis_fuel_driver: string | null;
  devis_driver: string | null;
  devis_payment_conditions: string | null;
  devis_bank_name: string | null;
  devis_iban: string | null;
  reference_facture_number: string | null;
  motif: string | null;
  avoir_payment_method: string | null;
  avoir_payment_reference: string | null;
};

type PdfAssets = { logo: string; cachet: string | null };

const NAVY = "#07305a";
const BLUE = "#1772ba";
const LIGHT_BLUE = "#c9dff1";
const GRAY = "#f2f4f6";
const TEXT = "#20242a";
const MUTED = "#5e6670";
const RED = "#e24848";
const PAGE_HEIGHT = 841.89;
const PAGE_WIDTH = 595.28;
const PAGE_PADDING = 25.5;
const TABLE_FONT_SIZE = 9.5;
const GEIST_FONT_DIR = path.join(
  process.cwd(),
  "node_modules",
  "geist",
  "dist",
  "fonts",
  "geist-sans",
);

Font.register({
  family: "GeistPdf",
  fonts: [
    { src: path.join(GEIST_FONT_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
    { src: path.join(GEIST_FONT_DIR, "Geist-Medium.ttf"), fontWeight: 500 },
    { src: path.join(GEIST_FONT_DIR, "Geist-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(GEIST_FONT_DIR, "Geist-Bold.ttf"), fontWeight: 700 },
    {
      src: path.join(GEIST_FONT_DIR, "Geist-SemiBoldItalic.ttf"),
      fontStyle: "italic",
      fontWeight: 600,
    },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: NAVY,
    fontFamily: "GeistPdf",
    fontSize: 10.5,
    paddingHorizontal: 25.5,
    paddingTop: 25.5,
    paddingBottom: 25.5,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 154, height: 38, objectFit: "contain" },
  titleBlock: { width: 250, alignItems: "flex-end" },
  title: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  date: { marginTop: 3, fontSize: 12, fontStyle: "italic", fontWeight: 600, textAlign: "right" },
  invoiceClient: {
    alignSelf: "flex-start",
    minWidth: 227,
    maxWidth: "60%",
    minHeight: 51,
    marginTop: 12,
    border: `0.8 solid ${BLUE}`,
    borderRadius: 7.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 9,
    lineHeight: 1.375,
  },
  partyRow: { flexDirection: "row", gap: 15, marginTop: 15 },
  partyCard: {
    width: "50%",
    minHeight: 78,
    border: `0.8 solid ${BLUE}`,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    lineHeight: 1.35,
  },
  bold: { fontWeight: 700 },
  invoiceClientName: { fontSize: 10.5, fontWeight: 700 },
  smallAddress: { marginTop: 1.5, fontSize: 8.25, color: NAVY },
  detailLine: { marginTop: 1.5 },
  period: { marginTop: 13, color: RED, textAlign: "center", fontWeight: 600 },
  creditInfo: { marginTop: 13, textAlign: "center", lineHeight: 1.4 },
  table: { marginTop: 15, flexShrink: 0, fontSize: TABLE_FONT_SIZE },
  finalPageSpacer: { flexGrow: 1 },
  tableHeader: { flexDirection: "row", minHeight: 28, backgroundColor: NAVY, alignItems: "center" },
  headerText: { color: "#ffffff", fontWeight: 700, fontSize: TABLE_FONT_SIZE },
  narrowHeader: { paddingHorizontal: 0 },
  compactCell: { paddingHorizontal: 6 },
  row: {
    flexDirection: "row",
    flexShrink: 0,
    minHeight: 25,
    borderBottom: `0.6 solid ${LIGHT_BLUE}`,
    alignItems: "center",
  },
  cell: { paddingHorizontal: 9, paddingVertical: 8, color: TEXT },
  designation: { width: "40%", fontWeight: 500 },
  unit: { width: "11%", color: MUTED, textAlign: "center" },
  qty: { width: "7%", textAlign: "center" },
  vat: { width: "6%", textAlign: "center" },
  unitPrice: { width: "18%", textAlign: "right" },
  amount: { width: "18%", textAlign: "right", fontWeight: 500 },
  linePeriod: { marginTop: 3, color: BLUE, fontWeight: 600, fontSize: 6.7 },
  empty: { paddingVertical: 20, textAlign: "center", color: MUTED },
  totalsRow: { flexDirection: "row", gap: 22, marginTop: 14, alignItems: "flex-start" },
  invoiceTotalsRow: { minHeight: 110 },
  words: { width: "58%", fontSize: 10.5, fontWeight: 500, lineHeight: 1.45, color: NAVY },
  totals: { width: "42%", borderTop: `1.5 solid ${NAVY}`, paddingTop: 8 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { color: MUTED },
  totalValue: { fontWeight: 600, color: TEXT },
  grandTotalLabel: { fontWeight: 700, fontSize: 13.5, color: NAVY },
  grandTotalValue: { fontWeight: 700, fontSize: 13.5, color: NAVY },
  conditions: {
    flexDirection: "row",
    gap: 18,
    marginTop: 11,
    borderTop: `0.6 solid ${LIGHT_BLUE}`,
    paddingTop: 8,
    fontSize: 6.5,
    lineHeight: 1.35,
  },
  conditionColumn: { width: "50%" },
  payment: { marginTop: 10, borderTop: `0.6 solid ${LIGHT_BLUE}`, paddingTop: 7, lineHeight: 1.5 },
  signatures: {
    flexDirection: "row",
    gap: 18,
    minHeight: 80,
    marginTop: 8,
    borderTop: `0.6 solid ${LIGHT_BLUE}`,
    paddingTop: 7,
    fontWeight: 700,
    fontSize: 7,
  },
  signature: { position: "relative", width: "50%" },
  stamp: { position: "absolute", width: 92, height: 71, objectFit: "contain", left: 78, top: 0 },
  invoiceStamp: { position: "absolute", width: 105, height: 81, objectFit: "contain", left: 184, top: 24 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 70,
    borderTop: `2 solid ${NAVY}`,
    backgroundColor: GRAY,
    paddingHorizontal: 40,
    paddingTop: 12,
    paddingBottom: 12,
    textAlign: "center",
    fontSize: 9,
    lineHeight: 1.375,
  },
});

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

function formatPeriodDate(value: string) {
  const [, month, day] = value.split("-");
  return day && month ? `${day}/${month}` : value;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(value)
    .replace(/\u202f/g, " ") + " MAD";
}

type PageMeasurements = {
  header: number;
  tableHeader: number;
  rows: number[];
  tail: number;
  footer: number;
};

function paginate(document: PdfDocumentData, measured: PageMeasurements) {
  const items = document.line_items ?? [];
  if (items.length === 0) return [[]];
  const heights = measured.rows;
  // Use the same font/layout engine as the final PDF, not character-count guesses.
  const middle = PAGE_HEIGHT - PAGE_PADDING * 2 - measured.tableHeader - 1;
  const first = middle - measured.header - styles.table.marginTop;
  const last = middle - measured.tail - (measured.footer - PAGE_PADDING);
  const budgets = { single: last - measured.header - styles.table.marginTop, first, middle, last };
  const total = heights.reduce((sum, height) => sum + height, 0);
  if (total <= budgets.single || items.length === 1) return [items];

  const pages: LineItem[][] = [];
  let cursor = 0;
  const take = (capacity: number, leaveOne: boolean) => {
    const limit = leaveOne ? items.length - 1 : items.length;
    let end = cursor;
    let height = 0;
    while (end < limit) {
      const next = heights[end];
      if (end > cursor && height + next > capacity) break;
      height += next;
      end += 1;
    }
    return Math.max(cursor + 1, end);
  };

  let end = take(budgets.first, true);
  pages.push(items.slice(cursor, end));
  cursor = end;
  while (cursor < items.length) {
    const remainingHeight = heights.slice(cursor).reduce((sum, height) => sum + height, 0);
    if (remainingHeight <= budgets.last || cursor === items.length - 1) {
      pages.push(items.slice(cursor));
      break;
    }
    end = take(budgets.middle, true);
    pages.push(items.slice(cursor, end));
    cursor = end;
  }
  return pages;
}

function Header({ document, logo }: { document: PdfDocumentData; logo: string }) {
  const company = companies[document.company];
  const titles: Record<DocumentType, string> = {
    facture: "Facture",
    devis: "Devis",
    bon_commande: "Bon de commande",
    avoir: "Avoir",
  };
  return (
    <View id="document-header" style={{ flexShrink: 0 }}>
      <View style={styles.top}>
        <Image src={logo} style={styles.logo} />
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{titles[document.type]} N° : {document.number || "Brouillon"}</Text>
          <Text style={styles.date}>{document.city || "Casablanca"}, le {formatDate(document.date)}</Text>
        </View>
      </View>

      {document.type === "facture" ? (
        <View
          style={[
            styles.invoiceClient,
            {
              width: Math.min(
                (595.28 - 25.5 * 2) * 0.6,
                Math.max(227, 60 + (document.client_name?.length || 0) * 7.2),
              ),
            },
          ]}
        >
          <Text style={styles.invoiceClientName}>Client: {document.client_name || "Client non renseigné"}</Text>
          {document.client_address ? <Text style={styles.smallAddress}>{document.client_address}</Text> : null}
          {document.client_ice ? <Text style={styles.detailLine}>ICE : {document.client_ice}</Text> : null}
        </View>
      ) : (
        <View style={styles.partyRow}>
          <View style={styles.partyCard}>
            <Text style={styles.bold}>{document.type === "bon_commande" ? "VENDEUR :" : company.legalName}</Text>
            {document.type === "bon_commande" ? (
              <>
                <Text style={[styles.bold, styles.detailLine]}>{document.client_name || "Fournisseur non renseigné"}</Text>
                {document.client_address ? <Text style={styles.smallAddress}>{document.client_address}</Text> : null}
                {document.client_ice ? <Text style={styles.detailLine}>ICE : {document.client_ice}</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.smallAddress}>{company.address}</Text>
                <Text style={styles.detailLine}>ICE : {company.ice}</Text>
              </>
            )}
          </View>
          <View style={styles.partyCard}>
            <Text style={styles.bold}>{document.type === "bon_commande" ? "ACHETEUR :" : "CLIENT :"}</Text>
            {document.type === "bon_commande" ? (
              <>
                <Text style={[styles.bold, styles.detailLine]}>{company.legalName}</Text>
                <Text style={styles.smallAddress}>{company.address}</Text>
                <Text style={styles.detailLine}>ICE : {company.ice}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.bold, styles.detailLine]}>{document.client_name || "Client non renseigné"}</Text>
                {document.client_address ? <Text style={styles.smallAddress}>{document.client_address}</Text> : null}
                {document.client_ice ? <Text style={styles.detailLine}>ICE : {document.client_ice}</Text> : null}
              </>
            )}
          </View>
        </View>
      )}

      {(document.type === "devis" || document.type === "bon_commande") && (document.period_start || document.period_end) ? (
        <Text style={styles.period}>Période : {formatDate(document.period_start)} à {formatDate(document.period_end)}</Text>
      ) : null}
      {document.type === "avoir" ? (
        <View style={styles.creditInfo}>
          <Text style={styles.bold}>AVOIR SUR FACTURE N° {document.reference_facture_number || "-"}</Text>
          <Text style={{ color: RED, marginTop: 2 }}>Motif : {document.motif || "Non renseigné"}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Table({ document, items, first }: { document: PdfDocumentData; items: LineItem[]; first: boolean }) {
  return (
    <View style={[styles.table, !first ? { marginTop: 0 } : undefined]}>
      <View id="table-header" style={styles.tableHeader}>
        <Text style={[styles.cell, styles.designation, styles.headerText]}>{document.type === "avoir" ? "Désignation à créditer" : "Désignation"}</Text>
        <Text style={[styles.cell, styles.unit, styles.headerText, styles.compactCell]}>Unité</Text>
        <Text style={[styles.cell, styles.qty, styles.headerText, styles.narrowHeader]}>Nombre</Text>
        <Text style={[styles.cell, styles.vat, styles.headerText, styles.compactCell]}>TVA</Text>
        <Text style={[styles.cell, styles.unitPrice, styles.headerText, styles.compactCell]}>P.U. HT</Text>
        <Text style={[styles.cell, styles.amount, styles.headerText, styles.compactCell]}>Montant HT</Text>
      </View>
      {items.map((line, index) => (
        <View id={`row-${index}`} key={`${index}-${line.desc}`} style={styles.row} wrap={false}>
          <View style={[styles.cell, styles.designation]}>
            <Text>{line.desc || "Sans désignation"}</Text>
            {line.period_start && line.period_end ? (
              <Text style={styles.linePeriod}>PÉRIODE : DU {formatPeriodDate(line.period_start)} AU {formatPeriodDate(line.period_end)}</Text>
            ) : null}
          </View>
          <Text style={[styles.cell, styles.unit, styles.compactCell, fitCell(line.unit, 11)]}>{line.unit}</Text>
          <Text style={[styles.cell, styles.qty, styles.compactCell, fitCell(String(line.qty), 7)]}>{line.qty}</Text>
          <Text style={[styles.cell, styles.vat, styles.compactCell, fitCell(`${line.tva_rate ?? document.tva_rate}%`, 6)]}>{line.tva_rate ?? document.tva_rate}%</Text>
          <Text style={[styles.cell, styles.unitPrice, styles.compactCell, fitCell(formatAmount(line.unit_price), 18)]}>{formatAmount(line.unit_price)}</Text>
          <Text style={[styles.cell, styles.amount, styles.compactCell, fitCell(formatAmount(line.qty * line.unit_price), 18, 500)]}>{formatAmount(line.qty * line.unit_price)}</Text>
        </View>
      ))}
      {items.length === 0 ? <Text style={styles.empty}>Aucune ligne.</Text> : null}
    </View>
  );
}

function Totals({ document, cachet }: { document: PdfDocumentData; cachet: string | null }) {
  const company = companies[document.company];
  const breakdown = new Map<number, number>();
  for (const line of document.line_items) {
    const rate = line.tva_rate ?? document.tva_rate;
    const lineHt = roundMoney(line.qty * line.unit_price);
    const tax = roundMoney((lineHt * rate) / 100);
    breakdown.set(rate, (breakdown.get(rate) ?? 0) + tax);
  }
  return (
    <>
      <View
        style={[
          styles.totalsRow,
          document.type === "facture" ? styles.invoiceTotalsRow : undefined,
        ]}
        wrap={false}
      >
        <View style={styles.words}>
          <Text>{amountInFrenchWords(document.ttc)}</Text>
          {document.type === "facture" && document.has_cachet && cachet ? <Image src={cachet} style={styles.invoiceStamp} /> : null}
        </View>
        <View style={styles.totals}>
          <View style={styles.totalLine}><Text style={styles.totalLabel}>Total HT</Text><Text style={styles.totalValue}>{formatAmount(document.ht)}</Text></View>
          {[...breakdown.entries()].sort(([a], [b]) => a - b).map(([rate, amount]) => (
            <View key={rate} style={styles.totalLine}><Text style={styles.totalLabel}>TVA {rate}%</Text><Text style={styles.totalValue}>{formatAmount(amount)}</Text></View>
          ))}
          <View style={[styles.totalLine, { marginTop: 3 }]}><Text style={styles.grandTotalLabel}>Total TTC</Text><Text style={styles.grandTotalValue}>{formatAmount(document.ttc)}</Text></View>
        </View>
      </View>

      {document.type === "devis" ? (
        <View style={styles.conditions} wrap={false}>
          <View style={styles.conditionColumn}>
            <Text style={styles.bold}>Conditions générales de location :</Text>
            <Text style={{ marginTop: 3 }}>Tarifs établis sur la base de 9 heures d&apos;utilisation par jour (08h00 - 18h00) ; durée décomptée en jours ouvrés (lundi au samedi). Dimanches et jours fériés travaillés facturés ; tout jour dû est un jour facturé. Mobilisation et démobilisation à la charge du client sauf mention contraire. Carburant : {document.devis_fuel_driver || "Non renseigné"}. Conducteur : {document.devis_driver || "Non renseigné"}.</Text>
          </View>
          <View style={styles.conditionColumn}>
            <Text style={styles.bold}>Règlement</Text>
            <Text style={{ marginTop: 3 }}>Conditions : {document.devis_payment_conditions || "-"}</Text>
            <Text>BANK : {document.devis_bank_name || "-"}</Text>
            <Text>IBAN : {document.devis_iban || "-"}</Text>
          </View>
        </View>
      ) : null}

      {document.type === "avoir" ? (
        <View style={styles.payment} wrap={false}>
          <Text style={styles.bold}>Mode de règlement de l&apos;avoir</Text>
          <Text style={{ marginTop: 3 }}>[{document.avoir_payment_method === "deduction" ? "x" : " "}] Déduction sur facture à venir     [{document.avoir_payment_method === "virement" ? "x" : " "}] Virement     [{document.avoir_payment_method === "cheque" ? "x" : " "}] Chèque</Text>
          {document.avoir_payment_reference ? <Text>Référence : {document.avoir_payment_reference}</Text> : null}
        </View>
      ) : null}

      {document.type !== "facture" ? (
        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <Text>{document.type === "devis" ? "SIGNATURE DU FOURNISSEUR" : document.type === "bon_commande" ? "SIGNATURE DU CLIENT" : `CACHET ET SIGNATURE - ${company.signatureName}`}</Text>
            {document.has_cachet && cachet ? <Image src={cachet} style={styles.stamp} /> : null}
          </View>
          <View style={styles.signature}><Text>{document.type === "devis" ? "SIGNATURE DU CLIENT" : document.type === "bon_commande" ? "SIGNATURE DU FOURNISSEUR" : "ACCUSÉ DE RÉCEPTION - CLIENT"}</Text></View>
        </View>
      ) : null}
    </>
  );
}

function Footer({ companyId }: { companyId: CompanyId }) {
  const company = companies[companyId];
  return (
    <View id="document-footer" style={styles.footer} fixed>
      <Text>Adresse : {company.address}</Text>
      <Text style={styles.bold}>IF : {company.fiscalId}  |  RC : {company.rc}  |  TP : {company.tp}  |  ICE : {company.ice}  |  CNSS : {company.cnss}</Text>
      <Text>Tél : {company.phone}  |  Email : {company.email}</Text>
    </View>
  );
}

function DocumentPdf({ document, assets, measured }: { document: PdfDocumentData; assets: PdfAssets; measured: PageMeasurements }) {
  const pages = paginate(document, measured);
  return (
    <Document title={`${document.type}-${document.number || "Brouillon"}`} author={companies[document.company].legalName}>
      {pages.map((items, index) => {
        const first = index === 0;
        const last = index === pages.length - 1;
        return (
          <Page key={index} size="A4" wrap={false} style={[styles.page, { minHeight: PAGE_HEIGHT, maxHeight: PAGE_HEIGHT }, last ? { paddingBottom: measured.footer } : undefined]}>
            {first ? <Header document={document} logo={assets.logo} /> : null}
            <Table document={document} first={first} items={items} />
            {last ? <View style={styles.finalPageSpacer} /> : null}
            {last ? <View style={{ flexShrink: 0 }}><Totals cachet={assets.cachet} document={document} /></View> : null}
            {last ? <Footer companyId={document.company} /> : null}
          </Page>
        );
      })}
    </Document>
  );
}

function fitCell(text: string, widthPercent: number, weight = 400) {
  const font = Font.getFont({ fontFamily: "GeistPdf", fontWeight: weight }).data!;
  const textWidth = font.layout(text).advanceWidth / font.unitsPerEm;
  const available = (PAGE_WIDTH - PAGE_PADDING * 2) * widthPercent / 100 - 12 - 1;
  return { fontSize: Math.min(TABLE_FONT_SIZE, available / textWidth) };
}

type PdfLayoutNode = {
  props?: { id?: string };
  box: { height: number };
  children?: PdfLayoutNode[];
};

function measuredHeight(layout: PdfLayoutNode, id: string): number {
  if (layout.props?.id === id) return layout.box.height;
  for (const child of layout.children ?? []) {
    const height = measuredHeight(child, id);
    if (height >= 0) return height;
  }
  return -1;
}

export async function renderDocumentPdf(document: PdfDocumentData, assets: PdfAssets) {
  await Promise.all([400, 500].map((fontWeight) => Font.load({ fontFamily: "GeistPdf", fontWeight })));
  let layout: PdfLayoutNode | undefined;
  // React-PDF v4 supplies the computed layout to onRender on the server.
  // Measure once without page breaks, then render explicit A4 pages without a
  // second, conflicting automatic pagination pass.
  await renderToBuffer(
    <Document onRender={(result) => {
      layout = (result as unknown as { _INTERNAL__LAYOUT__DATA_: PdfLayoutNode })._INTERNAL__LAYOUT__DATA_;
    }}>
      <Page size="A4" wrap={false} style={styles.page}>
        <Header document={document} logo={assets.logo} />
        <Table document={document} first items={document.line_items} />
        <View id="document-tail" style={{ flexShrink: 0 }}><Totals document={document} cachet={assets.cachet} /></View>
        <Footer companyId={document.company} />
      </Page>
    </Document>,
  );
  if (!layout) throw new Error("PDF layout measurement failed");
  const height = (id: string) => {
    const value = measuredHeight(layout!, id);
    if (value < 0) throw new Error(`PDF layout measurement missing: ${id}`);
    return value;
  };
  const measured = {
    header: height("document-header"),
    tableHeader: height("table-header"),
    rows: document.line_items.map((_, index) => height(`row-${index}`)),
    tail: height("document-tail"),
    footer: height("document-footer"),
  };
  return renderToBuffer(<DocumentPdf assets={assets} document={document} measured={measured} />);
}
