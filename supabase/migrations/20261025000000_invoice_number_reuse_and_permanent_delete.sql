begin;
set local lock_timeout = '5s';

-- Assign and save under the same lock: released tail numbers are reusable,
-- and concurrent invoices cannot both claim the same number.
create or replace function public.assign_facture_number(p_document_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.documents%rowtype;
  company_id text := public.request_company();
  invoice_year integer;
  sequence_name text;
  next_number bigint;
  number_text text;
begin
  if company_id is null then
    raise exception 'Company context required' using errcode = '22023';
  end if;
  if public.can_edit_document('facture') is not true then
    raise exception 'Permission refusée pour la numérotation.' using errcode = '42501';
  end if;
  select * into target from public.documents
  where id = p_document_id and company = company_id and type = 'facture'
  for update;
  if not found then
    raise exception 'Facture introuvable.' using errcode = 'P0002';
  end if;
  if not target.is_active then
    raise exception 'Restaurez cette facture avant de la numéroter.' using errcode = '22023';
  end if;
  if target.number is not null then return true; end if;
  if target.is_locked or target.manual_number_only then
    raise exception 'Cette facture ne peut pas recevoir de numéro automatique.' using errcode = '22023';
  end if;
  invoice_year := extract(year from target.date)::integer;
  if invoice_year < 2000 or invoice_year > 9999 then
    raise exception 'Invalid document year: %', invoice_year using errcode = '22023';
  end if;
  sequence_name := case company_id
    when 'services' then format('document_numbers_facture_%s_seq', invoice_year)
    else format('document_numbers_lifting_facture_%s_seq', invoice_year)
  end;
  perform pg_advisory_xact_lock(hashtext(sequence_name));

  -- Inactive invoices still reserve their assigned number. NAN and drafts do not.
  select coalesce(max((regexp_match(number, format('^([0-9]+)/%s/AI(/BIS)?$', invoice_year), 'i'))[1]::bigint), 0) + 1
  into next_number from public.documents
  where company = company_id and type = 'facture'
    and number ~* format('^([0-9]+)/%s/AI(/BIS)?$', invoice_year);
  number_text := next_number::text;
  update public.documents
  set number = lpad(number_text, greatest(3, length(number_text)), '0') || '/' || invoice_year || '/AI'
  where id = target.id;
  return true;
end;
$$;
revoke all on function public.assign_facture_number(uuid) from public;
grant execute on function public.assign_facture_number(uuid) to authenticated;

-- Existing edit rights and company policies still apply to permanent deletion.
create policy "only inactive invoices can be permanently deleted"
  on public.documents as restrictive for delete to authenticated
  using (type <> 'facture' or not is_active);

commit;
