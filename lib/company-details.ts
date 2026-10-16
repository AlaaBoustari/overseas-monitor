export const companyIds = ["services", "lifting"] as const;
export type CompanyId = (typeof companyIds)[number];

export function isCompanyId(value: unknown): value is CompanyId {
  return value === "services" || value === "lifting";
}


export const companies = {
  services: {
    name: "Overseas Services",
    legalName: "OVERSEAS SERVICES SARL",
    signatureName: "OVERSEAS SERVICES",
    logo: "/logo.png",
    cachet: "/cachet.png" as string | null,
    address: "174, boulevard Zerktouni et Moussa Bnou Noussair, 1er étage, appartement 2, Casablanca",
    ice: "002629109000015",
    fiscalId: "47244543",
    rc: "108893",
    tp: "64260589",
    cnss: "2285065",
    phone: "+212 666 765 794",
    email: "a.sahraoui@overseasservices.ma",
    bankName: "ATTIJARIWAFA BANK",
    iban: "MA64 0071 7000 0643 2000 0003 2766",
  },
  lifting: {
    name: "Overseas Lifting",
    legalName: "OVERSEAS LIFTING",
    signatureName: "OVERSEAS LIFTING",
    logo: "/lifting-logo.png",
    cachet: null as string | null,
    address: "174, BDZerktouni et Moussa Bnou Noussair, étage1,Apt2,Casablanca",
    ice: "003654969000048",
    fiscalId: "66192447",
    rc: "657331",
    tp: "35555503",
    cnss: "2285065",
    phone: "+212 666 765 794",
    email: "a.sahraoui@overseasservices.ma",
    bankName: "ATTIJARIWAFA BANK",
    iban: "MA64 0071 7000 0643 2000 0003 2766",
  },
} satisfies Record<CompanyId, Record<string, string | null>>;

export function companyPath(company: CompanyId, path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === "/login" || path === "/companies" || /^\/(services|lifting)(\/|$)/.test(path)) return path;
  return `/${company}${path}`;
}
