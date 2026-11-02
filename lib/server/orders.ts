// Order service: every change to a job goes through here. Rules come from src/logic.js (moveCheck, canEditLines,
// orderTotals, usageOf, syncChildren, bookedQty) exactly as the artifact page applies them; the extra rules below are
// the artifact's own UI rules (who may edit the header and money fields, check-out/in limits), now enforced server-side.
//
// Every write: locks the order row, refuses legacy jobs, checks the caller's role, checks `rev` (optimistic version),
// recomputes totals/usage from the stored lines, bumps rev, and appends to `activity` — all in one transaction.
import "server-only";
import type { PoolClient } from "pg";
import {
  STOCKED_TYPES, MOVES, orderTotals, usageOf, bookedQty, r2,
  type Line, type Order, type Status,
} from "../logic";
import { ApiError, bad } from "./http";
import { orderTotalsV2 } from "../pricing";
import { priceBreaks, unapproved, canEditField, canEditMoney, STORE_ADD, HOLDING, STORE_ADD_TYPES, canEditItems, moveCheckV2, DEFAULT_SALES_PEOPLE, canDiscount, syncChildrenV2, type PriceBreak, type PriceApproval } from "../rules";
import type { Caller } from "./auth";
import { wordsMatch } from "./search";

// ---------- shapes ----------
const HEADER_FIELDS = {
  dop: "dop", rentType: "rent_type", dpw: "dpw", customerId: "customer_id", customerName: "customer_name", jobTitle: "job_title",
  jobType: "job_type", dept: "dept", billing: "billing", phone: "phone", fax: "fax", ship: "ship", ret: "ret", useStart: "use_start",
  useEnd: "use_end", contact: "contact", contactPhone: "contact_phone", sale: "sale", tax: "tax", footerId: "footer_id",
  remarkId: "remark_id", pm: "pm", gaffer: "gaffer", keyGrip: "key_grip", note: "note",
} as const;
const MONEY_FIELDS = { extraDisc: "extra_disc", insurance: "insurance", adjust: "adjust" } as const;
type HeaderKey = keyof typeof HEADER_FIELDS;
type MoneyKey = keyof typeof MONEY_FIELDS;

export interface OrderRow {
  id: string; no: string; owner: "legacy" | "v2"; status: Status; customer_id: string | null; customer_name: string | null;
  ship: string | null; ret: string | null; use_start: string | null; use_end: string | null; rent_type: string; dpw: number | null;
  tax: string; extra_disc: number; insurance: number; adjust: number; rev: number; usage: Array<[number, number]> | null;
  totals: unknown; sale: string | null; [k: string]: unknown;
}

const toLogicOrder = (o: OrderRow): Order => ({
  id: o.id, no: o.no, status: o.status, customerName: o.customer_name ?? "", ship: o.ship ?? "", ret: o.ret ?? "",
  useStart: o.use_start ?? "", useEnd: o.use_end ?? "", rentType: o.rent_type, dpw: o.dpw ?? 0, tax: o.tax,
  extraDisc: o.extra_disc, insurance: o.insurance, adjust: o.adjust, usage: o.usage ?? [], sale: o.sale ?? "",
});

/** A stored line always has its key. */
type SLine = Line & { k: string };

const LINE_COLS = `k, sort, t, pid, code, description as "desc", list, qty, days, disc, foc, sb, ot, ot_rate as "otRate", ratio,
  parent_k as parent, start_date as start, end_date as "end", out_qty as out, in_qty as "in", dmg, lost, repaired, crew_id as "crewId", remark`;

async function loadLines(c: PoolClient, id: string): Promise<SLine[]> {
  return (await c.query(`select ${LINE_COLS} from order_lines where order_id = $1 order by sort`, [id])).rows;
}

async function lockOrder(c: PoolClient, id: string): Promise<OrderRow> {
  const r = await c.query("select * from orders where id = $1 for update", [id]);
  if (!r.rowCount) throw new ApiError(404, "not_found");
  return r.rows[0];
}

/** Locks the order and runs the checks every write shares: exists, not legacy, caller sent the current rev. */
async function openForWrite(c: PoolClient, id: string, rev: unknown): Promise<OrderRow> {
  const o = await lockOrder(c, id);
  if (o.owner === "legacy") throw new ApiError(409, "legacy_read_only", "This job belongs to the old system until cutover");
  if (typeof rev !== "number" || !Number.isInteger(rev)) throw bad("rev_required", "Send the rev you last read");
  if (rev !== o.rev) throw new ApiError(409, "stale", "Someone saved this job after you opened it. Reload and try again.", { currentRev: o.rev });
  return o;
}

