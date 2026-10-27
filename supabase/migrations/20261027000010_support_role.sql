-- Support role (Gene, 27 Oct 2026; Q34/Q36d, part of the approved M7a): Support is its own role, with the same rights as
-- Sales. Policies keep reading app_role(), which reports a Support member as 'sale', so every Sales policy covers Support
-- without listing it twice. The server maps the same way (lib/server/auth.ts requireStaff).
alter table staff drop constraint staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin','sale','store','accounting','crew','support'));
alter table staff_invites drop constraint staff_invites_role_check;
alter table staff_invites add constraint staff_invites_role_check check (role in ('admin','sale','store','accounting','crew','support'));

create or replace function app_role() returns text language sql stable security definer set search_path = public as $$
  select case role when 'support' then 'sale' else role end from staff where user_id = auth.uid() and active
$$;
