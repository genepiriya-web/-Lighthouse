// Daily job board (Gene, 27 Oct 2026; replaces the "กระดานงาน" Excel). A day's board lists every job working that day
// (Quote and Cancel left out) with what the job already knows — customer, DOP, title, sales, gaffer, crew, trucks and
// generators on its items — next to the board entry for that day: location and time, head, electricians, trucks with
// drivers, generators with operators, remark. Sections follow the Excel: department, then "ละคร" (job type TVD) or "โฆษณา".
import "server-only";
import type { PoolClient } from "pg";
import type { Caller } from "./auth";
import { ApiError, bad } from "./http";
import { crewName } from "../quoteform";

export const BOARD_FIELDS = ["loc", "onloc", "head", "crew", "trucks", "gens", "remark"] as const;
type Field = typeof BOARD_FIELDS[number];
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
export const canEditBoard = (role: string) => role === "admin" || role === "sale" || role === "store"; // sale includes Support

const GEN = /^(ultra silent\s+)?generator\b/i, TRUCK = /truck|รถ|van\b|pick ?up|6 ?wheel|10 ?wheel/i;

export async function getBoard(c: PoolClient, day: unknown) {
  if (!isDay(day)) throw bad("bad_date", "day must be YYYY-MM-DD");
  const jobs = (await c.query(`select o.id, o.no, o.owner, o.status, o.customer_name, o.dop, o.job_title, o.job_type, o.dept, o.sale, o.gaffer, o.key_grip,
      o.note, o.ship, o.ret, o.use_start, o.use_end, o.addition_of, a.no as addition_of_no
    from orders o left join orders a on a.id = o.addition_of
    where o.status not in ('Quote','Cancel') and coalesce(o.use_start, o.ship) <= $1 and coalesce(o.use_end, o.ret) >= $1
    order by o.dept nulls last, o.no`, [day])).rows;
  const ids = jobs.map(j => j.id);
  const lines = ids.length ? (await c.query(`select order_id, t, description as "desc", code, qty, parent_k from order_lines where order_id = any($1) order by order_id, sort`, [ids])).rows : [];
  const entries = ids.length ? (await c.query(`select * from board_entries where order_id = any($1) and day = $2`, [ids, day])).rows : [];
  // the latest earlier day's entry of each job, so a team that stays the same can be copied forward
  const prev = ids.length ? (await c.query(`select distinct on (order_id) * from board_entries where order_id = any($1) and day < $2 order by order_id, day desc`, [ids, day])).rows : [];
  const byJob = <T extends { order_id: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) m.set(r.order_id, [...(m.get(r.order_id) ?? []), r]); return m; };
  const L = byJob(lines), E = new Map(entries.map(e => [e.order_id, e])), P = new Map(prev.map(e => [e.order_id, e]));
  return {
    day,
    jobs: jobs.map(j => {
      const ls = (L.get(j.id) ?? []).filter(l => !l.parent_k);
      const fromJob = {
        crew: ls.filter(l => l.t === 5 || l.t === 7).map(l => { const w = crewName(l); const name = w.name || l.code || "—"; return (w.pos ? `${name} (${w.pos})` : name) + (+l.qty > 1 ? ` ×${+l.qty}` : ""); }),
        gens: ls.filter(l => GEN.test(String(l.desc ?? "").trim())).map(l => String(l.desc).trim()),
        trucks: ls.filter(l => l.t === 4 && !GEN.test(String(l.desc ?? "").trim()) && TRUCK.test(String(l.desc ?? ""))).map(l => String(l.desc).trim() + (+l.qty > 1 ? ` ×${+l.qty}` : "")),
      };
      return { ...j, section: j.job_type === "TVD" ? "drama" : "ads", fromJob, entry: E.get(j.id) ?? null, prev: P.get(j.id) ?? null };
    }),
  };
}

/** One job's entry for one day. Whole entry each time (blank = cleared); refused if someone saved it since you loaded it. */
export async function saveBoardEntry(c: PoolClient, who: Caller, orderId: string, day: unknown, b: Record<string, unknown>) {
  if (!canEditBoard(who.role)) throw new ApiError(403, "rRole", "Your role can't change the board");
  if (!isDay(day)) throw bad("bad_date", "day must be YYYY-MM-DD");
  const o = (await c.query("select id, no from orders where id = $1", [orderId])).rows[0];
  if (!o) throw new ApiError(404, "not_found");
  const f = {} as Record<Field, string | null>;
  for (const k of BOARD_FIELDS) { const v = b[k]; if (v != null && typeof v !== "string") throw bad("bad_field", k);
    const s = String(v ?? "").trim(); if (s.length > 2000) throw bad("too_long", k); f[k] = s || null; }
  const cur = (await c.query("select * from board_entries where order_id = $1 and day = $2 for update", [orderId, day])).rows[0];
  if (cur && b.updatedAt !== new Date(cur.updated_at).toISOString()) throw new ApiError(409, "stale", "Someone changed this job's board entry after you opened it. Reload and try again.");
  if (!cur && b.updatedAt) throw new ApiError(409, "stale", "This job's board entry was removed after you opened it. Reload and try again.");
  const changed = Object.fromEntries(BOARD_FIELDS.filter(k => (cur?.[k] ?? null) !== f[k]).map(k => [k, [cur?.[k] ?? null, f[k]]]));
  const r = (await c.query(`insert into board_entries (order_id, day, ${BOARD_FIELDS.join(", ")}, updated_at, updated_by, updated_by_name)
      values ($1, $2, ${BOARD_FIELDS.map((_, i) => `$${i + 3}`).join(", ")}, now(), $${BOARD_FIELDS.length + 3}, $${BOARD_FIELDS.length + 4})
      on conflict (order_id, day) do update set ${BOARD_FIELDS.map(k => `${k} = excluded.${k}`).join(", ")}, updated_at = now(), updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name
      returning *`, [orderId, day, ...BOARD_FIELDS.map(k => f[k]), who.id, who.name])).rows[0];
  if (Object.keys(changed).length) await c.query("insert into activity (actor, actor_name, entity, entity_id, action, detail) values ($1,$2,'order',$3,'board',$4)",
    [who.id, who.name, orderId, { day, changed }]);
  return { entry: r };
}
