// CEO Cockpit (admin): logic.js diagnose() over every open job — legacy and v2 — exactly as the artifact ran it in the browser.
import "server-only";
import type { PoolClient } from "pg";
import { diagnose, OPEN, type Product } from "../logic";

export async function cockpit(c: PoolClient, today: string) {
  const orders = (await c.query(`select id, no, owner, status, customer_name, sale, ship, ret, use_start, use_end, usage, totals, legacy_totals, adjust
    from orders where status = any($1::text[])`, [OPEN])).rows.map(o => ({ id: o.id, no: o.no, owner: o.owner, status: o.status, customerName: o.customer_name ?? "", sale: o.sale ?? "",
      ship: o.ship ?? "", ret: o.ret ?? "", useStart: o.use_start ?? "", useEnd: o.use_end ?? "", usage: o.usage ?? [], totals: o.totals ?? {}, legacyTotals: o.legacy_totals ?? undefined, adjust: o.adjust }));
  const lines = (await c.query(`select l.order_id, l.k, l.t, l.pid, l.code, l.description as "desc", l.list, l.qty, l.days, l.disc, l.foc, l.sb, l.ot, l.ot_rate as "otRate",
      l.parent_k as parent, l.start_date as start, l.end_date as "end", l.crew_id as "crewId"
    from order_lines l join orders o on o.id = l.order_id where o.status = any($1::text[]) order by l.order_id, l.sort`, [OPEN])).rows;
  const byId: Record<string, { items: any[] }> = {};
  for (const l of lines) (byId[l.order_id] ??= { items: [] }).items.push({ ...l, start: l.start ?? undefined, end: l.end ?? undefined, crewId: l.crewId ?? undefined });
  const cat = new Map<number, Product>((await c.query(`select id, code, description as "desc", type, price, stock, discountable, max_disc as "maxDisc" from products`)).rows.map(p => [p.id, p]));
  const R = diagnose(orders, byId, cat, today);
  const asOf = (await c.query("select max(at) at from import_runs")).rows[0]?.at ?? null;
  return { ...R, asOf, owners: Object.fromEntries(orders.map(o => [o.no, { id: o.id, owner: o.owner, customerName: o.customerName }])) };
}
