-- Run AFTER the non-paying invoice has received a different reference.
-- Keeps both invoices and their history. Refuses to run while any exact or
-- case-insensitive duplicate remains, including inactive invoices.
begin;
set local lock_timeout = '5s';
lock table public.documents in access exclusive mode;

do $$
begin
  if exists (
    select 1 from public.documents
    where number is not null
    group by type, lower(number)
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate invoice references first; no changes applied.';
  end if;
end;
$$;

drop index public.documents_type_number_key;
alter table public.documents
  add constraint documents_type_number_key unique (type, number);
drop index public.documents_type_number_ci_key;
create unique index documents_type_number_ci_key
  on public.documents (type, lower(number))
  where number is not null;
commit;
