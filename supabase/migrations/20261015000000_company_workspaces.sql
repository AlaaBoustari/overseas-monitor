-- Apply together with the company-aware app. Existing rows remain Services.
begin;
set local lock_timeout = '5s';

create or replace function public.request_company()
returns text
language sql
stable
set search_path = ''
as $$
  select case nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-overseas-company'
    when 'services' then 'services'
    when 'lifting' then 'lifting'
    else null
  end;
$$;
revoke all on function public.request_company() from public;
grant execute on function public.request_company() to authenticated;

alter table public.documents
  add column company text not null default 'services' check (company in ('services', 'lifting'));
alter table public.pointage_sheets
  add column company text not null default 'services' check (company in ('services', 'lifting'));

-- New writes require an explicit, valid request context; never silently use Services.
alter table public.documents alter column company set default public.request_company();
alter table public.pointage_sheets alter column company set default public.request_company();

-- The app supplies bank defaults from lib/company-details.ts. Imports that omit
-- them must never accidentally inherit Services' account for a Lifting document.
alter table public.documents
  alter column devis_bank_name set default '',
  alter column devis_iban set default '';

-- The same users/permissions apply to both companies. These restrictive policies
-- add company scoping to every existing read/write policy, including ID lookups.
create policy "documents stay in selected company"
  on public.documents as restrictive for all to authenticated
  using (company = (select public.request_company()))
  with check (company = (select public.request_company()));
create policy "pointage sheets stay in selected company"
  on public.pointage_sheets as restrictive for all to authenticated
  using (company = (select public.request_company()))
  with check (company = (select public.request_company()));
create policy "pointage entries follow sheet company"
  on public.pointage_entries as restrictive for all to authenticated
  using (exists (select 1 from public.pointage_sheets where id = sheet_id))
  with check (exists (select 1 from public.pointage_sheets where id = sheet_id));
create policy "snapshots follow document company"
  on public.document_snapshots as restrictive for all to authenticated
  using (exists (select 1 from public.documents where id = document_id))
  with check (exists (select 1 from public.documents where id = document_id));

alter table public.documents drop constraint if exists documents_type_number_key;
drop index if exists public.documents_type_number_key;
drop index if exists public.documents_type_number_ci_key;

-- Grandfather precisely the existing 043 exception. No other duplicate is allowed,
-- including any Lifting invoice or any other Services invoice numbered 043.
create unique index documents_company_type_number_key
  on public.documents (company, type, number)
  where not (
    company = 'services' and id = '948ebbf6-219f-40f2-a97c-6e573da04233'
    and type = 'facture' and lower(number) = '043/2026/ai'
  );
create unique index documents_company_type_number_ci_key
  on public.documents (company, type, lower(number))
  where number is not null and not (
    company = 'services' and id = '948ebbf6-219f-40f2-a97c-6e573da04233'
    and type = 'facture' and lower(number) = '043/2026/ai'
  );

drop index public.pointage_sheets_linked_client_ym_key;
drop index public.pointage_sheets_manual_client_ym_key;
create unique index pointage_sheets_linked_client_ym_key
  on public.pointage_sheets (company, partenaire_id, ym) where partenaire_id is not null;
create unique index pointage_sheets_manual_client_ym_key
  on public.pointage_sheets (company, lower(regexp_replace(btrim(client_name), '\s+', ' ', 'g')), ym)
  where partenaire_id is null;

create index documents_company_active_type_updated_idx
  on public.documents (company, type, updated_at desc) where is_active;
create index documents_company_active_facture_date_idx
  on public.documents (company, date) where type = 'facture' and is_active and number is not null;
create index pointage_sheets_company_active_ym_client_idx
  on public.pointage_sheets (company, ym, client_name) where is_active;

create or replace function public.keep_record_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company is distinct from old.company then
    raise exception 'A record cannot change company' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger documents_keep_company before update of company on public.documents
  for each row execute function public.keep_record_company();
create trigger pointage_sheets_keep_company before update of company on public.pointage_sheets
  for each row execute function public.keep_record_company();

