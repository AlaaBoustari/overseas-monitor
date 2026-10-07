-- Client details follow the partner, including on locked and archived documents.
-- The partner's existing RLS policy authorizes the edit; propagation is limited
-- to these three fields and runs in the same transaction.
create or replace function public.sync_partner_document_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set client_name = new.name,
      client_ice = new.ice,
      client_address = new.address
  where partenaire_id = new.id
    and (client_name, client_ice, client_address)
      is distinct from (new.name, new.ice, new.address);
  return new;
end;
$$;

revoke all on function public.sync_partner_document_details() from public, anon, authenticated;

create trigger partenaires_sync_document_details
  after update of name, ice, address on public.partenaires
  for each row
  when ((old.name, old.ice, old.address) is distinct from (new.name, new.ice, new.address))
  execute function public.sync_partner_document_details();

-- Also keep new documents, duplicates and snapshot restores current. The row
-- lock serializes this read with partner edits so a stale insert cannot escape
-- propagation while a client is being edited.
create or replace function public.use_partner_document_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  partner public.partenaires%rowtype;
begin
  if new.partenaire_id is not null then
    select * into partner
    from public.partenaires
    where id = new.partenaire_id
    for share;
    if found then
      new.client_name = partner.name;
      new.client_ice = partner.ice;
      new.client_address = partner.address;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.use_partner_document_details() from public, anon, authenticated;

create trigger documents_use_partner_details
  before insert or update of partenaire_id, client_name, client_ice, client_address
  on public.documents
  for each row execute function public.use_partner_document_details();