async function logActivity(c: PoolClient, who: Caller, entityId: string, action: string, detail: Record<string, unknown>) {
  await c.query("insert into activity (actor, actor_name, entity, entity_id, action, detail) values ($1,$2,'order',$3,$4,$5)",
    [who.id, who.name, entityId, action, detail]);
}

/** Recompute totals and usage from the stored lines and bump rev. Totals sent by a client are never trusted (flaw 7). */
async function finish(c: PoolClient, o: OrderRow, who: Caller, patch: Record<string, unknown> = {}): Promise<number> {
  const lines = await loadLines(c, o.id);
  const money = { ...toLogicOrder(o), ...pickMoney(patch) };
  const cols: Record<string, unknown> = { ...patch, totals: orderTotalsV2(lines, { ...money, owner: o.owner }), usage: usageOf(lines), rev: o.rev + 1, updated_at: new Date().toISOString(), updated_by: who.id };
  const keys = Object.keys(cols);
  const r = await c.query(`update orders set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1 returning rev`,
    [o.id, ...keys.map(k => (k === "totals" || k === "usage") ? JSON.stringify(cols[k]) : cols[k])]);
  return r.rows[0].rev;
}
const pickMoney = (p: Record<string, unknown>) => ({
  ...(p.extra_disc !== undefined && { extraDisc: p.extra_disc as number }), ...(p.insurance !== undefined && { insurance: p.insurance as number }),
  ...(p.adjust !== undefined && { adjust: p.adjust as number }), ...(p.tax !== undefined && { tax: p.tax as string }),
});

const bangkokToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

// ---------- input cleaning (mirrors the artifact's field handling) ----------
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
function cleanHeader(k: HeaderKey, v: unknown): unknown {
  if (v === null || v === "") return k === "rentType" ? "Daily" : k === "tax" ? "Vat" : null;
  switch (k) {
    case "ship": case "ret": case "useStart": case "useEnd": if (!isDate(v)) throw bad("bad_date", `${k} must be YYYY-MM-DD`); return v;
    case "dept": if (![1, 2, 3].includes(Number(v))) throw bad("bad_dept"); return Number(v);
    case "dpw": { const n = Number(v); if (!isFinite(n)) throw bad("bad_dpw"); return Math.max(0, Math.min(7, n)); }
    case "rentType": if (v !== "Daily" && v !== "Weekly") throw bad("bad_rent_type"); return v;
    case "tax": if (v !== "Vat" && v !== "Not Vat") throw bad("bad_tax"); return v;
    case "jobType": if (!["CO-PRO", "FILM", "SP", "TVC", "TVD"].includes(String(v))) throw bad("bad_job_type"); return v;
    default: if (typeof v !== "string" && typeof v !== "number") throw bad("bad_field", k); return String(v).slice(0, 2000);
  }
}
function cleanMoney(k: MoneyKey, v: unknown): number {
  const n = Number(v ?? 0); if (!isFinite(n)) throw bad("bad_number", k);
  if (k === "extraDisc") return Math.max(0, Math.min(100, n));
  if (k === "insurance") return Math.max(0, n);
  return r2(n); // adjust may be negative
}


/** The sales person must be one from the list in settings (Gene, 27 Oct). A job keeps an older name it already has. */
async function checkSale(c: PoolClient, sale: unknown, current?: unknown) {
  if (sale == null || sale === "" || sale === current) return;
  const list = (await c.query("select value from settings where key = 'sales_people'")).rows[0]?.value ?? DEFAULT_SALES_PEOPLE;
  if (Array.isArray(list) && list.length && !list.includes(sale)) throw bad("bad_sale", "Pick the sales person from the list");
}

async function resolveCustomer(c: PoolClient, fields: Record<string, unknown>) {
  // Prefer the customer id (fixes L4: the artifact matched by name). Fill billing/phone from the customer when empty.
  if (fields.customer_id) {
    const r = await c.query("select id, name, billing_addr, phone from customers where id = $1", [fields.customer_id]);
    if (!r.rowCount) throw bad("unknown_customer");
    const cu = r.rows[0];
    fields.customer_name ??= cu.name;
    if (!fields.billing) fields.billing = cu.billing_addr; if (!fields.phone) fields.phone = cu.phone;
  }
}

