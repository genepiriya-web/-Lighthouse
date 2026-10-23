-- Gene, 23 Oct 2026 (replaces the Q21b block): sales may set any price, but a job whose prices are below catalog or
-- over the discount limit cannot move to Shipped until the CEO confirms them.
-- price_approval = { by, by_name, at, breaks: [{ k, code, rule, value, limit }] } — the breaks the CEO confirmed.
-- A break counts as confirmed only while its line, rule and value are unchanged; any further change needs a new approval.
alter table orders add column price_approval jsonb;
