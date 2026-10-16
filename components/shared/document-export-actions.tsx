"use client";

import { companyPath } from "@/lib/company-details";
import { useCompany } from "@/components/shared/company-navigation";
import { useSyncExternalStore } from "react";
import { Download, Printer } from "lucide-react";

const actionClassName =
  "rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-sm";

const subscribeToDevice = () => () => {};
const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function DocumentExportActions({
  kind,
  documentId,
  onBrowserPrint,
  pdfDisabled = false,
  pdfDisabledTitle = "Enregistrez les modifications avant de télécharger le PDF",
}: {
  kind: "facture" | "devis" | "avoir" | "bon-commande";
  documentId: string;
  onBrowserPrint: () => void;
  pdfDisabled?: boolean;
  pdfDisabledTitle?: string;
}) {
  const mobilePrint = useSyncExternalStore(subscribeToDevice, isMobileDevice, () => false);
  const pdfUrl = companyPath(useCompany(), `/api/documents/${kind}/${documentId}/pdf`);
  return (
    <>
      {pdfDisabled ? (
        <button
          className={`${actionClassName} cursor-not-allowed opacity-50`}
          disabled
          title={pdfDisabledTitle}
          type="button"
        >
          <Download className="mr-2 inline" size={16} />
          Télécharger en PDF
        </button>
      ) : (
        <a
          className={actionClassName}
          href={pdfUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Download className="mr-2 inline" size={16} />
          Télécharger en PDF
        </a>
      )}
      {mobilePrint && !pdfDisabled ? (
        <a
          className={actionClassName}
          href={pdfUrl}
          rel="noopener noreferrer"
          target="_blank"
          title="Ouvrir le PDF A4, puis utiliser Imprimer dans le lecteur PDF"
        >
          <Printer className="mr-2 inline" size={16} />
          Imprimer
        </a>
      ) : (
        <button
          className={`${actionClassName} ${mobilePrint && pdfDisabled ? "cursor-not-allowed opacity-50" : ""}`}
          disabled={mobilePrint && pdfDisabled}
          onClick={onBrowserPrint}
          title={mobilePrint && pdfDisabled ? "Enregistrez les modifications avant d’imprimer le PDF" : undefined}
          type="button"
        >
          <Printer className="mr-2 inline" size={16} />
          Imprimer
        </button>
      )}
    </>
  );
}
