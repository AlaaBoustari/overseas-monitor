# Overseas Monitor

Overseas Monitor is the internal management application for Overseas Services. It centralises commercial documents, equipment records, monthly equipment time sheets, and staff access in one workspace.

## Company workspaces

After login, choose Overseas Services or Overseas Lifting. Both use the same screens,
partners, equipment catalogue, users, permissions and overtime setting. Documents,
numbering, pointages, dashboard figures and exports are separate. The company is
part of the URL (`/services/...` or `/lifting/...`), so separate tabs keep their own context.

Edit `lib/company-details.ts` to replace Lifting's temporary legal/contact/bank
details and set its cachet asset path. Its supplied logo is `public/lifting-logo.png`.
Bank details are copied into new documents; existing document bank details remain editable.

Apply `supabase/migrations/20261015000000_company_workspaces.sql` together with
this app release during a maintenance window, then reload open tabs. The old app
cannot use the company-scoped database policies. The migration assigns every old
document and pointage to Services, keeps its counters, and preserves only the exact
existing 043 invoice exception. Lifting starts at 1 per document type and year;
manual/imported numbers advance only that company's matching counter.

The server derives `x-overseas-company` from the URL and forwards it to Supabase.
Restrictive RLS policies apply that selection to reads and writes, including ID
lookups, snapshots and pointage entries. Database inserts/imports outside the app
must explicitly provide `company`; authenticated API imports must also send the
matching header. Missing context never silently defaults to Services. Cross-company
pointage/invoice links and changing a record's company are rejected.

Verify against a migrated test database with:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/company-workspaces.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/client-detail-sync.sql
```

Fixtures roll back. Numbering checks use years 2097/2098 and advance sequences;
use an isolated test database. The PDF regression script checks both companies:
`node scripts/verify-document-pdf.mjs` (requires Python with `pypdf`).
Run `node scripts/verify-company-routing.mjs` to check company navigation, header
isolation, and refusal to load data or accept writes before the migration is present.

## Modules

- **Dashboard** — current billing figures and shortcuts to authorised modules.
- **Factures** — invoice drafts, numbering, locking, payment status, printing and credit-note creation.
- **Devis** — quotation drafts, numbering, locking and printing.
- **Bons de commande** — purchase-order drafts, numbering, locking and printing.
- **Avoirs** — credit notes linked to locked invoices.
- **Pointage** — monthly equipment attendance, overtime, Excel export and invoice-draft hand-off.
- **Partenaires** — customer and supplier records, including contact details and logos.
- **Parc d’engins** — equipment records, units, rates, notes and photos.
- **Permissions** — administrator-managed module access for staff.

## Architecture

- **Next.js App Router** provides the application shell, routes and server actions.
- **Supabase** provides authentication, PostgreSQL, Row Level Security and private object storage for logos and equipment photos.
- **PostgreSQL migrations** in `supabase/migrations` define the schema, business constraints, document numbering, pointage persistence and access policies.
- **React client components** handle document editors, Pointage entry, exports and confirmation dialogs; server components load data and enforce route access.
- **Role and module permissions** control navigation, page access and mutations. Administrators manage all modules; staff receive only the modules assigned to them.

## Client detail synchronization

Apply `supabase/migrations/20261007000000_sync_document_client_details.sql` to Supabase before deploying the application changes. Saving a partner's name, ICE or address updates every document linked through `partenaire_id`, including old, locked and archived documents, in the same transaction. Document numbers, amounts and lock states are preserved. New avoirs retain the invoice's partner link, and restoring a snapshot keeps the linked partner's current details.

Manually entered documents without `partenaire_id` keep their own details; they must be explicitly linked before they can follow a partner. No automatic name matching is performed.

To verify against a migrated test database, run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/client-detail-sync.sql` as the database owner. The test rolls back all fixtures and changes.
