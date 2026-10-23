// Crew national IDs (PDPA). Admin only; every full ID shown or sent is logged in `activity` without the ID itself.
//   * Encrypted at rest with AES-256-GCM under CREW_ID_KEY (outside the database); only the last 3 digits are stored in clear.
//   * Import matches crew by code, old-system crew number or full name, and checks the Thai ID checksum (as the artifact did).
//   * Client links: random token (only its SHA-256 is stored), expiry, view limit, revocable. Opening the link shows a
//     button only; IDs are sent on the POST that follows, so chat-app link previews never receive them.
import "server-only";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { ApiError, bad } from "./http";
import type { Caller } from "./auth";

// ---------- ID helpers (same rules as the artifact page) ----------
export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export function thaiIdOk(s: unknown) { const d = digits(s); if (d.length !== 13) return false; let sum = 0; for (let i = 0; i < 12; i++) sum += +d[i] * (13 - i); return ((11 - sum % 11) % 10) === +d[12]; }
export const fmtId = (d: string) => `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
export const maskFrom3 = (last3: string) => `x-xxxx-xxxxx-${last3.slice(0, 2)}-${last3[2]}`;

function key(): Buffer {
  const k = Buffer.from(process.env.CREW_ID_KEY ?? "", "base64");
  if (k.length !== 32) throw new ApiError(500, "crew_id_key_missing", "CREW_ID_KEY must be 32 bytes, base64");
  return k;
}
const b64 = (b: Buffer) => b.toString("base64url");
export function encryptId(id: string): string {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(id, "utf8"), c.final()]);
  return `v1:${b64(iv)}:${b64(c.getAuthTag())}:${b64(ct)}`;
}
export function decryptId(s: string): string {
  const [v, iv, tag, ct] = s.split(":"); if (v !== "v1") throw new Error("unknown crew id cipher version");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url")); d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const admin = (who: Caller) => { if (who.role !== "admin") throw new ApiError(403, "rRole", "Crew national IDs are admin-only"); };
async function log(c: PoolClient, who: Caller | null, entity: string, id: string, action: string, detail: unknown) {
  await c.query("insert into activity (actor, actor_name, entity, entity_id, action, detail) values ($1,$2,$3,$4,$5,$6)", [who?.id ?? null, who?.name ?? "client link", entity, id, action, detail]);
}

// ---------- import ----------
type ImportRow = { line: number; key: string; crewId?: string; crewName?: string; masked?: string; ok: boolean; why?: "cols" | "nomatch" | "checksum" | "ambiguous" };

/** Paste or file text: one crew per line, "code (or crew number, or full name), 13-digit ID", comma or tab separated. */
export async function importIds(c: PoolClient, who: Caller, body: Record<string, unknown>) {
  admin(who);
  const text = String(body.text ?? ""); if (text.length > 500_000) throw bad("too_long");
  const crew = (await c.query(`select id, code, first_name, last_name, nick from crew`)).rows;
  const byCode = new Map<string, any[]>(), byId = new Map<string, any>(), byName = new Map<string, any[]>();
  const add = (m: Map<string, any[]>, k: string, v: any) => { if (!k) return; const a = m.get(k) ?? []; a.push(v); m.set(k, a); };
  const nameOf = (r: any) => ([r.first_name, r.last_name].filter(Boolean).join(" ") || r.nick || "").replace(/\s+/g, " ").trim();
  for (const r of crew) { add(byCode, String(r.code ?? "").trim().toLowerCase(), r); byId.set(String(r.id), r); add(byName, nameOf(r).toLowerCase(), r); }
  const rows: ImportRow[] = []; const good: Array<{ crewId: string; id: string }> = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(); if (!line) return;
    const cols = (line.includes("\t") ? line.split("\t") : line.split(",")).map(x => x.trim());
    if (cols.length < 2) { rows.push({ line: i + 1, key: cols[0].slice(0, 60), ok: false, why: "cols" }); return; }
    const k = cols[0], id = digits(cols[cols.length - 1]);
    if (/^(code|รหัส|crew|name|ชื่อ)/i.test(k) && !id) return; // header row
    const hits = byCode.get(k.toLowerCase()) ?? (byId.get(k) ? [byId.get(k)] : byName.get(k.replace(/\s+/g, " ").toLowerCase()) ?? []);
    const base = { line: i + 1, key: k.slice(0, 60) };
    if (!hits.length) { rows.push({ ...base, ok: false, why: "nomatch" }); return; }
    if (hits.length > 1) { rows.push({ ...base, ok: false, why: "ambiguous" }); return; }
    const r = hits[0];
    if (!thaiIdOk(id)) { rows.push({ ...base, crewId: String(r.id), crewName: nameOf(r), ok: false, why: "checksum" }); return; }
    rows.push({ ...base, crewId: String(r.id), crewName: nameOf(r), masked: maskFrom3(id.slice(-3)), ok: true }); good.push({ crewId: String(r.id), id });
  });
  if (body.save === true) {
    for (const g of good) await c.query(`insert into crew_national_ids (crew_id, cipher, last3, updated_by) values ($1,$2,$3,$4)
      on conflict (crew_id) do update set cipher = excluded.cipher, last3 = excluded.last3, updated_at = now(), updated_by = excluded.updated_by`, [g.crewId, encryptId(g.id), g.id.slice(-3), who.id]);
    if (good.length) await log(c, who, "crew_id", "import", "imported", { count: good.length, crewIds: good.map(g => g.crewId) });
  }
  return { saved: body.save === true ? good.length : 0, ready: good.length, rows };
}

// ---------- masked list, reveal, remove ----------
export async function idStatus(c: PoolClient, who: Caller) {
  admin(who);
  const r = await c.query("select crew_id, last3 from crew_national_ids");
  return Object.fromEntries(r.rows.map(x => [x.crew_id, maskFrom3(x.last3)]));
}
export async function revealId(c: PoolClient, who: Caller, crewId: string) {
  admin(who);
  const r = (await c.query("select cipher from crew_national_ids where crew_id = $1", [crewId])).rows[0];
  if (!r) throw new ApiError(404, "not_found");
  await log(c, who, "crew_id", crewId, "viewed", {});
  return { crewId, id: fmtId(decryptId(r.cipher)) };
}
export async function removeId(c: PoolClient, who: Caller, crewId: string) {
  admin(who);
  const r = await c.query("delete from crew_national_ids where crew_id = $1", [crewId]);
  if (!r.rowCount) throw new ApiError(404, "not_found");
  await log(c, who, "crew_id", crewId, "removed", {});
  return { crewId };
}

// ---------- a job's crew list ----------
const fmtD = (s?: string | null) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
async function jobCrew(c: PoolClient, orderId: string) {
  const o = (await c.query("select id, no, job_title, customer_name, ship, ret, use_start, use_end from orders where id = $1", [orderId])).rows[0];
  if (!o) throw new ApiError(404, "not_found");
  const lines = (await c.query(`select l.crew_id, l.code, l.description, l.start_date, l.end_date, trim(concat_ws(' ', cr.first_name, cr.last_name)) as name, cr.nick, n.cipher, n.last3
    from order_lines l left join crew cr on cr.id = l.crew_id left join crew_national_ids n on n.crew_id = l.crew_id
    where l.order_id = $1 and l.t in (5,7) and l.crew_id is not null order by l.sort`, [orderId])).rows;
  const seen = new Set<string>(); const crew = [];
  for (const l of lines) { if (seen.has(l.crew_id)) continue; seen.add(l.crew_id);
    crew.push({ crewId: l.crew_id, name: l.name || l.nick || String(l.description ?? "").split(" · ")[1] || "", position: String(l.description ?? "").split(" · ")[0] || l.code || "", // lines read "Position · Name"
      dates: `${fmtD(l.start_date ?? o.use_start ?? o.ship)} - ${fmtD(l.end_date ?? o.use_end ?? o.ret)}`, cipher: l.cipher as string | null, last3: l.last3 as string | null }); }
  return { order: o, crew };
}

/** For the job sheet (admin): who is on the job and whether their ID is on file — masked only, nothing logged. */
export async function jobCrewStatus(c: PoolClient, who: Caller, orderId: string) {
  admin(who); const { crew } = await jobCrew(c, orderId);
  return crew.map(x => ({ crewId: x.crewId, name: x.name, position: x.position, dates: x.dates, masked: x.last3 ? maskFrom3(x.last3) : null }));
}

// ---------- client links ----------
export async function createLink(c: PoolClient, who: Caller, orderId: string, body: Record<string, unknown>) {
  admin(who);
  const recipient = String(body.recipient ?? "").trim().slice(0, 200); if (recipient.length < 2) throw bad("recipient_required", "Say who the link is for");
  const hours = Number(body.hours ?? 72); if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw bad("bad_hours", "1 to 168 hours");
  const maxViews = Number(body.maxViews ?? 20); if (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 200) throw bad("bad_max_views");
  const show = body.show === "masked" ? "masked" : "full";
  const { crew } = await jobCrew(c, orderId);
  if (!crew.length) throw bad("noCrewOnJob", "No named crew on this job");
  const token = crypto.randomBytes(32).toString("base64url");
  const r = (await c.query(`insert into crew_id_links (order_id, token_hash, recipient, show, created_by, created_by_name, expires_at, max_views)
    values ($1,$2,$3,$4,$5,$6, now() + make_interval(hours => $7), $8) returning id, expires_at`, [orderId, sha256(token), recipient, show, who.id, who.name, hours, maxViews])).rows[0];
  await log(c, who, "order", orderId, "crew_link_created", { linkId: r.id, recipient, show, hours, maxViews, crew: crew.length, withIdOnFile: crew.filter(x => x.cipher).length });
  return { linkId: r.id, path: `/share/crew/${token}`, expiresAt: r.expires_at }; // the token is never shown again
}

export async function listLinks(c: PoolClient, who: Caller, orderId: string) {
  admin(who);
  return (await c.query(`select id, recipient, show, created_by_name as "createdBy", created_at as "createdAt", expires_at as "expiresAt", views, max_views as "maxViews", revoked_at as "revokedAt",
      case when revoked_at is not null then 'revoked' when expires_at <= now() then 'expired' when views >= max_views then 'used_up' else 'active' end as state
    from crew_id_links where order_id = $1 order by created_at desc`, [orderId])).rows;
}

export async function revokeLink(c: PoolClient, who: Caller, linkId: string) {
  admin(who);
  const r = (await c.query("update crew_id_links set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null returning order_id", [linkId, who.id])).rows[0];
  if (!r) throw new ApiError(404, "not_found");
  await log(c, who, "order", r.order_id, "crew_link_revoked", { linkId });
  return { linkId };
}

type LinkState = "ok" | "gone";
/** Public: look a link up by its token. `reveal` (POST) counts a view, logs it and returns the IDs; a plain look (GET) returns only the job title. */
export async function openLink(c: PoolClient, token: string, reveal: boolean): Promise<{ state: LinkState; job?: { no: string; title: string; customer: string }; crew?: Array<{ name: string; position: string; dates: string; id: string }>; show?: string; expiresAt?: string }> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { state: "gone" };
  const l = (await c.query("select * from crew_id_links where token_hash = $1 for update", [sha256(token)])).rows[0];
  if (!l || l.revoked_at || new Date(l.expires_at) <= new Date() || l.views >= l.max_views) return { state: "gone" };
  const { order, crew } = await jobCrew(c, l.order_id);
  const job = { no: order.no, title: order.job_title ?? "", customer: order.customer_name ?? "" };
  if (!reveal) return { state: "ok", job, expiresAt: l.expires_at };
  await c.query("update crew_id_links set views = views + 1 where id = $1", [l.id]);
  await log(c, null, "order", l.order_id, "crew_link_opened", { linkId: l.id, recipient: l.recipient, view: l.views + 1, of: l.max_views });
  return { state: "ok", job, show: l.show, expiresAt: l.expires_at,
    crew: crew.map(x => ({ name: x.name, position: x.position, dates: x.dates, id: !x.cipher ? "" : l.show === "full" ? fmtId(decryptId(x.cipher)) : maskFrom3(x.last3!) })) };
}
