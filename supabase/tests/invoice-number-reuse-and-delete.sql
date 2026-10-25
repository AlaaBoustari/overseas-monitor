-- Run as postgres against an isolated migrated TEST database, ON_ERROR_STOP=1.
begin;
insert into auth.users (id, email) values
  ('95000000-0000-0000-0000-000000000001', 'invoice-admin@example.test'),
  ('95000000-0000-0000-0000-000000000002', 'invoice-staff@example.test');
update public.profiles set role = 'superadmin'
where id = '95000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '95000000-0000-0000-0000-000000000001';

do $$ declare c text; draft uuid; base uuid; n text; begin
  foreach c in array array['services', 'lifting'] loop
    perform set_config('request.headers', jsonb_build_object('x-overseas-company', c)::text, true);
    insert into public.documents (type, number, date, created_by)
    values ('facture', '005/2095/AI', '2095-01-01', auth.uid()) returning id into base;
    -- The old sequence has already issued 6 and 7. Its history must be ignored.
    perform public.next_document_number('facture', 2095);
    perform public.next_document_number('facture', 2095);
    insert into public.documents (type, date, created_by)
    values ('facture', '2095-01-01', auth.uid()) returning id into draft;
    perform public.assign_facture_number(draft);
    select number into n from public.documents where id = draft;
    if n <> '006/2095/AI' then raise exception '% expected 6, got %', c, n; end if;
    -- Repeated assignment of the same invoice never consumes another number.
    perform public.assign_facture_number(draft);
    update public.documents set number = 'NAN', is_active = false where id = draft;
    insert into public.documents (type, date, created_by)
    values ('facture', '2095-01-01', auth.uid()) returning id into draft;
    perform public.assign_facture_number(draft);
    select number into n from public.documents where id = draft;
    if n <> '006/2095/AI' then raise exception '% freed 6 was skipped: %', c, n; end if;
    -- An archived numbered invoice still reserves its number.
    update public.documents set is_active = false where id = draft;
    insert into public.documents (type, date, created_by)
    values ('facture', '2095-01-01', auth.uid()) returning id into draft;
    perform public.assign_facture_number(draft);
    select number into n from public.documents where id = draft;
    if n <> '007/2095/AI' then raise exception '% expected 7, got %', c, n; end if;
    -- Active invoices cannot be permanently deleted, including direct API calls.
    delete from public.documents where id = draft;
    if found then raise exception 'Active invoice deleted'; end if;
    insert into public.document_snapshots (document_id, snapshot, created_by)
    values (draft, '{}', auth.uid());
    update public.documents set is_active = false where id = draft;
    delete from public.documents where id = draft;
    if not found then raise exception 'Inactive invoice not deleted'; end if;
    reset role;
    if exists (select 1 from public.document_snapshots where document_id = draft) then
      raise exception 'Deleted invoice left snapshots'; end if;
    set local role authenticated;
    -- Permanent deletion also frees 7; it must not become 8.
    insert into public.documents (type, date, created_by)
    values ('facture', '2095-01-01', auth.uid()) returning id into draft;
    perform public.assign_facture_number(draft);
    select number into n from public.documents where id = draft;
    if n <> '007/2095/AI' then raise exception '% freed 7 was skipped: %', c, n; end if;
    -- Manual/imported numbers and /BIS count; NAN never counts. No 3-digit truncation.
    insert into public.documents (type, number, date, created_by)
    values ('facture', '999/2095/AI/BIS', '2095-01-01', auth.uid());
    insert into public.documents (type, date, created_by)
    values ('facture', '2095-01-01', auth.uid()) returning id into draft;
    perform public.assign_facture_number(draft);
    if (select number from public.documents where id = draft) <> '1000/2095/AI' then
      raise exception 'Import or large number ignored'; end if;
    insert into public.documents (type, date, created_by)
    values ('facture', '2096-01-01', auth.uid()) returning id into draft;
    perform public.assign_facture_number(draft);
    if (select number from public.documents where id = draft) <> '001/2096/AI' then
      raise exception 'Years mixed'; end if;
    -- Manual-only and locked drafts stay protected even through direct RPC calls.
    insert into public.documents (type, date, created_by, manual_number_only)
    values ('facture', '2095-01-01', auth.uid(), true) returning id into draft;
    begin
      perform public.assign_facture_number(draft);
      raise exception 'Manual-only invoice auto-numbered';
    exception when invalid_parameter_value then null; end;
    update public.documents set manual_number_only = false, is_locked = true where id = draft;
    begin
      perform public.assign_facture_number(draft);
      raise exception 'Locked invoice auto-numbered';
    exception when invalid_parameter_value then null; end;
    update public.documents set is_locked = false, is_active = false where id = draft;
    begin
      perform public.assign_facture_number(draft);
      raise exception 'Inactive invoice auto-numbered';
    exception when invalid_parameter_value then null; end;
    insert into public.documents (type, created_by)
    values ('devis', auth.uid()) returning id into draft;
    begin
      perform public.assign_facture_number(draft);
      raise exception 'Non-invoice auto-numbered as invoice';
    exception when no_data_found then null; end;
  end loop;
end $$;

-- Deleting an archived Pointage invoice preserves the sheet and its replacement.
do $$ declare c text; sheet uuid; old_invoice uuid; replacement uuid; begin
  foreach c in array array['services', 'lifting'] loop
    perform set_config('request.headers', jsonb_build_object('x-overseas-company', c)::text, true);
    insert into public.pointage_sheets (client_name, ym)
    values ('Invoice deletion test', '2092-01') returning id into sheet;
    insert into public.documents (type, source_pointage_sheet_id, created_by)
    values ('facture', sheet, auth.uid()) returning id into old_invoice;
    update public.documents set is_active = false where id = old_invoice;
    insert into public.documents (type, source_pointage_sheet_id, created_by)
    values ('facture', sheet, auth.uid()) returning id into replacement;
    delete from public.documents where id = old_invoice;
    if not found or (select facture_id from public.pointage_sheets where id = sheet) is distinct from replacement then
      raise exception 'Permanent deletion damaged the Pointage or its replacement invoice'; end if;
  end loop;
end $$;

-- Foreign-company IDs and staff without invoice rights cannot mutate invoices.
set local request.headers = '{"x-overseas-company":"lifting"}';
do $$ declare foreign_id uuid; begin
  reset role;
  select id into foreign_id from public.documents
  where company = 'services' and number = '006/2095/AI';
  set local role authenticated;
  delete from public.documents where id = foreign_id;
  if found then raise exception 'Cross-company deletion succeeded'; end if;
  begin
    perform public.assign_facture_number(foreign_id);
    raise exception 'Cross-company numbering succeeded';
  exception when no_data_found then null; end;
  perform set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', true);
  begin
    perform public.assign_facture_number(foreign_id);
    raise exception 'Staff numbered invoice without rights';
  exception when insufficient_privilege then null; end;
  delete from public.documents where type = 'facture';
  if found then raise exception 'Staff deleted invoice without rights'; end if;
end $$;
reset role;
rollback;
\echo Invoice number reuse and permanent deletion checks passed.
