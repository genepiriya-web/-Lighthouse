-- Daily job board (Gene, 27 Oct 2026; replaces the "กระดานงาน" Excel): what each job needs on each working day that the
-- job itself doesn't hold — location and on-location time, head, electricians, trucks with drivers, generators with
-- operators, a remark. One row per job per day; jobs, customers, DOP, sales, items stay on the job. Server-only writes.
create table board_entries (
  order_id        text not null references orders(id) on delete cascade,
  day             date not null,
  loc             text,
  onloc           text,
  head            text,
  crew            text,
  trucks          text,
  gens            text,
  remark          text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_by_name text,
  primary key (order_id, day)
);
create index board_entries_day_idx on board_entries (day);

alter table board_entries enable row level security;
alter table board_entries force row level security;
revoke all on table board_entries from public, anon, authenticated;
grant select on table board_entries to authenticated;
create policy staff_read on board_entries for select to authenticated using (app_role() is not null);
grant select, insert, update, delete on table board_entries to service_role;
