"use client";

import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import { companyPath, type CompanyId } from "@/lib/company-details";

const CompanyContext = createContext<CompanyId | null>(null);

export function CompanyProvider({ company, children }: { company: CompanyId; children: ReactNode }) {
  return <CompanyContext.Provider value={company}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const company = useContext(CompanyContext);
  if (!company) throw new Error("Company context is required.");
  return company;
}

export default function CompanyLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const company = useCompany();
  const scopedHref = typeof href === "string"
    ? companyPath(company, href)
    : { ...href, pathname: href.pathname ? companyPath(company, href.pathname) : href.pathname };
  return <NextLink {...props} href={scopedHref} />;
}

export function useRouter() {
  const company = useCompany();
  const router = useNextRouter();
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(companyPath(company, href), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(companyPath(company, href), options),
  }), [company, router]);
}

export function usePathname() {
  const company = useCompany();
  return useNextPathname().replace(new RegExp(`^/${company}(?=/|$)`), "") || "/";
}
