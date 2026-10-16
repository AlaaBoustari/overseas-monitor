-- ONE-OFF OPERATION: run in the production Supabase SQL Editor as postgres.
-- Allows only invoice 948ebbf6-219f-40f2-a97c-6e573da04233 to share 043/2026/AI.
-- No invoice is locked, deleted, or marked paid by this operation.
-- Restore normal uniqueness with restore-invoice-number-uniqueness.sql after
-- assigning the non-paying invoice a different reference through the app.

begin;
set local lock_timeout = '5s';
lock table public.documents in access exclusive mode;

do $$
declare
  target public.documents%rowtype;
  existing public.documents%rowtype;
begin
  select * into target from public.documents
  where id = '948ebbf6-219f-40f2-a97c-6e573da04233';
  if not found then
    raise exception 'Target invoice does not exist; no changes applied.';
  end if;
  if target.type <> 'facture' or not target.is_active or target.is_locked
      or target.number is not null or target.paid
      or extract(year from target.date) <> 2026 then
    raise exception 'Target must be an active, unlocked, unpaid, unnumbered 2026 facture; no changes applied.';
  end if;

  if (select count(*) from public.documents
      where type = 'facture' and lower(number) = '043/2026/ai') <> 1 then
    raise exception 'Expected exactly one existing 043/2026/AI facture; no changes applied.';
  end if;
  select * into existing from public.documents
  where type = 'facture' and lower(number) = '043/2026/ai';
  if not existing.is_active
      or lower(btrim(existing.client_name)) = lower(btrim(target.client_name)) then
    raise exception 'Expected two different clients and an active existing invoice; no changes applied.';
  end if;
end;
$$;

-- Replace BOTH uniqueness checks atomically. All other rows remain protected.
alter table public.documents drop constraint documents_type_number_key;
create unique index documents_type_number_key
  on public.documents (type, number)
  where not (
    id = '948ebbf6-219f-40f2-a97c-6e573da04233'
    and type = 'facture' and lower(number) = '043/2026/ai'
  );

drop index public.documents_type_number_ci_key;
create unique index documents_type_number_ci_key
  on public.documents (type, lower(number))
  where number is not null and not (
    id = '948ebbf6-219f-40f2-a97c-6e573da04233'
    and type = 'facture' and lower(number) = '043/2026/ai'
  );

update public.documents
set number = '043/2026/AI', manual_number_only = true
where id = '948ebbf6-219f-40f2-a97c-6e573da04233';

-- Review the two separate UUIDs and client names in the result.
select id, number, date, client_name, is_locked, paid
from public.documents
where type = 'facture' and lower(number) = '043/2026/ai'
order by date, id;
commit;
