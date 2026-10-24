-- Staff trial feedback: anyone signed in can send a note from any screen; admins read and mark them. Server-only table.
create table feedback (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  user_id   uuid not null,
  user_name text,
  role      text,
  page      text,
  text      text not null check (length(text) between 1 and 4000),
  status    text not null default 'new' check (status in ('new','seen','done'))
);
alter table feedback enable row level security;
alter table feedback force row level security;
revoke all on table feedback from public, anon, authenticated;
grant select, insert, update on table feedback to service_role;
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage on all sequences in schema public to service_role;
