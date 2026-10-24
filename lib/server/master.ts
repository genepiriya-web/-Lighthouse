// Master data edits: catalog (admin, store), customers (admin, sale), team roles and company settings (admin).
// Who may edit what follows the artifact page. Every change is checked here, versioned by updated_at (409 `stale` if
// someone saved first) and written to `activity` with before/after values.
// Editing a legacy record moves it to source 'v2' so the importer stops overwriting it.
import "server-only";
import type { PoolClient } from "pg";
import { ApiError, bad } from "./http";
import type { Caller } from "./auth";

const need = (who: Caller, ...roles: string[]) => { if (!roles.includes(who.role)) throw new ApiError(403, "rRole"); };
async function log(c: PoolClient, who: Caller, entity: string, id: string, action: string, detail: unknown) {
  await c.query("insert into activity (actor, actor_name, entity, entity_id, action, detail) values ($1,$2,$3,$4,$5,$6)", [who.id, who.name, entity, id, action, detail]);
}
function checkVersion(row: { updated_at: Date | string }, sent: unknown) {
  if (typeof sent !== "string") throw bad("updatedAt_required", "Send the updatedAt you last read");
  if (new Date(row.updated_at).getTime() !== new Date(sent).getTime())
    throw new ApiError(409, "stale", "Someone saved this after you opened it. Reload and try again.", { updatedAt: row.updated_at });
}
const diff = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(after).filter(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)).map(k => [k, [before[k] ?? null, after[k]]]));
const num = (v: unknown, what: string, { min = 0, max = Infinity, int = false } = {}) => {
  const n = Number(v); if (!isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw bad("bad_number", what); return n; };
const text = (v: unknown, what: string, { required = false, max = 500 } = {}) => {
  const s = v == null ? "" : String(v).trim(); if (required && !s) throw bad("required", what); return s.slice(0, max) || null; };

// ---------- catalog ----------
const PRODUCT_FIELDS = ["code", "desc", "type", "dept", "price", "discountable", "maxDisc", "stock", "kit"] as const;

function cleanProduct(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const has = (k: string) => b[k] !== undefined || !partial;
  if (has("code")) out.code = text(b.code, "code", { required: true, max: 60 });
  if (has("desc")) out.description = text(b.desc, "desc", { required: true });
  if (has("type")) { const t = num(b.type, "type", { min: 1, max: 7, int: true }); if (t === 5 || t === 7) throw bad("bad_type", "Crew and freelance aren't catalog items"); out.type = t; }
  if (has("dept")) out.dept = num(b.dept, "dept", { min: 1, max: 3, int: true });
  if (has("price")) out.price = num(b.price ?? 0, "price");
  if (has("discountable")) out.discountable = !!b.discountable;
  if (has("maxDisc")) out.max_disc = num(b.maxDisc ?? 0, "maxDisc", { max: 100 });
  if (has("stock")) out.stock = num(b.stock ?? 0, "stock", { int: true });
  return out;
}
function cleanKit(v: unknown, selfId: number | null): Array<[number, number, number]> {
  if (!Array.isArray(v) || v.length > 100) throw bad("bad_kit");
  const seen = new Set<number>();
  return v.map((p, i) => { const [cid, ratio, price] = Array.isArray(p) ? p : [];
    const id = num(cid, `kit ${i + 1} item`, { min: 1, int: true }); if (id === selfId) throw bad("bad_kit", "An item can't contain itself");
    if (seen.has(id)) throw bad("bad_kit", "Same part twice"); seen.add(id);
    return [id, num(ratio ?? 1, `kit ${i + 1} ratio`, { min: 0.0001 }), num(price ?? 0, `kit ${i + 1} price`)] as [number, number, number]; });
}
async function codeFree(c: PoolClient, table: "products" | "customers", code: unknown, exceptId: unknown) {
  if (code == null) return;
  const r = await c.query(`select 1 from ${table} where lower(code) = lower($1) and id::text <> $2::text limit 1`, [code, String(exceptId ?? "")]);
  if (r.rowCount) throw bad("code_taken", `Code ${code} is already used`);
}
async function saveKit(c: PoolClient, parent: number, kit: Array<[number, number, number]>) {
  if (kit.length) { const ok = (await c.query("select count(*)::int n from products where id = any($1::int[])", [kit.map(k => k[0])])).rows[0].n;
    if (ok !== kit.length) throw bad("bad_kit", "Unknown part"); }
  await c.query("delete from kit_parts where parent_id = $1", [parent]);
  for (const [cid, ratio, price] of kit) await c.query("insert into kit_parts (parent_id, child_id, ratio, price) values ($1,$2,$3,$4)", [parent, cid, ratio, price]);
}
const kitOf = async (c: PoolClient, id: number) => (await c.query("select child_id, ratio, price from kit_parts where parent_id = $1 order by child_id", [id])).rows.map(r => [r.child_id, r.ratio, r.price]);

export async function createProduct(c: PoolClient, who: Caller, b: Record<string, unknown>) {
  need(who, "admin", "store");
  const f = cleanProduct(b, false); await codeFree(c, "products", f.code, null);
  const id: number = (await c.query("select nextval('product_v2_id')::int id")).rows[0].id;
  const cols = { id, ...f, source: "v2" }; const keys = Object.keys(cols);
  await c.query(`insert into products (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(k => (cols as Record<string, unknown>)[k]));
  if (b.kit !== undefined) await saveKit(c, id, cleanKit(b.kit, id));
  await log(c, who, "product", String(id), "created", { ...f, kit: await kitOf(c, id) });
  return { id };
}

export async function updateProduct(c: PoolClient, who: Caller, id: number, b: Record<string, unknown>) {
  need(who, "admin", "store");
  const row = (await c.query("select * from products where id = $1 for update", [id])).rows[0];
  if (!row) throw new ApiError(404, "not_found");
  checkVersion(row, b.updatedAt);
  const unknown = Object.keys(b).filter(k => k !== "updatedAt" && !(PRODUCT_FIELDS as readonly string[]).includes(k));
  if (unknown.length) throw bad("unknown_fields", unknown.join(", "));
  const f = cleanProduct(b, true);
  if (f.code !== undefined && String(f.code).toLowerCase() !== String(row.code).toLowerCase()) await codeFree(c, "products", f.code, id);
  const changed = diff(row, f);
  const kitBefore = await kitOf(c, id);
  if (b.kit !== undefined) await saveKit(c, id, cleanKit(b.kit, id));
  const kitAfter = await kitOf(c, id);
  if (!Object.keys(changed).length && JSON.stringify(kitBefore) === JSON.stringify(kitAfter)) throw bad("nothing_to_change");
  const keys = Object.keys(f);
  await c.query(`update products set ${[...keys.map((k, i) => `${k} = $${i + 2}`), "source = 'v2'", "updated_at = now()"].join(", ")} where id = $1`, [id, ...keys.map(k => f[k])]);
  await log(c, who, "product", String(id), "updated", { changed, ...(JSON.stringify(kitBefore) !== JSON.stringify(kitAfter) && { kit: [kitBefore, kitAfter] }), ...(row.source === "legacy" && { tookOverFromLegacy: true }) });
  return { id };
}

export async function getProduct(c: PoolClient, id: number) {
  const r = await c.query(`select id, code, description as "desc", type, dept, price, discountable, max_disc as "maxDisc", stock, one_hand as "oneHand", source, updated_at as "updatedAt" from products where id = $1`, [id]);
  if (!r.rowCount) throw new ApiError(404, "not_found");
  const kit = (await c.query(`select k.child_id as id, k.ratio, k.price, p.code, p.description as "desc" from kit_parts k join products p on p.id = k.child_id where k.parent_id = $1 order by p.code`, [id])).rows;
  return { ...r.rows[0], kit };
}

// ---------- customers ----------
const CUSTOMER_FIELDS = ["code", "name", "jobType", "defaultDisc", "billing", "phone", "fax", "taxId", "flaggedNew"] as const;
function cleanCustomer(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {}; const has = (k: string) => b[k] !== undefined || !partial;
  if (has("code")) out.code = text(b.code, "code", { max: 60 });
  if (has("name")) out.name = text(b.name, "name", { required: true });
  if (has("jobType")) { const j = text(b.jobType, "jobType", { max: 20 }); if (j && !["CO-PRO", "FILM", "SP", "TVC", "TVD"].includes(j)) throw bad("bad_job_type"); out.job_type = j; }
  if (has("defaultDisc")) out.default_disc = num(b.defaultDisc ?? 0, "defaultDisc", { max: 100 });
  if (has("billing")) out.billing_addr = text(b.billing, "billing", { max: 1000 });
  if (has("phone")) out.phone = text(b.phone, "phone", { max: 100 });
  if (has("fax")) out.fax = text(b.fax, "fax", { max: 100 });
  if (b.flaggedNew !== undefined) { if (b.flaggedNew !== false) throw bad("bad_flag", "A flag can only be cleared"); out.flagged_new = false; }
  return out;
}
const taxOk = (s: string) => /^\d{13}$/.test(s); // Thai tax IDs (companies and individuals) are 13 digits

export async function createCustomer(c: PoolClient, who: Caller, b: Record<string, unknown>) {
  need(who, "admin", "sale");
  const f = cleanCustomer(b, false); await codeFree(c, "customers", f.code, null);
  const tax = text(b.taxId, "taxId", { max: 20 }); if (tax && !taxOk(tax)) throw bad("bad_tax_id", "Tax ID must be 13 digits");
  const id: string = (await c.query("select gen_random_uuid()::text id")).rows[0].id;
  const cols = { id, ...f, source: "v2" }; const keys = Object.keys(cols);
  await c.query(`insert into customers (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(k => (cols as Record<string, unknown>)[k]));
  if (tax) await c.query("insert into customer_tax_ids (customer_id, tax_id) values ($1,$2)", [id, tax]);
  await log(c, who, "customer", id, "created", { ...f, taxId: tax ? "set" : null }); // the tax ID itself stays out of the log
  return { id };
}

export async function updateCustomer(c: PoolClient, who: Caller, id: string, b: Record<string, unknown>) {
  need(who, "admin", "sale");
  const row = (await c.query("select * from customers where id = $1 for update", [id])).rows[0];
  if (!row) throw new ApiError(404, "not_found");
  checkVersion(row, b.updatedAt);
  const unknown = Object.keys(b).filter(k => k !== "updatedAt" && !(CUSTOMER_FIELDS as readonly string[]).includes(k));
  if (unknown.length) throw bad("unknown_fields", unknown.join(", "));
  const f = cleanCustomer(b, true);
  if (f.code !== undefined && String(f.code ?? "").toLowerCase() !== String(row.code ?? "").toLowerCase()) await codeFree(c, "customers", f.code, id);
  const changed = diff(row, f); let taxChange: string | null = null;
  if (b.taxId !== undefined) {
    const tax = text(b.taxId, "taxId", { max: 20 }); if (tax && !taxOk(tax)) throw bad("bad_tax_id", "Tax ID must be 13 digits");
    const cur = (await c.query("select tax_id from customer_tax_ids where customer_id = $1", [id])).rows[0]?.tax_id ?? null;
    if (cur !== tax) { taxChange = tax ? (cur ? "changed" : "set") : "removed";
      if (tax) await c.query("insert into customer_tax_ids (customer_id, tax_id) values ($1,$2) on conflict (customer_id) do update set tax_id = excluded.tax_id", [id, tax]);
      else await c.query("delete from customer_tax_ids where customer_id = $1", [id]); }
  }
  if (!Object.keys(changed).length && !taxChange) throw bad("nothing_to_change");
  // Only clearing the new-customer flag keeps the record importable, so the real details can still arrive from the old system.
  const onlyFlag = Object.keys(changed).every(k => k === "flagged_new") && !taxChange;
  const keys = Object.keys(f);
  await c.query(`update customers set ${[...keys.map((k, i) => `${k} = $${i + 2}`), ...(onlyFlag ? [] : ["source = 'v2'"]), "updated_at = now()"].join(", ")} where id = $1`, [id, ...keys.map(k => f[k])]);
  await log(c, who, "customer", id, onlyFlag ? "checked" : "updated", { changed, ...(taxChange && { taxId: taxChange }), ...(!onlyFlag && row.source === "legacy" && { tookOverFromLegacy: true }) });
  return { id };
}

export async function getCustomer(c: PoolClient, who: Caller, id: string) {
  const r = await c.query(`select id, code, name, job_type as "jobType", default_disc as "defaultDisc", billing_addr as billing, phone, fax, flagged_new as "flaggedNew", flag_note as "flagNote", source, updated_at as "updatedAt" from customers where id = $1`, [id]);
  if (!r.rowCount) throw new ApiError(404, "not_found");
  // Tax ID only for the roles allowed to see it (Gene, Q14): admin, sale, accounting. The server reads it; RLS would agree.
  const taxId = ["admin", "sale", "accounting"].includes(who.role) ? (await c.query("select tax_id from customer_tax_ids where customer_id = $1", [id])).rows[0]?.tax_id ?? null : undefined;
  const jobs = (await c.query("select id, no, status, job_title, ship from orders where customer_id = $1 order by no desc limit 20", [id])).rows;
  return { ...r.rows[0], ...(taxId !== undefined && { taxId }), jobs };
}

export async function listCustomers(c: PoolClient, q: { q?: string; flagged?: boolean; limit?: number }) {
  const where: string[] = []; const args: unknown[] = [];
  if (q.q) { args.push(`%${q.q}%`); where.push(`(name ilike $${args.length} or code ilike $${args.length})`); }
  if (q.flagged) where.push("flagged_new");
  args.push(Math.max(1, Math.min(500, q.limit ?? 100)));
  return (await c.query(`select id, code, name, job_type as "jobType", default_disc as "defaultDisc", phone, flagged_new as "flaggedNew", source
    from customers ${where.length ? "where " + where.join(" and ") : ""} order by flagged_new desc, name limit $${args.length}`, args)).rows;
}

// ---------- catalog list, crew rates ----------
export async function listProducts(c: PoolClient, q: { q?: string; type?: number; dept?: number; limit?: number }) {
  const where: string[] = []; const args: unknown[] = [];
  if (q.q) { args.push(`%${q.q}%`); where.push(`(code ilike $${args.length} or description ilike $${args.length})`); }
  if (q.type) { args.push(q.type); where.push(`type = $${args.length}`); }
  if (q.dept) { args.push(q.dept); where.push(`dept = $${args.length}`); }
  args.push(Math.max(1, Math.min(500, q.limit ?? 100)));
  return (await c.query(`select id, code, description as "desc", type, dept, price, discountable, max_disc as "maxDisc", stock, source,
      (select count(*)::int from kit_parts k where k.parent_id = p.id) as "kitParts"
    from products p ${where.length ? "where " + where.join(" and ") : ""} order by sort nulls last, code limit $${args.length}`, args)).rows;
}

/** Crew rates screen (view only, as on the artifact). Cost columns only for admin and the crew manager (Gene, Q15). */
export async function listCrewRates(c: PoolClient, who: Caller, q: string, limit = 400) {
  const cost = who.role === "admin" || who.role === "crew";
  return (await c.query(`select cr.id as "crewId", cr.code as "crewCode", trim(concat_ws(' ', cr.first_name, cr.last_name)) as name, cr.nick, cr.enabled,
      r.position_id as "positionId", r.rate_no as "rateNo", r.needs_review as "needsReview", r.dept, r.price, r.price_ot as "priceOt", r.enabled as "rateEnabled",
      p.code as "posCode", p.name as "posName" ${cost ? `, k.cost, k.cost_ot as "costOt"` : ""}
    from crew cr join crew_rates r on r.crew_id = cr.id left join positions p on p.id = r.position_id
    ${cost ? "left join crew_rate_costs k on k.crew_id = r.crew_id and k.position_id = r.position_id and k.rate_no = r.rate_no" : ""}
    where ($1 = '' or cr.first_name ilike $2 or cr.last_name ilike $2 or cr.nick ilike $2 or cr.code ilike $2 or p.name ilike $2 or p.code ilike $2)
    order by r.needs_review desc, cr.first_name, p.sort nulls last, r.rate_no limit $3`, [q, `%${q}%`, Math.max(1, Math.min(1000, limit))])).rows;
}

// ---------- team ----------
const ROLES = ["admin", "sale", "store", "accounting", "crew"];
export async function listStaff(c: PoolClient) {
  return (await c.query(`select user_id as id, display_name as name, role, active, created_at as "createdAt" from staff order by active desc, role, display_name`)).rows;
}
export async function updateStaff(c: PoolClient, who: Caller, id: string, b: Record<string, unknown>) {
  need(who, "admin");
  if (id === who.id) throw bad("not_yourself", "You can't change your own role or switch yourself off");
  const row = (await c.query("select * from staff where user_id = $1 for update", [id])).rows[0];
  if (!row) throw new ApiError(404, "not_found");
  const f: Record<string, unknown> = {};
  if (b.role !== undefined) { if (!ROLES.includes(String(b.role))) throw bad("bad_role"); f.role = b.role; }
  if (b.active !== undefined) f.active = !!b.active;
  if (b.name !== undefined) f.display_name = text(b.name, "name", { required: true, max: 100 });
  const changed = diff(row, f); if (!Object.keys(changed).length) throw bad("nothing_to_change");
  const keys = Object.keys(f);
  await c.query(`update staff set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where user_id = $1`, [id, ...keys.map(k => f[k])]);
  await log(c, who, "staff", id, "updated", { changed });
  return { id };
}

// ---------- settings ----------
export async function getSettings(c: PoolClient) {
  const rows = (await c.query("select key, value, updated_at from settings")).rows;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
export async function updateCompany(c: PoolClient, who: Caller, b: Record<string, unknown>) {
  need(who, "admin");
  const tax = text(b.tax, "tax", { max: 20 }); if (tax && !taxOk(tax)) throw bad("bad_tax_id", "Tax ID must be 13 digits");
  const value = { name: text(b.name, "name", { required: true, max: 200 }), tax, addr: text(b.addr, "addr", { max: 1000 }) };
  const before = (await c.query("select value from settings where key = 'company'")).rows[0]?.value ?? {};
  await c.query("insert into settings (key, value) values ('company', $1) on conflict (key) do update set value = excluded.value, updated_at = now()", [value]);
  await log(c, who, "settings", "company", "updated", { changed: diff(before, value) });
  return value;
}

// ---------- invites (M6) ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function listInvites(c: PoolClient, who: Caller) {
  need(who, "admin");
  return (await c.query(`select email, role, name, invited_at as "invitedAt", used_at as "usedAt" from staff_invites order by used_at nulls first, invited_at desc`)).rows;
}
export async function createInvite(c: PoolClient, who: Caller, b: Record<string, unknown>) {
  need(who, "admin");
  const email = String(b.email ?? "").trim().toLowerCase(); if (!EMAIL.test(email) || email.length > 200) throw bad("bad_email");
  const role = String(b.role ?? ""); if (!ROLES.includes(role)) throw bad("bad_role");
  const name = text(b.name, "name", { max: 100 });
  const r = await c.query(`insert into staff_invites (email, role, name, invited_by) values ($1,$2,$3,$4)
    on conflict (email) do update set role = excluded.role, name = excluded.name, invited_by = excluded.invited_by, invited_at = now() where staff_invites.used_at is null returning email`, [email, role, name, who.id]);
  if (!r.rowCount) throw bad("already_joined", "This email has already joined; change their role on the team list");
  await log(c, who, "staff", email, "invited", { role });
  return { email };
}
export async function deleteInvite(c: PoolClient, who: Caller, email: string) {
  need(who, "admin");
  const r = await c.query("delete from staff_invites where email = $1 and used_at is null", [email.toLowerCase()]);
  if (!r.rowCount) throw new ApiError(404, "not_found");
  await log(c, who, "staff", email.toLowerCase(), "invite_removed", {});
  return { email };
}
