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
