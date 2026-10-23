-- LOCAL ONLY. Recreates the bits of Supabase the migrations rely on, so the same SQL runs on plain Postgres.
-- Never apply this to a Supabase project: Supabase already has these roles, the auth schema and auth.uid().
-- scripts/migrate.js applies it to a database that has no auth.uid() yet. Safe to re-run.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase's auth.uid(): the `sub` claim of the request's JWT. Tests set it with
--   set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}';
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants client roles everything on new public objects by default. Copy that here so a table that
-- forgets its revoke is caught locally instead of being wide open in production.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
