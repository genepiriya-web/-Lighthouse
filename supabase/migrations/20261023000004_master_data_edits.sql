-- M4 slice 3: master data edited in v2.
-- New v2 products get ids from 1,000,000 up so they never collide with the old system's ids (max 9,421 today).
create sequence product_v2_id start 1000000;
revoke all on sequence product_v2_id from public, anon, authenticated;
grant usage on sequence product_v2_id to service_role;
-- Editing a legacy product or customer in v2 sets source = 'v2', so the importer no longer overwrites it (flaw 1 for
-- master data). Nothing else changes in the schema: the importer already skips source = 'v2' rows.