// ---------- reads ----------
// "open" leaves out quotes whose dates ended more than QUOTE_DAYS ago, as the old-system sync does: the old system keeps
// every quote (~800 since 2023 in the history import of 3 Nov 2026). Those are still found by search and the Quote filter.
export const QUOTE_DAYS = 30;
export async function listOrders(c: PoolClient, q: { status?: string; search?: string; limit?: number; before?: string }) {
  const where: string[] = []; const args: unknown[] = [];
  if (q.status === "open") where.push(`(status in ('Order','Approve','Shipped','Returned','Store Add')
    or (status = 'Quote' and coalesce(ret, ship, created_at::date) >= current_date - ${QUOTE_DAYS}))`);
  else if (q.status) { args.push(q.status); where.push(`status = $${args.length}`); }
  const m = wordsMatch(["no", "job_title", "customer_name", "dop"], q.search, args); if (m) where.push(m);
  // newest number first; the old system's Q-numbered quotes (Q6700001) sit by their digits, among the jobs of their year
  if (q.before) { args.push(q.before); where.push(`(ltrim(no, 'Q'), no) < (ltrim($${args.length}, 'Q'), $${args.length})`); }
  const limit = Math.max(1, Math.min(500, q.limit ?? 100)); args.push(limit);
  const r = await c.query(`select id, no, owner, status, customer_name, job_title, job_type, dept, ship, ret, dop, sale, totals, rev, addition_of
    from orders ${where.length ? "where " + where.join(" and ") : ""} order by ltrim(no, 'Q') desc, no desc limit $${args.length}`, args);
  return { orders: r.rows, next: r.rowCount === limit ? r.rows[r.rows.length - 1].no : null };
}

export async function getOrder(c: PoolClient, id: string) {
  const r = await c.query("select * from orders where id = $1", [id]);
  if (!r.rowCount) throw new ApiError(404, "not_found");
  const activity = (await c.query("select at, actor_name, action, detail from activity where entity='order' and entity_id=$1 order by at, id", [id])).rows;
  const lines = await loadLines(c, id);
  const needsCeo = unapproved(await priceBreaksOf(c, lines), r.rows[0].price_approval);
  const customer = r.rows[0].customer_id ? (await c.query("select id, name, default_disc from customers where id = $1", [r.rows[0].customer_id])).rows[0] ?? null : null;
  // Store additions (Gene, 27 Oct): the jobs added to this one, and the job this one was added to
  const additions = (await c.query("select id, no, status, rev from orders where addition_of = $1 order by no", [id])).rows;
  const additionOf = r.rows[0].addition_of ? (await c.query("select id, no, status from orders where id = $1", [r.rows[0].addition_of])).rows[0] ?? null : null;
  return { order: r.rows[0], lines, activity, needsCeo, customer, additions, additionOf };
}

