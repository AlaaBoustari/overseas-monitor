-- Existing and new documents keep the amount in French visible by default.
alter table public.documents
  add column show_amount_words boolean not null default true;
