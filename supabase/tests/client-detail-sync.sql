-- Run with psql -v ON_ERROR_STOP=1 against a migrated test database as postgres.
-- All fixtures and changes are rolled back.
begin;
set local request.headers = '{"x-overseas-company":"services"}';

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'client-sync-test@example.test');
insert into public.permissions (user_id, resource, can_edit) values
  ('10000000-0000-0000-0000-000000000001', 'partenaires', true);
insert into public.partenaires (id, name, ice, address) values
  ('20000000-0000-0000-0000-000000000001', 'Original', '123', 'Old address'),
  ('20000000-0000-0000-0000-000000000002', 'Other', '456', 'Other address');

insert into public.documents (
  type, number, date, partenaire_id, client_name, client_ice, client_address,
  is_locked, is_active, line_items, ht, tva, ttc, paid
)
select type, 'SYNC-TEST-' || state, '2020-01-01',
  '20000000-0000-0000-0000-000000000001', 'Stale', 'stale', 'Stale address',
  state <> 'draft', state <> 'archived',
  '[{"description":"Test","quantity":1,"unit_price":100}]', 100, 20, 120, true
from unnest(enum_range(null::public.document_type)) as type
cross join (values ('draft'), ('locked'), ('archived')) as states(state);

insert into public.documents (type, number, partenaire_id, client_name) values
  ('facture', 'SYNC-TEST-OTHER', '20000000-0000-0000-0000-000000000002', 'Other'),
  ('facture', 'SYNC-TEST-MANUAL', null, 'Original');

create temporary table before_sync as
  select id, to_jsonb(d) - array['client_name', 'client_ice', 'client_address', 'updated_at'] as preserved,
    client_name, client_ice, client_address
  from public.documents d where number like 'SYNC-TEST-%';

do $$ begin
  if exists (select 1 from public.documents
    where partenaire_id = '20000000-0000-0000-0000-000000000001'
    and (client_name, client_ice, client_address) is distinct from ('Original', '123', 'Old address')) then
    raise exception 'New documents must use current partner details';
  end if;
end $$;

-- A user with partner permission alone can propagate details, even though
-- ordinary document edits remain denied by RLS.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$ begin
  update public.documents set ht = 999 where number like 'SYNC-TEST-%';
  if found then raise exception 'Document edit permission was bypassed'; end if;
end $$;
update public.partenaires set name = 'Updated', ice = null, address = null
where id = '20000000-0000-0000-0000-000000000001';
reset role;

do $$ begin
  if (select count(*) from public.documents
    where partenaire_id = '20000000-0000-0000-0000-000000000001'
    and client_name = 'Updated' and client_ice is null and client_address is null) <> 12 then
    raise exception 'Every document type/state must sync, including cleared fields';
  end if;
  if exists (select 1 from public.documents d join before_sync b using (id)
    where to_jsonb(d) - array['client_name', 'client_ice', 'client_address', 'updated_at'] <> b.preserved) then
    raise exception 'Synchronization changed unrelated document fields';
  end if;
  if exists (select 1 from public.documents d join before_sync b using (id)
    where (d.partenaire_id is null or d.partenaire_id = '20000000-0000-0000-0000-000000000002')
    and (d.client_name, d.client_ice, d.client_address) is distinct from (b.client_name, b.client_ice, b.client_address)) then
    raise exception 'Manual documents or other clients were changed';
  end if;
  if has_function_privilege('authenticated', 'public.sync_partner_document_details()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.use_partner_document_details()', 'EXECUTE') then
    raise exception 'Trigger functions must not be directly callable';
  end if;
end $$;

-- Stale copies and snapshot restores cannot undo the client edit.
update public.documents set client_name = 'Original', client_ice = '123', client_address = 'Old address'
where partenaire_id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.documents
    where partenaire_id = '20000000-0000-0000-0000-000000000001'
    and (client_name <> 'Updated' or client_ice is not null or client_address is not null)) then
    raise exception 'Stale document details were accepted';
  end if;
end $$;

create temporary table before_phone_edit as
  select id, ctid::text as version from public.documents where number like 'SYNC-TEST-%';
update public.partenaires set phone = '0600000000'
where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.documents d join before_phone_edit b using (id) where d.ctid::text <> b.version) then
    raise exception 'An unrelated partner edit rewrote documents';
  end if;
end $$;

-- Removing partner permission prevents both the edit and propagation.
update public.permissions set can_edit = false
where user_id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin
  update public.partenaires set name = 'Unauthorized'
  where id = '20000000-0000-0000-0000-000000000001';
  if found then raise exception 'Unauthorized partner edit succeeded'; end if;
end $$;
reset role;

-- An error during propagation rolls back the partner edit too.
create function pg_temp.reject_client_sync() returns trigger language plpgsql as $$
begin raise exception 'Expected propagation failure' using errcode = '23514'; end;
$$;
create trigger test_reject_client_sync before update on public.documents
for each row execute function pg_temp.reject_client_sync();
do $$ begin
  begin
    update public.partenaires set name = 'Must roll back'
    where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'Expected propagation to fail';
  exception when check_violation then null;
  end;
  if (select name from public.partenaires where id = '20000000-0000-0000-0000-000000000001') <> 'Updated' then
    raise exception 'A failed propagation left the partner partially updated';
  end if;
end $$;

rollback;
\echo Client detail synchronization checks passed.
