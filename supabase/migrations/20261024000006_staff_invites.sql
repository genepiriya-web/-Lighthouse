-- M6: how people join. An admin invites an email address with a role; the first time someone signs in through Supabase
-- with that (verified) email, the server creates their staff row and marks the invite used. Server-only table.
create table staff_invites (
  email       text primary key check (email = lower(email) and email like '%@%'),
  role        text not null check (role in ('admin','sale','store','accounting','crew')),
  name        text,
  invited_by  uuid, invited_at timestamptz not null default now(),
  used_by     uuid, used_at timestamptz
);
alter table staff_invites enable row level security;
alter table staff_invites force row level security;
revoke all on table staff_invites from public, anon, authenticated;
grant select, insert, update, delete on table staff_invites to service_role;
