import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { companyPath, isCompanyId } from "@/lib/company-details";

export async function getCompany() {
  const company = (await headers()).get("x-overseas-company");
  if (!isCompanyId(company)) notFound();
  return company;
}

export async function redirectToCompany(path: string): Promise<never> {
  redirect(companyPath(await getCompany(), path));
}
