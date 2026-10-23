-- M5: crew national IDs (PDPA). Rules:
--   * Stored encrypted by the app server (AES-256-GCM, key CREW_ID_KEY outside the database). A database copy or backup
--     alone never reveals an ID. Only the last 3 digits are kept in clear, for the masked view (x-xxxx-xxxxx-12-3).
--   * No client role can read these tables at all, admin included: every full ID goes through the server, which logs it.
--   * Client links store only a SHA-256 hash of the token; the token itself is shown once, to the admin who made it.
create table crew_national_ids (
  crew_id     text primary key references crew(id) on delete cascade,
  cipher      text not null,                 -- v1:<iv>:<tag>:<ciphertext>, base64url
  last3       text not null check (last3 ~ '^\d{3}$'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table crew_id_links (
  id          text primary key default gen_random_uuid()::text,
  order_id    text not null references orders(id),
  token_hash  text not null unique,
  recipient   text not null,                 -- who the admin is sending it to (free text, e.g. "Production X, location manager")
  show        text not null default 'full' check (show in ('full','masked')),
  created_by  uuid not null, created_by_name text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_views   integer not null default 20 check (max_views between 1 and 200),
  views       integer not null default 0,
  revoked_at  timestamptz, revoked_by uuid
);
create index crew_id_links_order_idx on crew_id_links (order_id);

do $$ declare t text; begin
  foreach t in array array['crew_national_ids','crew_id_links'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on table %I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table %I to service_role', t);
  end loop;
end $$;
-- Deliberately no policies: authenticated and anon get nothing, whatever their role.