// ---------- writes ----------
export async function createOrder(c: PoolClient, who: Caller, body: Record<string, unknown>) {
  if (who.role !== "admin" && who.role !== "sale") throw new ApiError(403, "rRole");
  const f: Record<string, unknown> = {};
  for (const k of Object.keys(HEADER_FIELDS) as HeaderKey[]) if (body[k] !== undefined) f[HEADER_FIELDS[k]] = cleanHeader(k, body[k]);
  await resolveCustomer(c, f); await checkSale(c, f.sale);
  if (!String(f.customer_name ?? "").trim()) throw bad("needCust", "Choose a customer");
  if (!String(f.job_title ?? "").trim()) throw bad("needTitle", "Add a job title");
  if (f.ship && f.ret && String(f.ret) < String(f.ship)) throw bad("badDates", "Return date must be on or after the ship date");
  const no: string = (await c.query("select next_order_no() n")).rows[0].n;
  const cols = { id: no, no, owner: "v2", status: "Quote", rev: 0, created_by: who.id, created_by_name: who.name, updated_by: who.id,
    totals: JSON.stringify(orderTotals([], { tax: (f.tax as string) ?? "Vat" })), usage: "[]", ...f };
  const keys = Object.keys(cols);
  await c.query(`insert into orders (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(k => (cols as Record<string, unknown>)[k]));
  await logActivity(c, who, no, "created", { no });
  return { id: no, no, rev: 0 };
}

export async function updateOrder(c: PoolClient, who: Caller, id: string, body: Record<string, unknown>) {
  const o = await openForWrite(c, id, body.rev);
  const patch: Record<string, unknown> = {}; const changed: Record<string, [unknown, unknown]> = {};
  const header = (Object.keys(HEADER_FIELDS) as HeaderKey[]).filter(k => body[k] !== undefined);
  const money = (Object.keys(MONEY_FIELDS) as MoneyKey[]).filter(k => body[k] !== undefined);
  const unknownKeys = Object.keys(body).filter(k => k !== "rev" && !(k in HEADER_FIELDS) && !(k in MONEY_FIELDS));
  if (unknownKeys.length) throw bad("unknown_fields", unknownKeys.join(", "));
  if (!header.length && !money.length) throw bad("nothing_to_change");
  if (header.some(k => !canEditField(who.role, o.status, k))) throw new ApiError(403, "rRole", "Your role can't change job details at this stage");
  if (money.length && !canEditMoney(who.role, o.status)) throw new ApiError(403, "rRole", "Your role can't change discounts or fees at this stage");
  for (const k of header) patch[HEADER_FIELDS[k]] = cleanHeader(k, body[k]);
  for (const k of money) patch[MONEY_FIELDS[k]] = cleanMoney(k, body[k]);
  if (patch.customer_id !== undefined) await resolveCustomer(c, patch);
  if (patch.sale !== undefined) await checkSale(c, patch.sale, o.sale);
  const ship = (patch.ship !== undefined ? patch.ship : o.ship) as string | null, ret = (patch.ret !== undefined ? patch.ret : o.ret) as string | null;
  if (ship && ret && ret < ship) throw bad("badDates", "Return date must be on or after the ship date");
  for (const [col, v] of Object.entries(patch)) if (o[col] !== v) changed[col] = [o[col] ?? null, v];
  const rev = await finish(c, o, who, patch);
  await logActivity(c, who, id, "header", { changed });
  // New dates on a job that holds (or has) the gear: say at once if something is now short. Not refused — the dates are
  // what the client asked for; the clash shows here and still blocks the next status move as before.
  let short: Array<{ pid: number; short: number }> = [];
  if ((changed.ship || changed.ret) && ship && ret && [...HOLDING, "Shipped"].includes(o.status))
    short = await stockIssues(c, { ...o, ship, ret }, await loadLines(c, id), true);
  return { id, rev, ...(short.length && { short }) };
}

const LINE_NUM = ["list", "qty", "days", "disc", "ot", "otRate", "ratio"] as const;
function cleanLines(input: unknown): SLine[] {
  if (!Array.isArray(input) || input.length > 2000) throw bad("lines_must_be_array");
  const ks = new Set<string>();
  const out = input.map((raw, i): SLine => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const k = String(l.k ?? ""); if (!k || k.length > 64 || ks.has(k)) throw bad("bad_line_key", `line ${i + 1}`); ks.add(k);
    const t = Number(l.t); if (!Number.isInteger(t) || t < 1 || t > 7) throw bad("bad_line_type", `line ${i + 1}`);
    const n: Record<string, number | null> = {};
    for (const f of LINE_NUM) { const v = l[f]; if (v === undefined || v === null || v === "") { n[f] = f === "ot" || f === "otRate" || f === "ratio" ? null : 0; continue; }
      const x = Number(v); if (!isFinite(x) || x < 0) throw bad("bad_line_number", `line ${i + 1} ${f}`); n[f] = x; }
    // Same normalisation as the artifact's item table: whole quantities, half days, discount 0–100.
    n.qty = Math.round(n.qty as number); n.days = Math.round((n.days as number) * 2) / 2; n.disc = canDiscount(t) ? Math.min(100, n.disc as number) : 0; // Equipment only (Gene, 27 Oct)
    for (const d of ["start", "end"] as const) if (l[d] != null && l[d] !== "" && !isDate(l[d])) throw bad("bad_date", `line ${i + 1} ${d}`);
    return { k, t, pid: l.pid == null || l.pid === "" ? null : Number(l.pid), code: l.code == null ? "" : String(l.code).slice(0, 100),
      desc: l.desc == null ? "" : String(l.desc).slice(0, 500), list: n.list as number, qty: n.qty as number, days: n.days as number, disc: n.disc as number,
      foc: !!l.foc, sb: !!l.sb, ot: n.ot ?? undefined, otRate: n.otRate ?? undefined, ratio: n.ratio ?? undefined,
      parent: l.parent ? String(l.parent) : null, start: (l.start as string) || undefined, end: (l.end as string) || undefined,
      crewId: l.crewId == null || l.crewId === "" ? undefined : String(l.crewId), remark: l.remark == null ? "" : String(l.remark).slice(0, 1000) };
  });
  for (const l of out) if (l.parent && !ks.has(String(l.parent))) throw bad("bad_parent", `line ${l.k}`);
  return syncChildrenV2(out);
}

function diffLines(before: SLine[], after: SLine[]) {
  const b = new Map(before.map(l => [l.k, l])), a = new Map(after.map(l => [l.k, l]));
  const added = after.filter(l => !b.has(l.k)).map(l => ({ k: l.k, code: l.code, qty: l.qty, list: l.list }));
  const removed = before.filter(l => !a.has(l.k)).map(l => ({ k: l.k, code: l.code }));
  const changed: Record<string, Record<string, [unknown, unknown]>> = {};
  for (const l of after) { const p = b.get(l.k); if (!p) continue; const d: Record<string, [unknown, unknown]> = {};
    for (const f of ["t", "pid", "code", "list", "qty", "days", "disc", "foc", "sb", "ot", "otRate", "parent", "start", "end", "remark"] as const)
      if ((p[f] ?? null) !== (l[f] ?? null) && !(p[f] == null && l[f] === "") ) d[f] = [p[f] ?? null, l[f] ?? null];
    if (Object.keys(d).length) changed[l.k] = d; }
  return { added, removed, changed };
}

export async function saveLines(c: PoolClient, who: Caller, id: string, body: Record<string, unknown>) {
  const o = await openForWrite(c, id, body.rev);
  if (!canEditItems(who.role, o.status)) throw new ApiError(403, "rRole", "Your role can't change items at this stage");
  let lines = cleanLines(body.lines);
  const before = await loadLines(c, id);
  if (who.role === "store") lines = storePrices(lines, before);
  const keep = new Map(before.map(l => [l.k, l])); // check-out/in counts are not editable here; carry them over
  await c.query("delete from order_lines where order_id = $1", [id]);
  if (lines.length) await insertLines(c, id, lines.map(l => { const p = keep.get(l.k); return { ...l, out: p?.out ?? 0, in: p?.in ?? 0, dmg: p?.dmg ?? 0, lost: p?.lost ?? 0, repaired: p?.repaired ?? false }; }));
  const rev = await finish(c, o, who);
  const pending = unapproved(await priceBreaksOf(c, lines), o.price_approval as PriceApproval | null);
  await logActivity(c, who, id, "items", { ...diffLines(before, lines), ...(pending.length && { needsCeo: pending }) });
  // A Store addition holds stock as soon as it is saved, so say at once if something is short (it is not refused: the
  // gear is needed now and Store can see the shelf).
  const short = o.status === STORE_ADD ? await stockIssues(c, o, lines) : [];
  return { id, rev, needsCeo: pending, ...(short.length && { short }) };
}

/** Store adds items only (no crew) and never sets prices: new lines come in at 0 for Sales to price; lines already on
 *  the job keep the prices they have, whatever the request says. */
function storePrices(lines: SLine[], before: SLine[]): SLine[] {
  const had = new Map(before.map(l => [l.k, l]));
  return lines.map(l => {
    if (!STORE_ADD_TYPES.includes(l.t)) throw new ApiError(403, "store_items_only", "Store can add items, not crew");
    const p = had.get(l.k);
    return { ...l, list: p ? p.list : 0, disc: p ? p.disc : 0, foc: p ? p.foc : false, sb: p ? p.sb : false, ot: p?.ot, otRate: p?.otRate };
  });
}


async function insertLines(c: PoolClient, id: string, lines: SLine[]) {
  await c.query(`insert into order_lines (order_id,k,sort,t,pid,code,description,list,qty,days,disc,foc,sb,ot,ot_rate,ratio,parent_k,start_date,end_date,out_qty,in_qty,dmg,lost,repaired,crew_id,remark)
    select $1, x.k, x.sort, x.t, x.pid, x.code, x."desc", x.list, x.qty, x.days, x.disc, x.foc, x.sb, x.ot, x."otRate", x.ratio, x.parent, x.start::date, x."end"::date,
      x.out, x."in", x.dmg, x.lost, x.repaired, x."crewId", x.remark
    from json_to_recordset($2) as x(k text, sort int, t int, pid int, code text, "desc" text, list numeric, qty numeric, days numeric, disc numeric, foc bool, sb bool,
      ot numeric, "otRate" numeric, ratio numeric, parent text, start text, "end" text, out numeric, "in" numeric, dmg numeric, lost numeric, repaired bool, "crewId" text, remark text)`,
    [id, JSON.stringify(lines.map((l, i) => ({ ...l, sort: i, out: l.out ?? 0, in: l.in ?? 0, dmg: l.dmg ?? 0, lost: l.lost ?? 0, repaired: l.repaired ?? false })))]);
}

/** Every line priced below catalog or discounted past its limit (lib/rules.ts). */
async function priceBreaksOf(c: PoolClient, lines: SLine[]): Promise<PriceBreak[]> {
  const pids = [...new Set(lines.map(l => l.pid).filter((x): x is number => x != null))];
  if (!pids.length) return [];
  const cat = new Map((await c.query(`select id, price, discountable, max_disc as "maxDisc" from products where id = any($1::int[])`, [pids])).rows.map(r => [r.id, r]));
  return lines.flatMap(l => priceBreaks(l, l.pid == null ? undefined : cat.get(l.pid)));
}

/** CEO (admin role) confirms the job's current special prices. Needed before the job can move to Shipped. */
export async function approvePrices(c: PoolClient, who: Caller, id: string, body: Record<string, unknown>) {
  if (who.role !== "admin") throw new ApiError(403, "rRole", "Only the CEO can confirm special prices");
  const o = await openForWrite(c, id, body.rev);
  if (!["Quote", "Order", "Approve", STORE_ADD].includes(o.status)) throw bad("wrong_status", "Prices are confirmed before shipping");
  const breaks = await priceBreaksOf(c, await loadLines(c, id));
  if (!unapproved(breaks, o.price_approval as PriceApproval | null).length) throw bad("nothing_to_approve");
  const approval: PriceApproval = { by: who.id, by_name: who.name, at: new Date().toISOString(), breaks };
  const rev = await finish(c, o, who, { price_approval: JSON.stringify(approval) });
  await logActivity(c, who, id, "prices_approved", { breaks });
  return { id, rev };
}

/** Items short on the job's dates, counting every job that holds stock — legacy and v2 alike (flaw 1). */
async function stockIssues(c: PoolClient, o: OrderRow, lines: Line[], evenShipped = false) {
  if (!o.ship || !o.ret || ["Returned", "Draft INV", "Cancel", ...(evenShipped ? [] : ["Shipped"])].includes(o.status)) return [];
  const need: Record<number, number> = {};
  for (const l of lines) if (STOCKED_TYPES.includes(l.t) && l.pid) need[l.pid] = (need[l.pid] || 0) + (Number(l.qty) || 0);
  const pids = Object.keys(need).map(Number); if (!pids.length) return [];
  const stock = new Map<number, number>((await c.query("select id, stock from products where id = any($1::int[])", [pids])).rows.map(r => [r.id, Math.max(0, r.stock)]));
  const others = (await c.query(`select id, status, ship, ret, usage from orders where status = any($1::text[]) and id <> $2
    and ship <= $3 and (ret >= $4 or status = 'Shipped')`, [HOLDING, o.id, o.ret, o.ship])).rows.map(r => ({ id: r.id, status: r.status, ship: r.ship, ret: r.ret, usage: r.usage ?? [] }));
  const today = bangkokToday(); const out = [];
  for (const pid of pids) { const free = (stock.get(pid) ?? 0) - bookedQty(pid, o.ship, o.ret, others, o.id, today, HOLDING as never); if (need[pid] > free) out.push({ pid, short: need[pid] - Math.max(0, free) }); }
  return out;
}

export async function moveOrder(c: PoolClient, who: Caller, id: string, body: Record<string, unknown>) {
  const o = await openForWrite(c, id, body.rev);
  const to = String(body.to ?? "");
  if (![...Object.keys(MOVES), "Draft INV", "Cancel"].includes(to)) throw bad("rFlow", "Unknown status");
  const lines = await loadLines(c, id);
  const issues = await stockIssues(c, o, lines);
  const why = moveCheckV2(who.role, toLogicOrder(o), to, lines, issues);
  if (why) throw new ApiError(why === "rRole" ? 403 : 422, why, undefined, why === "rClash" ? { issues } : undefined);
  if (to === "Shipped") { // special prices need the CEO before the gear leaves (Gene, 23 Oct 2026)
    const pending = unapproved(await priceBreaksOf(c, lines), o.price_approval as PriceApproval | null);
    if (pending.length) throw bad("rPriceApproval", "The CEO must confirm the special prices before shipping", { breaks: pending }); }
  const rev = await finish(c, o, who, { status: to });
  await logActivity(c, who, id, "status", { from: o.status, to });
  return { id, rev, status: to };
}

/** Admin correction that skips the flow guards. Needs a reason and is logged as its own action (fixes L2). */
export async function fixStatus(c: PoolClient, who: Caller, id: string, body: Record<string, unknown>) {
  if (who.role !== "admin") throw new ApiError(403, "rRole");
  const o = await openForWrite(c, id, body.rev);
  const to = String(body.to ?? ""); const reason = String(body.reason ?? "").trim();
  if (![...Object.keys(MOVES), "Draft INV", "Cancel"].includes(to) || to === o.status) throw bad("bad_status");
  if (reason.length < 3) throw bad("reason_required", "Say why the status is being corrected");
  const rev = await finish(c, o, who, { status: to });
  await logActivity(c, who, id, "status_fix", { from: o.status, to, reason });
  return { id, rev, status: to };
}

type Count = { k: string; out?: unknown; in?: unknown; dmg?: unknown; lost?: unknown };
const whole = (v: unknown, what: string) => { const n = Number(v); if (!Number.isInteger(n) || n < 0) throw bad("bad_count", what); return n; };

/** Check-out (Approve) or check-in (Shipped) counts. Store and admin only; limits as on the artifact's store table. */
export async function storeCounts(c: PoolClient, who: Caller, id: string, mode: "out" | "in", body: Record<string, unknown>) {
  if (who.role !== "admin" && who.role !== "store") throw new ApiError(403, "rRole");
  const o = await openForWrite(c, id, body.rev);
  if (mode === "out" && o.status !== "Approve") throw bad("wrong_status", "Check out happens at Approve");
  if (mode === "in" && o.status !== "Shipped") throw bad("wrong_status", "Check in happens at Shipped");
  const lines = new Map((await loadLines(c, id)).map(l => [l.k, l]));
  const counts: Count[] = body.all === true
    ? [...lines.values()].filter(l => STOCKED_TYPES.includes(l.t)).map(l => mode === "out" ? { k: l.k, out: l.qty } : { k: l.k, in: l.out, dmg: 0, lost: 0 })
    : (Array.isArray(body.lines) ? body.lines as Count[] : (() => { throw bad("lines_must_be_array"); })());
  const changed: Record<string, Record<string, [number, number]>> = {};
  for (const x of counts) {
    const l = lines.get(String(x?.k)); if (!l) throw bad("unknown_line", String(x?.k));
    if (!STOCKED_TYPES.includes(l.t)) throw bad("not_stocked", l.k);
    const cur = { out: Number(l.out) || 0, in: Number(l.in) || 0, dmg: Number(l.dmg) || 0, lost: Number(l.lost) || 0 };
    const nx = { ...cur };
    if (mode === "out") { if (x.in !== undefined || x.dmg !== undefined || x.lost !== undefined) throw bad("wrong_fields", "Only `out` at check-out");
      if (x.out !== undefined) nx.out = whole(x.out, l.k); if (nx.out > (Number(l.qty) || 0)) throw bad("over_qty", `${l.k}: out ${nx.out} > qty ${l.qty}`); }
    else { if (x.out !== undefined) throw bad("wrong_fields", "`out` is fixed at check-in");
      for (const f of ["in", "dmg", "lost"] as const) if (x[f] !== undefined) nx[f] = whole(x[f], `${l.k} ${f}`);
      if (nx.in + nx.lost > nx.out) throw bad("over_out", `${l.k}: in ${nx.in} + lost ${nx.lost} > out ${nx.out}`);
      if (nx.dmg > nx.in) throw bad("dmg_over_in", `${l.k}: damaged ${nx.dmg} > in ${nx.in}`); }
    const d: Record<string, [number, number]> = {}; for (const f of ["out", "in", "dmg", "lost"] as const) if (nx[f] !== cur[f]) d[f] = [cur[f], nx[f]];
    if (!Object.keys(d).length) continue; changed[l.k] = d;
    await c.query("update order_lines set out_qty=$3, in_qty=$4, dmg=$5, lost=$6 where order_id=$1 and k=$2", [id, l.k, nx.out, nx.in, nx.dmg, nx.lost]);
  }
  const rev = await finish(c, o, who);
  await logActivity(c, who, id, mode === "out" ? "checkout" : "checkin", { changed });
  return { id, rev };
}

/** Store addition (Gene, 27 Oct 2026): from a v2 job at Approve, Store (or admin) opens a linked job for urgent items.
 *  It copies the job's details, starts empty at status Store Add (holding stock as items are added) and logs on both. */
export async function createStoreAddition(c: PoolClient, who: Caller, id: string) {
  if (who.role !== "admin" && who.role !== "store") throw new ApiError(403, "rRole");
  const src = await lockOrder(c, id);
  if (src.owner === "legacy") throw new ApiError(409, "legacy_read_only", "This job belongs to the old system until cutover");
  if (src.status !== "Approve") throw bad("wrong_status", "Store additions are made while the job is at Approve");
  const no: string = (await c.query("select next_order_no() n")).rows[0].n;
  const keep = ["customer_id", "customer_name", "job_type", "dept", "billing", "phone", "fax", "contact", "contact_phone", "dop", "pm", "gaffer",
    "key_grip", "sale", "rent_type", "dpw", "tax", "ship", "ret", "use_start", "use_end", "footer_id", "remark_id"];
  const cols: Record<string, unknown> = { id: no, no, owner: "v2", status: STORE_ADD, addition_of: src.id, job_title: `${src.job_title ?? ""} — Store addition`.trim(),
    rev: 0, created_by: who.id, created_by_name: who.name, updated_by: who.id, totals: JSON.stringify(orderTotals([], { tax: src.tax })), usage: "[]" };
  for (const k of keep) cols[k] = src[k];
  const keys = Object.keys(cols);
  await c.query(`insert into orders (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(k => cols[k]));
  await logActivity(c, who, no, "created", { no, additionOf: src.no });
  await logActivity(c, who, src.id, "store_addition", { no });
  return { id: no, no, rev: 0 };
}

/** Copy a job (legacy or v2) as a new v2 quote: same details and items, counts reset, no price confirmation. */
export async function copyOrder(c: PoolClient, who: Caller, id: string) {
  if (who.role !== "admin" && who.role !== "sale") throw new ApiError(403, "rRole");
  const src = (await c.query("select * from orders where id = $1", [id])).rows[0];
  if (!src) throw new ApiError(404, "not_found");
  const lines = (await loadLines(c, id)).map(l => ({ ...l, disc: canDiscount(l.t) ? l.disc : 0, out: 0, in: 0, dmg: 0, lost: 0, repaired: false }));
  const no: string = (await c.query("select next_order_no() n")).rows[0].n;
  const keep = ["customer_id", "customer_name", "job_title", "job_type", "dept", "billing", "phone", "fax", "contact", "contact_phone", "dop", "pm", "gaffer",
    "key_grip", "note", "sale", "rent_type", "dpw", "tax", "ship", "ret", "use_start", "use_end", "footer_id", "remark_id", "extra_disc", "insurance", "adjust"];
  const money = { extraDisc: src.extra_disc, insurance: src.insurance, adjust: src.adjust, tax: src.tax };
  const cols: Record<string, unknown> = { id: no, no, owner: "v2", status: "Quote", rev: 0, created_by: who.id, created_by_name: who.name, updated_by: who.id,
    totals: JSON.stringify(orderTotalsV2(lines, { ...money, owner: "v2" })), usage: JSON.stringify(usageOf(lines)) };
  for (const k of keep) cols[k] = src[k];
  const keys = Object.keys(cols);
  await c.query(`insert into orders (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(k => cols[k]));
  if (lines.length) await insertLines(c, no, lines);
  await logActivity(c, who, no, "created", { no, copiedFrom: src.no });
  return { id: no, no, rev: 0 };
}

/** Store sends damaged items to repair: one ticket per damaged line not yet sent (as on the artifact's check-in). */
export async function sendToRepair(c: PoolClient, who: Caller, id: string, body: Record<string, unknown>) {
  if (who.role !== "admin" && who.role !== "store") throw new ApiError(403, "rRole");
  const o = await openForWrite(c, id, body.rev);
  if (o.status !== "Shipped" && o.status !== "Returned") throw bad("wrong_status", "Repairs are sent from check-in");
  const damaged = (await loadLines(c, id)).filter(l => (Number(l.dmg) || 0) > 0 && !l.repaired);
  if (!damaged.length) throw bad("nothing_to_repair");
  for (const l of damaged) {
    await c.query("insert into repairs (order_id, pid, code, description, qty, status, created_by) values ($1,$2,$3,$4,$5,'wait',$6)", [id, l.pid ?? null, l.code ?? null, l.desc ?? null, Number(l.dmg), who.id]);
    await c.query("update order_lines set repaired = true where order_id = $1 and k = $2", [id, l.k]);
  }
  const rev = await finish(c, o, who);
  await logActivity(c, who, id, "repair_sent", { lines: damaged.map(l => ({ k: l.k, code: l.code, qty: Number(l.dmg) })) });
  return { id, rev, tickets: damaged.length };
}

const REPAIR_STATUS = ["wait", "doing", "done", "lost"];
export async function updateRepair(c: PoolClient, who: Caller, rid: string, body: Record<string, unknown>) {
  if (who.role !== "admin" && who.role !== "store") throw new ApiError(403, "rRole");
  const r = (await c.query("select * from repairs where id = $1 for update", [rid])).rows[0];
  if (!r) throw new ApiError(404, "not_found");
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) { if (!REPAIR_STATUS.includes(String(body.status))) throw bad("bad_status"); patch.status = body.status; }
  if (body.note !== undefined) patch.note = String(body.note ?? "").slice(0, 2000);
  if (!Object.keys(patch).length) throw bad("nothing_to_change");
  const keys = Object.keys(patch);
  await c.query(`update repairs set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1`, [rid, ...keys.map(k => patch[k])]);
  const changed = Object.fromEntries(keys.map(k => [k, [r[k] ?? null, patch[k]]]));
  await c.query("insert into activity (actor, actor_name, entity, entity_id, action, detail) values ($1,$2,'repair',$3,'repair_update',$4)", [who.id, who.name, rid, { changed, orderId: r.order_id }]);
  return { id: rid };
}
