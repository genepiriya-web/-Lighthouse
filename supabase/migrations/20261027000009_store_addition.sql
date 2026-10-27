-- Store addition (Gene, 27 Oct 2026): when a job is at Approve, Store can add urgent items as a separate job linked to it.
-- That job starts at status 'Store Add', holds stock at once, and has no prices until Sales sets them and moves it to
-- Approve; from there it follows the normal flow. The main job and its signed quotation stay as they were.
alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('Quote','Order','Approve','Shipped','Returned','Draft INV','Cancel','Store Add'));

alter table orders add column addition_of text references orders(id);
create index orders_addition_of_idx on orders (addition_of) where addition_of is not null;
