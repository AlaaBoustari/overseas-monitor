-- Run as postgres against a migrated TEST database with ON_ERROR_STOP=1.
-- Fixtures roll back; numbering tests use years 2097/2098 (sequences advance).
begin;

insert into auth.users (id, email) values
  ('91000000-0000-0000-0000-000000000001', 'company-admin@example.test'),
  ('91000000-0000-0000-0000-000000000002', 'company-staff@example.test');
update public.profiles set role = 'superadmin'
where id = '91000000-0000-0000-0000-000000000001';
insert into public.permissions (user_id, resource, can_edit) values
  ('91000000-0000-0000-0000-000000000002', 'devis', true);
insert into public.partenaires (id, name, ice) values
  ('92000000-0000-0000-0000-000000000001', 'Company test partner', 'SHARED');
insert into public.engins (id, name, category, unit) values
  ('93000000-0000-0000-0000-000000000001', 'Company test machine', 'Misc', 'Jour');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';

-- Both companies start at 1 for every document type; the DB scopes defaults.
do $$ declare c text; t public.document_type; n text; expected text; begin
  foreach c in array array['services', 'lifting'] loop
    perform set_config('request.headers', jsonb_build_object('x-overseas-company', c)::text, true);
    if exists (select 1 from public.documents where date = '2097-01-01')
      or (select monthly_ttc from public.dashboard_invoice_totals('2097-01-01', '2097-01-31')) <> 0 then
      raise exception 'An empty company showed another company''s documents or totals';
    end if;
    foreach t in array enum_range(null::public.document_type) loop
      n := public.next_document_number(t, 2097);
      expected := case t when 'facture' then '001/2097/AI' when 'devis' then 'D-0001/97'
        when 'bon_commande' then 'BC-0001/97' else 'AV-0001/97' end;
      if n <> expected then raise exception '% % expected %, got %', c, t, expected, n; end if;
      insert into public.documents (id, type, number, date, partenaire_id, created_by, ttc)
      values (md5('company-test-' || c || t)::uuid, t, n, '2097-01-01',
        '92000000-0000-0000-0000-000000000001', auth.uid(), case c when 'services' then 120 else 240 end);
      begin
        insert into public.documents (type, number, created_by) values (t, lower(n), auth.uid());
        raise exception 'Duplicate number accepted for % %', c, t;
      exception when unique_violation then null; end;
    end loop;
    if exists (select 1 from public.documents where company <> c) then
      raise exception 'Another company is visible';
    end if;
    if (select monthly_ttc from public.dashboard_invoice_totals('2097-01-01', '2097-01-31'))
      <> (case c when 'services' then 120 else 240 end) then
      raise exception 'Dashboard mixed companies';
    end if;
    insert into public.document_snapshots (document_id, snapshot, created_by)
    values (md5('company-test-' || c || 'facture')::uuid, '{}', auth.uid());

    -- The same partner/month and the same physical machine work in both companies.
    perform public.save_pointage_sheet(null, null, '92000000-0000-0000-0000-000000000001',
      'Company test partner', 'SHARED', null, '2097-01', null,
      '[{"engin_id":"93000000-0000-0000-0000-000000000001","engin_name":"Company test machine","unit_price":100,"days":{"1":1},"overtime_hours":{},"is_active":true}]');
    perform public.save_pointage_sheet(null, null, null, 'Manual company test', null, null, '2097-01', null, '[]');
    begin
      insert into public.pointage_sheets (partenaire_id, ym) values ('92000000-0000-0000-0000-000000000001', '2097-01');
      raise exception 'Duplicate company/client/month accepted';
    exception when unique_violation then null; end;
    begin
      insert into public.pointage_sheets (client_name, ym) values ('  MANUAL   company test  ', '2097-01');
      raise exception 'Duplicate normalized manual client/month accepted';
    exception when unique_violation then null; end;
  end loop;
end $$;

