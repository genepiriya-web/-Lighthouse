-- Lighthouse Dispatch v2 — initial schema (M2).
-- Runs unchanged on Supabase and on local Postgres (+ supabase/local-shim.sql).
--
-- Security model (docs/PLAN.md flaw 2):
--   * Every table has row-level security, forced, with SELECT policies only. Signed-in staff can read;
--     nobody can insert/update/delete through the client roles (anon, authenticated).
--   * All writes go through the app server (M3) as service_role, which runs src/logic.js first.
--   * Legacy jobs are read-only to everyone except the importer (flaw 1), enforced by trigger.
--   * activity is append-only for everyone, enforced by trigger.
-- Money/quantity columns are plain `numeric` so imported values round-trip exactly (parity depends on it).

-- ---------- people and roles ----------
create table staff (
  user_id      uuid primary key,              -- auth.users.id on Supabase
  display_name text not null,
  role         text not null check (role in ('admin','sale','store','accounting','crew')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- The caller's role, or null when they are not active staff. security definer so policies on `staff` don't recurse.
create function app_role() returns text language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid() and active
$$;
revoke all on function app_role() from public;
grant execute on function app_role() to anon, authenticated, service_role;

-- ---------- master data ----------
create table positions (
  id   integer primary key,
  code text, name text not null, dept integer, sort numeric
);

create table products (
  id            integer primary key,          -- old system product id; v2-created products will use ids >= 1,000,000
  code          text not null,
  description   text not null default '',
  dept          integer,
  type          integer not null check (type between 1 and 7),
  price         numeric not null default 0,
  discountable  boolean not null default false,
  max_disc      numeric not null default 0,   -- 0 = no cap (old-system behaviour)
  stock         integer not null default 0,   -- which of stock/one_hand means "units owned" is unconfirmed (flaw 6)
  one_hand      integer,
  damage_lost   integer,
  serial        text,
  unit          text,
  weight        numeric,
  sort          numeric,                       -- old system uses decimals (1.11, 1.12, ...)
  is_fuel_hour  boolean not null default false, -- replaces the "Hour ..." description match (L5); set by importer for now
  source        text not null default 'legacy' check (source in ('legacy','v2')),
  updated_at    timestamptz not null default now()
);
create index products_code_idx on products (code);

create table kit_parts (
  parent_id integer not null references products(id) on delete cascade,
  child_id  integer not null references products(id),
  ratio     numeric not null default 1,
  price     numeric not null default 0,       -- usually 0; some parts carry their own price
  primary key (parent_id, child_id)
);

create table customers (
  id           text primary key,              -- old system id as text; v2-created customers get a uuid
  code         text,
  name         text not null,
  job_type     text,                          -- old system's customer "type" (TVC, FILM, ...)
  default_disc numeric not null default 0,
  billing_addr text,
  phone        text,
  fax          text,
  source       text not null default 'legacy' check (source in ('legacy','v2')),
  updated_at   timestamptz not null default now()
);
create index customers_name_idx on customers (name);

-- Kept apart because an individual's Thai tax ID is their national ID (PDPA). Readable by admin, sale, accounting only.
create table customer_tax_ids (
  customer_id text primary key references customers(id) on delete cascade,
  tax_id      text not null
);

create table crew (
  id          text primary key,
  code        text,
  first_name  text, last_name text, nick text, description text,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table crew_rates (
  crew_id     text not null references crew(id) on delete cascade,
  position_id integer not null,
  dept        integer,                         -- 1 Lighting, 2 Grip, 3 Grip & Lighting
  price       numeric not null default 0,
  price_ot    numeric not null default 0,
  enabled     boolean not null default true,
  primary key (crew_id, position_id)
);

-- What Lighthouse pays crew. Separate so only admin and the crew manager can read it (open question: who else?).
create table crew_rate_costs (
  crew_id     text not null,
  position_id integer not null,
  cost        numeric not null default 0,
  cost_ot     numeric not null default 0,
  primary key (crew_id, position_id),
  foreign key (crew_id, position_id) references crew_rates(crew_id, position_id) on delete cascade
);

-- Remark/footer templates, sales list, company details. Template html came from the old system: sanitise when rendering.
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- jobs ----------
create table orders (
  id              text primary key default gen_random_uuid()::text,
  no              text not null unique,
  owner           text not null check (owner in ('legacy','v2')),  -- flaw 1: who may change this job
  legacy_id       text,
  status          text not null check (status in ('Quote','Order','Approve','Shipped','Returned','Draft INV','Cancel')),
  customer_id     text references customers(id),
  customer_name   text,
  job_title       text, job_type text, dept integer,
  billing         text, phone text, fax text, contact text, contact_phone text,
  dop             text, pm text, gaffer text, key_grip text, note text, sale text,
  rent_type       text not null default 'Daily' check (rent_type in ('Daily','Weekly')),
  dpw             numeric,
  tax             text not null default 'Vat' check (tax in ('Vat','Not Vat')),
  ship            date, ret date, use_start date, use_end date,
  footer_id       text, remark_id text,
  extra_disc      numeric not null default 0,
  insurance       numeric not null default 0,
  adjust          numeric not null default 0,
  totals          jsonb,                       -- cache of orderTotals(); recomputed by the server on every write (flaw 7)
  usage           jsonb,                       -- cache of usageOf()
  legacy_totals   jsonb,
  rev             integer not null default 0,  -- optimistic lock: writes must send the rev they read (M3)
  created_at      timestamptz not null default now(),
  created_by      uuid, created_by_name text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create index orders_status_idx on orders (status);
create index orders_ship_idx on orders (ship);
create index orders_customer_idx on orders (customer_id);

create table order_lines (
  order_id      text not null references orders(id) on delete cascade,
  k             text not null,                 -- line key, stable across edits; children point at it via parent_k
  sort          integer not null,
  t             integer not null check (t between 1 and 7),
  pid           integer,                       -- no FK: legacy lines may reference products the old system retired
  code          text, description text,
  list          numeric not null default 0,
  qty           numeric not null default 0,
  days          numeric not null default 0,
  disc          numeric not null default 0,
  foc           boolean not null default false,
  sb            boolean not null default false,
  ot            numeric, ot_rate numeric, ratio numeric,
  parent_k      text,
  start_date    date, end_date date,
  out_qty       numeric not null default 0, in_qty numeric not null default 0,
  dmg           numeric not null default 0, lost numeric not null default 0,
  repaired      boolean not null default false,
  crew_id       text,                          -- crew code from the old system, never a national ID
  remark        text,
  legacy_amount numeric,
  primary key (order_id, k)
);
create index order_lines_pid_idx on order_lines (pid);

create table repairs (
  id         text primary key default gen_random_uuid()::text,
  order_id   text references orders(id),
  pid        integer, code text, description text,
  qty        numeric not null default 1,
  status     text not null default 'wait' check (status in ('wait','doing','done','lost')),
  note       text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now()
);

-- Order numbers: 2-digit Buddhist year + 5-digit running number. A row lock makes it safe under concurrency
-- and gap-free unless a transaction rolls back after taking a number (flaw 11).
create table order_counters (
  be_year integer primary key,
  seq     integer not null
);

create function next_order_no() returns text language plpgsql as $$
declare y integer := ((extract(year from (now() at time zone 'Asia/Bangkok'))::integer + 543) % 100); s integer;
begin
  insert into order_counters as c (be_year, seq) values (y, 1)
    on conflict (be_year) do update set seq = c.seq + 1
    returning seq into s;
  return lpad(y::text, 2, '0') || lpad(s::text, 5, '0');
end $$;

-- ---------- audit ----------
create table activity (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_name  text,
  entity      text not null,                   -- 'order', 'product', 'customer', 'crew_id', ...
  entity_id   text,
  action      text not null,
  detail      jsonb,
  source_key  text unique                       -- set for imported history so re-imports don't duplicate it
);
create index activity_entity_idx on activity (entity, entity_id, at);

create table import_runs (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  source   text not null,
  counts   jsonb not null
);

-- ---------- guards ----------
create function activity_append_only() returns trigger language plpgsql as $$
begin raise exception 'activity is append-only' using errcode = '42501'; end $$;
create trigger activity_no_update before update or delete on activity
  for each row execute function activity_append_only();
create trigger activity_no_truncate before truncate on activity
  for each statement execute function activity_append_only();

-- Legacy jobs belong to the old system until cutover. Only the importer (database owner, app.importer = on) may write them.
create function guard_legacy() returns trigger language plpgsql as $$
declare
  importing boolean := coalesce(current_setting('app.importer', true), '') = 'on'
                       and current_user not in ('service_role','authenticated','anon');
  o_old text; o_new text;
begin
  if importing then return coalesce(new, old); end if;
  if tg_table_name = 'orders' then
    if tg_op <> 'INSERT' then o_old := old.owner; end if;
    if tg_op <> 'DELETE' then o_new := new.owner; end if;
  else
    if tg_op <> 'INSERT' then select owner into o_old from orders where id = old.order_id; end if;
    if tg_op <> 'DELETE' then select owner into o_new from orders where id = new.order_id; end if;
  end if;
  if o_old = 'legacy' or o_new = 'legacy' then
    raise exception 'legacy job is read-only in v2 until cutover' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger orders_guard_legacy before insert or update or delete on orders
  for each row execute function guard_legacy();
create trigger order_lines_guard_legacy before insert or update or delete on order_lines
  for each row execute function guard_legacy();

-- ---------- row-level security ----------
do $$
declare t text;
begin
  foreach t in array array['staff','positions','products','kit_parts','customers','customer_tax_ids','crew','crew_rates',
                           'crew_rate_costs','settings','orders','order_lines','repairs','order_counters','activity','import_runs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on table %I from public, anon, authenticated', t);
  end loop;
end $$;

-- Readable by any active staff member.
do $$
declare t text;
begin
  foreach t in array array['staff','positions','products','kit_parts','customers','crew','crew_rates','settings',
                           'orders','order_lines','repairs','activity']
  loop
    execute format('grant select on table %I to authenticated', t);
    execute format('create policy staff_read on %I for select to authenticated using (app_role() is not null)', t);
  end loop;
end $$;

grant select on table customer_tax_ids to authenticated;
create policy tax_read on customer_tax_ids for select to authenticated
  using (app_role() in ('admin','sale','accounting'));

grant select on table crew_rate_costs to authenticated;
create policy cost_read on crew_rate_costs for select to authenticated
  using (app_role() in ('admin','crew'));

grant select on table import_runs to authenticated;
create policy import_read on import_runs for select to authenticated using (app_role() = 'admin');
-- order_counters: no client access at all; numbers come from next_order_no() on the server.

-- The server role writes everything (after running logic.js), except rewriting history.
grant select, insert, update, delete on all tables in schema public to service_role;
revoke update, delete, truncate on table activity from service_role;
-- Supabase's default privileges hand new sequences and functions to the client roles too; take those back.
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage on all sequences in schema public to service_role;
revoke execute on function next_order_no(), guard_legacy(), activity_append_only() from public, anon, authenticated;
grant execute on function next_order_no() to service_role;
