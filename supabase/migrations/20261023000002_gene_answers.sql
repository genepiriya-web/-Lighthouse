-- Gene's answers of 23 Oct 2026 (docs/PLAN.md open questions 14–19).

-- Q18: jobs that point at a customer missing from the customer list get that customer created and flagged as new,
-- so someone checks the details. flagged_new is cleared by a person, never by the importer.
alter table customers
  add column flagged_new boolean not null default false,
  add column flag_note   text;

-- Q17: keep every rate row the old system has, even the same position listed twice for one crew member.
-- rate_no is the order the old system lists them in (1 = first). needs_review marks positions listed more than once,
-- so the UI can ask which rate applies instead of silently picking one.
alter table crew_rate_costs drop constraint crew_rate_costs_crew_id_position_id_fkey;
alter table crew_rate_costs drop constraint crew_rate_costs_pkey;
alter table crew_rates      drop constraint crew_rates_pkey;

alter table crew_rates
  add column rate_no      smallint not null default 1,
  add column needs_review boolean  not null default false;
alter table crew_rates add primary key (crew_id, position_id, rate_no);

alter table crew_rate_costs add column rate_no smallint not null default 1;
alter table crew_rate_costs add primary key (crew_id, position_id, rate_no);
alter table crew_rate_costs add foreign key (crew_id, position_id, rate_no)
  references crew_rates (crew_id, position_id, rate_no) on delete cascade;

-- Q14 (confirmed): customer tax IDs stay readable by admin, sale and accounting only, for documents (quotation, invoice).
-- Q15 (confirmed): crew costs stay admin + crew manager only; sales sees the price we charge.
comment on table customer_tax_ids is 'Tax IDs (an individual''s is their national ID, PDPA). Admin, sale, accounting only; use for documents only. Confirmed by Gene 2026-10-23.';
comment on table crew_rate_costs  is 'What Lighthouse pays crew. Admin and crew manager only; sales sees crew_rates.price. Confirmed by Gene 2026-10-23.';