-- Direct ID reads, edits, snapshots and the SECURITY DEFINER unlock RPC stay scoped.
set local request.headers = '{"x-overseas-company":"lifting"}';
do $$ begin
  if exists (select 1 from public.documents where id = md5('company-test-servicesfacture')::uuid) then
    raise exception 'Cross-company ID read succeeded'; end if;
  update public.documents set paid = true where id = md5('company-test-servicesfacture')::uuid;
  if found then raise exception 'Cross-company payment succeeded'; end if;
  update public.documents set is_active = false where id = md5('company-test-servicesdevis')::uuid;
  if found then raise exception 'Cross-company archive succeeded'; end if;
  if (select count(*) from public.document_snapshots where document_id = md5('company-test-servicesfacture')::uuid) <> 0 then
    raise exception 'Cross-company history visible'; end if;
  begin
    perform public.unlock_facture(md5('company-test-servicesfacture')::uuid);
    raise exception 'Cross-company unlock succeeded';
  exception when no_data_found then null; end;
  begin
    insert into public.document_snapshots (document_id, snapshot, created_by)
    values (md5('company-test-servicesfacture')::uuid, '{}', auth.uid());
    raise exception 'Cross-company snapshot insert succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.documents set company = 'services' where id = md5('company-test-liftingfacture')::uuid;
    raise exception 'Document changed company';
  exception when check_violation or insufficient_privilege then null; end;
  begin
    insert into public.documents (company, type, created_by) values ('services', 'devis', auth.uid());
    raise exception 'Insert ignored request company';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.pointage_sheets where company <> 'lifting')
    or (select count(*) from public.pointage_entries where engin_id = '93000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Pointage/entries mixed companies'; end if;
end $$;

-- Imports/manual numbering advance only that company's counter; years are separate.
insert into public.documents (type, number, date, created_by)
values ('facture', '125/2097/AI', '2097-01-01', auth.uid());
do $$ begin
  if public.next_document_number('facture', 2097) <> '126/2097/AI' then raise exception 'Import not respected'; end if;
  if public.next_document_number('facture', 2098) <> '001/2098/AI' then raise exception 'Year not independent'; end if;
end $$;
set local request.headers = '{"x-overseas-company":"services"}';
do $$ begin
  if public.next_document_number('facture', 2097) <> '002/2097/AI' then raise exception 'Services counter changed'; end if;
end $$;

-- Shared edits propagate to linked documents in BOTH companies, even with RLS.
update public.partenaires set name = 'Updated shared partner', ice = 'UPDATED'
where id = '92000000-0000-0000-0000-000000000001';
update public.engins set default_price = 321 where id = '93000000-0000-0000-0000-000000000001';
set local request.headers = '{"x-overseas-company":"lifting"}';
do $$ begin
  if (select count(*) from public.documents where partenaire_id = '92000000-0000-0000-0000-000000000001'
    and client_name = 'Updated shared partner' and client_ice = 'UPDATED') <> 4 then
    raise exception 'Shared partner edit did not reach Lifting'; end if;
  if (select default_price from public.engins where id = '93000000-0000-0000-0000-000000000001') <> 321 then
    raise exception 'Machine edit not shared'; end if;
end $$;

-- Existing staff module rights apply identically to both companies.
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000002';
do $$ declare c text; begin
  foreach c in array array['services', 'lifting'] loop
    perform set_config('request.headers', jsonb_build_object('x-overseas-company', c)::text, true);
    insert into public.documents (type, client_name, created_by) values ('devis', 'Staff draft', auth.uid());
    begin
      insert into public.documents (type, client_name, created_by) values ('facture', 'Forbidden', auth.uid());
      raise exception 'Staff gained invoice permission';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- No selection means no business data and no implicit Services write.
set local request.jwt.claim.sub = '91000000-0000-0000-0000-000000000001';
set local request.headers = '{}';
do $$ begin
  if exists (select 1 from public.documents) or exists (select 1 from public.pointage_sheets)
    or exists (select 1 from public.pointage_entries) then raise exception 'Missing company exposed data'; end if;
  begin
    insert into public.documents (type, created_by) values ('facture', auth.uid());
    raise exception 'Missing company accepted';
  exception when not_null_violation or insufficient_privilege then null; end;
  begin
    perform public.next_document_number('facture', 2097);
    raise exception 'Missing company numbered document';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- Database constraints also protect imports and owner/service-role writes.
do $$ declare service_sheet uuid; lifting_sheet uuid; invoice uuid; begin
  select id into service_sheet from public.pointage_sheets
  where company = 'services' and partenaire_id = '92000000-0000-0000-0000-000000000001';
  select id into lifting_sheet from public.pointage_sheets
  where company = 'lifting' and partenaire_id = '92000000-0000-0000-0000-000000000001';
  begin
    insert into public.documents (company, type, source_pointage_sheet_id) values ('lifting', 'facture', service_sheet);
    raise exception 'Cross-company pointage invoice accepted';
  exception when check_violation then null; end;
  begin
    update public.pointage_sheets set facture_id = md5('company-test-liftingfacture')::uuid where id = service_sheet;
    raise exception 'Cross-company reverse invoice link accepted';
  exception when check_violation then null; end;
  insert into public.documents (company, type, source_pointage_sheet_id)
  values ('lifting', 'facture', lifting_sheet) returning id into invoice;
  if (select facture_id from public.pointage_sheets where id = lifting_sheet) <> invoice then
    raise exception 'Pointage invoice hand-off broken'; end if;
  begin
    update public.pointage_sheets set project = 'Changed billed pointage' where id = lifting_sheet;
    raise exception 'Billed pointage was editable';
  exception when object_not_in_prerequisite_state then null; end;
  if (select facture_id from public.pointage_sheets where id = service_sheet) is not null then
    raise exception 'Lifting invoice closed Services pointage'; end if;
end $$;

-- Precisely one grandfathered 043 duplicate; no new duplicate or Lifting exemption.
insert into public.documents (company, type, number) values ('services', 'facture', '043/2026/AI')
on conflict do nothing;
insert into public.documents (id, company, type, number)
values ('948ebbf6-219f-40f2-a97c-6e573da04233', 'services', 'facture', '043/2026/AI')
on conflict (id) do nothing;
insert into public.documents (company, type, number) values ('lifting', 'facture', '043/2026/AI');
do $$ declare c text; begin
  foreach c in array array['services', 'lifting'] loop
    begin
      insert into public.documents (company, type, number) values (c, 'facture', '043/2026/AI');
      raise exception '043 exception spread to another invoice';
    exception when unique_violation then null; end;
  end loop;
end $$;

rollback;
\echo Company workspace checks passed.
