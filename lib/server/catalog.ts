// Read-only lookups for the job screens: products (with package parts) and customers. Tax IDs are never returned here.
import "server-only";
import type { PoolClient } from "pg";

export async function searchProducts(c: PoolClient, q: { q?: string; type?: number; dept?: number; ids?: number[]; limit?: number }) {
  const where: string[] = []; const args: unknown[] = [];
  if (q.ids?.length) { args.push(q.ids); where.push(`p.id = any($${args.length}::int[])`); }
  if (q.q) { args.push(`%${q.q}%`); where.push(`(p.code ilike $${args.length} or p.description ilike $${args.length})`); }
  if (q.type) { args.push(q.type); where.push(`p.type = $${args.length}`); }
  if (q.dept) { args.push(q.dept); where.push(`(p.dept = $${args.length} or p.dept = 3)`); }
  args.push(Math.max(1, Math.min(200, q.limit ?? 40)));
  const r = await c.query(`select p.id, p.code, p.description as "desc", p.type, p.dept, p.price, p.discountable, p.max_disc as "maxDisc", p.stock,
      coalesce((select json_agg(json_build_array(k.child_id, k.ratio, k.price) order by k.child_id) from kit_parts k where k.parent_id = p.id), '[]') as kit,
      coalesce((select json_agg(json_build_object('id', ch.id, 'code', ch.code, 'desc', ch.description)) from kit_parts k join products ch on ch.id = k.child_id where k.parent_id = p.id), '[]') as "kitProducts"
    from products p ${where.length ? "where " + where.join(" and ") : ""} order by p.sort nulls last, p.code limit $${args.length}`, args);
  return r.rows;
}

export async function searchCustomers(c: PoolClient, q: string, limit = 20) {
  const r = await c.query(`select id, code, name, job_type, default_disc, billing_addr, phone, flagged_new from customers
    where name ilike $1 or code ilike $1 order by name limit $2`, [`%${q}%`, Math.max(1, Math.min(100, limit))]);
  return r.rows;
}

/** Crew and their position rates for the job's crew picker. Never returns what we pay crew (crew_rate_costs). */
export async function searchCrew(c: PoolClient, q: string, dept?: number, limit = 40) {
  const args: unknown[] = [`%${q}%`]; let deptSql = "";
  if (dept && dept !== 3) { args.push(dept); deptSql = `and (r.dept is null or r.dept = $${args.length})`; }
  args.push(Math.max(1, Math.min(100, limit)));
  const r = await c.query(`select cr.id as "crewId", trim(concat_ws(' ', cr.first_name, cr.last_name)) as name, cr.nick, cr.code as "crewCode",
      r.position_id as "positionId", r.rate_no as "rateNo", r.needs_review as "needsReview", r.dept, r.price, r.price_ot as "priceOt",
      p.code as "posCode", p.name as "posName"
    from crew cr join crew_rates r on r.crew_id = cr.id left join positions p on p.id = r.position_id
    where cr.enabled and r.enabled ${deptSql}
      and (cr.first_name ilike $1 or cr.last_name ilike $1 or cr.nick ilike $1 or cr.code ilike $1 or p.name ilike $1 or p.code ilike $1)
    order by cr.first_name, p.sort nulls last, r.rate_no limit $${args.length}`, args);
  return r.rows;
}

export async function listRepairs(c: PoolClient, status?: string) {
  const args: unknown[] = []; let where = "";
  if (status) { args.push(status); where = "where r.status = $1"; }
  const r = await c.query(`select r.id, r.created_at as at, r.pid, r.code, r.description as "desc", r.qty, r.status, r.note, o.no as "orderNo", r.order_id as "orderId"
    from repairs r left join orders o on o.id = r.order_id ${where} order by r.created_at desc limit 500`, args);
  return r.rows;
}