create or replace function public.check_pointage_invoice_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'documents' then
    if new.source_pointage_sheet_id is not null and not exists (
      select 1 from public.pointage_sheets
      where id = new.source_pointage_sheet_id and company = new.company
    ) then
      raise exception 'Pointage and invoice must belong to the same company' using errcode = '23514';
    end if;
  else
    if new.facture_id is not null and not exists (
      select 1 from public.documents
      where id = new.facture_id and company = new.company and type = 'facture'
    ) then
      raise exception 'Pointage and invoice must belong to the same company' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger documents_check_pointage_company
  before insert or update of source_pointage_sheet_id on public.documents
  for each row execute function public.check_pointage_invoice_company();
create trigger pointage_sheets_check_invoice_company
  before insert or update of facture_id on public.pointage_sheets
  for each row execute function public.check_pointage_invoice_company();
revoke all on function public.keep_record_company() from public, anon, authenticated;
revoke all on function public.check_pointage_invoice_company() from public, anon, authenticated;

-- Keep automatic numbering ahead of documents inserted or numbered manually.
create or replace function public.next_document_number(p_type public.document_type, p_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  company_id text := public.request_company();
  sequence_name text;
  sequence_value bigint;
  highest_existing bigint;
  year_suffix text := right(p_year::text, 2);
  number_pattern text;
  candidate text;
begin
  if company_id is null then
    raise exception 'Company context required' using errcode = '22023';
  end if;
  -- Keep Services' existing counters, including numbers already reserved.
  sequence_name := case company_id
    when 'services' then format('document_numbers_%s_%s_seq', p_type::text, p_year)
    else format('document_numbers_%s_%s_%s_seq', company_id, p_type::text, p_year)
  end;

  if public.can_edit_document(p_type) is not true then
    raise exception 'Permission refusée pour la numérotation.' using errcode = '42501';
  end if;

  if p_year < 2000 or p_year > 9999 then
    raise exception 'Invalid document year: %', p_year using errcode = '22023';
  end if;

  number_pattern := case p_type
    when 'facture' then format('^([0-9]+)/%s/AI(/BIS)?$', p_year)
    when 'devis' then format('^D-([0-9]+)/%s$', year_suffix)
    when 'bon_commande' then format('^BC-([0-9]+)/%s$', year_suffix)
    when 'avoir' then format('^AV-([0-9]+)/%s$', year_suffix)
  end;

  perform pg_advisory_xact_lock(hashtext(sequence_name));
  execute format('create sequence if not exists %I minvalue 1 start with 1', sequence_name);

  select coalesce(max((regexp_match(number, number_pattern, 'i'))[1]::bigint), 0)
  into highest_existing
  from public.documents
  where company = company_id
    and type = p_type
    and number is not null
    and number ~* number_pattern;

  execute format('select nextval(%L)', 'public.' || sequence_name) into sequence_value;
  if sequence_value <= highest_existing then
    perform setval(('public.' || sequence_name)::regclass, highest_existing, true);
    execute format('select nextval(%L)', 'public.' || sequence_name) into sequence_value;
  end if;

  loop
    candidate := case p_type
      when 'facture' then lpad(sequence_value::text, 3, '0') || '/' || p_year || '/AI'
      when 'devis' then 'D-' || lpad(sequence_value::text, 4, '0') || '/' || year_suffix
      when 'bon_commande' then 'BC-' || lpad(sequence_value::text, 4, '0') || '/' || year_suffix
      when 'avoir' then 'AV-' || lpad(sequence_value::text, 4, '0') || '/' || year_suffix
    end;

    exit when not exists (
      select 1
      from public.documents
      where company = company_id
    and type = p_type
        and lower(number) = lower(candidate)
    );
    execute format('select nextval(%L)', 'public.' || sequence_name) into sequence_value;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.next_document_number(public.document_type, integer) from public;
grant execute on function public.next_document_number(public.document_type, integer) to authenticated;

create or replace function public.unlock_facture(p_document_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Super-administrator access required' using errcode = '42501';
  end if;

  update public.documents
  set
    is_locked = false,
    manual_number_only = true,
    unlocked_by = auth.uid(),
    unlocked_at = now()
  where id = p_document_id
    and company = public.request_company()
    and is_active = true
    and number is not null;

  if not found then
    raise exception 'Active numbered document not found' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

commit;
