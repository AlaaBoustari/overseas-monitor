import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJiti } from "jiti";
import { NextRequest } from "next/server.js";

// Exercise the real proxy with a controlled auth/schema boundary, without cloud writes.
const temporary = await mkdtemp(path.join(os.tmpdir(), "overseas-routing-"));
try {
  const fixture = path.join(temporary, "supabase-ssr.mjs");
  await writeFile(fixture, "export function createServerClient() { return globalThis.__companyRoutingClient; }");
  const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd(), "@supabase/ssr": fixture } });
  const { updateSession } = await jiti.import("../lib/supabase/middleware.ts");
  const { companyPath, isCompanyId } = await jiti.import("../lib/company-details.ts");
  let signedIn = true;
  let migrated = true;
  globalThis.__companyRoutingClient = {
    auth: { getClaims: async () => ({ data: { claims: signedIn ? { sub: "test-user" } : null } }) },
    from(table) {
      assert.equal(table, "documents");
      return { select(column) {
        assert.equal(column, "company");
        return { limit: async (limit) => {
          assert.equal(limit, 0);
          return { error: migrated ? null : { code: "42703" } };
        } };
      } };
    },
  };
  const request = (url, method = "GET") => new NextRequest(`http://localhost:3007${url}`, {
    method, headers: { "x-overseas-company": "lifting" },
  });

  assert.equal(companyPath("services", "/factures?drafts=mine"), "/services/factures?drafts=mine");
  assert.equal(companyPath("lifting", "/api/reports/factures.xlsx"), "/lifting/api/reports/factures.xlsx");
  assert.equal(companyPath("lifting", "/companies"), "/companies");
  assert.equal(companyPath("services", "/lifting/dashboard"), "/lifting/dashboard");
  assert.equal(isCompanyId("unknown"), false);

  for (const company of ["services", "lifting"]) {
    const response = await updateSession(request(`/${company}/dashboard`));
    assert.equal(response.headers.get("x-middleware-request-x-overseas-company"), company, "URL must override spoofed company header");
  }
  const selection = await updateSession(request("/companies"));
  assert.equal(selection.headers.get("x-middleware-request-x-overseas-company"), null);
  assert.equal(new URL((await updateSession(request("/login"))).headers.get("location")).pathname, "/companies");
  assert.equal(new URL((await updateSession(request("/dashboard"))).headers.get("location")).pathname, "/companies");

  migrated = false;
  for (const company of ["services", "lifting"]) {
    const response = await updateSession(request(`/${company}/dashboard`));
    assert.equal(new URL(response.headers.get("x-middleware-rewrite")).pathname, "/company-setup");
    assert.equal((await updateSession(request(`/${company}/factures`, "POST"))).status, 503);
    assert.equal((await updateSession(request(`/${company}/api/reports/factures.xlsx`))).status, 503);
  }
  signedIn = false;
  assert.equal(new URL((await updateSession(request("/lifting/dashboard"))).headers.get("location")).pathname, "/login");
  console.log("Company routing, header isolation and missing-migration checks passed.");
} finally {
  delete globalThis.__companyRoutingClient;
  await rm(temporary, { recursive: true, force: true });
}
