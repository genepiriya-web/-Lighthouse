// Who is calling, and what role they have.
//
// Supabase (default) — the caller sends their Supabase access token as `Authorization: Bearer …`. For page loads and
//   document downloads (GET/HEAD only) the `lhd_at` cookie is also accepted; a cookie never authorises a change, so other
//   sites can't make changes through it (CSRF). Verification, per Supabase's docs (supabase.com/docs/guides/auth/jwts):
//     * RS256/ES256 tokens: signature checked against SUPABASE_URL/auth/v1/.well-known/jwks.json, issuer SUPABASE_URL/auth/v1,
//       expiry, and role "authenticated".
//     * HS256 (legacy shared-secret projects): Supabase advises not to verify locally, so the token is checked by calling
//       SUPABASE_URL/auth/v1/user with the publishable key; a 200 means valid. Results are cached for 60 s.
//   A signed-in person without a staff row is let in only if an admin invited their (verified) email: the first sign-in
//   creates the staff row with the invited role.
// LHD_AUTH=dev — local development and tests only: `x-dev-user` header or `lhd_dev_user` cookie. Refused unless
//   DATABASE_URL is on this machine.
// LHD_TRIAL_PINS — staff trial on the office Wi-Fi (real data copy): one PIN per department; the PIN (POST /api/dev/pin →
//   signed httpOnly `lhd_trial` cookie) is the only way in. Wrong PINs: 10 per 10 min per address.
import "server-only";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { ApiError } from "./http";
import { dbHost } from "./db";
import type { Role } from "../logic";

/** `role` is what permissions check. Support has Sales rights (Gene, 27 Oct), so a Support member's `role` is "sale" and
 *  `dept` says "support"; for everyone else the two are the same. */
export interface Caller { id: string; name: string; role: Exclude<Role, "none">; dept: string; }
interface Identity { id: string; email: string | null; emailVerified: boolean; }

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- staff trial: one PIN per department ----------
// LHD_TRIAL_PINS = {"sale":"123456","store":…,"support":…,"accounting":…,"admin":…}. The PIN alone decides who you are: each
// department signs in as its own trial account, so a Sales PIN can never act as Store or admin. While the trial runs, user
// ids sent in headers or cookies are ignored. Support has Sales rights for now (its own role isn't defined yet).
export const TRIAL_ACCOUNTS: Record<string, string> = {
  admin: "00000000-0000-4000-8000-000000000001", sale: "00000000-0000-4000-8000-000000000002", store: "00000000-0000-4000-8000-000000000003",
  accounting: "00000000-0000-4000-8000-000000000004", support: "00000000-0000-4000-8000-000000000006",
};
export function trialPins(): Record<string, string> {
  try { const j = JSON.parse(process.env.LHD_TRIAL_PINS || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).filter(([k, v]) => k in TRIAL_ACCOUNTS && /^\d{4,8}$/.test(String(v))).map(([k, v]) => [k, String(v)])); }
  catch { return {}; }
}
export const trialOn = () => Object.keys(trialPins()).length > 0;
const trialSig = (dept: string, pin: string) => crypto.createHmac("sha256", `lhd-trial:${process.env.CREW_ID_KEY ?? ""}`).update(`${dept}:${pin}`).digest("base64url");
export const trialCookie = (dept: string) => `lhd_trial=${dept}.${trialSig(dept, trialPins()[dept])}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}`;
export const clearTrialCookie = "lhd_trial=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
/** The department whose valid trial cookie this request carries, or null. */
export function trialDept(req: Request): string | null {
  const v = cookie(req, "lhd_trial"); if (!v) return null; const i = v.indexOf("."); if (i < 1) return null;
  const dept = v.slice(0, i), pins = trialPins(); if (!pins[dept]) return null;
  const got = Buffer.from(v.slice(i + 1)), want = Buffer.from(trialSig(dept, pins[dept]));
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? dept : null;
}
const tries = (globalThis as unknown as { __lhdPinTries?: Map<string, number[]> });
/** The department the PIN belongs to, or null. Wrong guesses are counted per client address: 10 in 10 minutes blocks. */
export function checkPin(req: Request, pin: string): string | null {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const m = (tries.__lhdPinTries ??= new Map()); const now = Date.now(); const recent = (m.get(ip) ?? []).filter((t: number) => now - t < 600_000);
  if (recent.length >= 10) throw new ApiError(429, "too_many_tries", "Too many wrong PINs. Wait 10 minutes.");
  const a = Buffer.from(pin.trim());
  for (const [dept, p] of Object.entries(trialPins())) { const b = Buffer.from(p); if (a.length === b.length && crypto.timingSafeEqual(a, b)) { m.delete(ip); return dept; } }
  recent.push(now); m.set(ip, recent); return null;
}

export function devAuthOn(): boolean {
  if (process.env.LHD_AUTH !== "dev") return false;
  if (!LOOPBACK.has(dbHost())) throw new ApiError(500, "dev_auth_refused", "LHD_AUTH=dev only works against a local database");
  return true;
}
const cookie = (req: Request, name: string) => { const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get("cookie") ?? ""); return m ? decodeURIComponent(m[1]) : null; };

// ---------- Supabase ----------
const supabaseUrl = () => { const u = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, ""); if (!u) throw new ApiError(500, "auth_not_configured", "SUPABASE_URL is not set"); return u; };
const g = globalThis as unknown as { __lhdJwks?: { url: string; set: ReturnType<typeof createRemoteJWKSet> }; __lhdHsCache?: Map<string, { id: Identity; until: number }> };
function jwks(base: string) {
  const url = `${base}/auth/v1/.well-known/jwks.json`;
  if (g.__lhdJwks?.url !== url) g.__lhdJwks = { url, set: createRemoteJWKSet(new URL(url), { cacheMaxAge: 10 * 60_000, cooldownDuration: 30_000 }) };
  return g.__lhdJwks.set;
}

function tokenOf(req: Request): string | null {
  const h = req.headers.get("authorization"); if (h?.startsWith("Bearer ")) return h.slice(7).trim() || null;
  if (req.method === "GET" || req.method === "HEAD") return cookie(req, "lhd_at");
  return null; // a cookie alone never authorises a change
}

async function verifySupabase(token: string): Promise<Identity | null> {
  const base = supabaseUrl(); let alg: string | undefined;
  try { alg = decodeProtectedHeader(token).alg; } catch { return null; }
  if (alg === "RS256" || alg === "ES256") {
    try {
      const { payload } = await jwtVerify(token, jwks(base), { issuer: `${base}/auth/v1`, algorithms: ["RS256", "ES256"] });
      if (payload.role !== "authenticated" || typeof payload.sub !== "string" || !UUID.test(payload.sub)) return null;
      const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
      return { id: payload.sub, email: typeof payload.email === "string" ? payload.email.toLowerCase() : null, emailVerified: meta.email_verified !== false };
    } catch { return null; }
  }
  if (alg === "HS256") {
    const cache = (g.__lhdHsCache ??= new Map()); const k = crypto.createHash("sha256").update(token).digest("hex"); const hit = cache.get(k);
    if (hit && hit.until > Date.now()) return hit.id;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } }).catch(() => null);
    if (!r || r.status !== 200) return null;
    const u = await r.json().catch(() => null) as { id?: string; email?: string; email_confirmed_at?: string | null } | null;
    if (!u?.id || !UUID.test(u.id)) return null;
    const id = { id: u.id, email: u.email?.toLowerCase() ?? null, emailVerified: !!u.email_confirmed_at };
    if (cache.size > 5000) cache.clear(); cache.set(k, { id, until: Date.now() + 60_000 });
    return id;
  }
  return null;
}

async function identify(req: Request): Promise<Identity | null> {
  if (devAuthOn()) {
    if (trialOn()) { const dept = trialDept(req); if (!dept) throw new ApiError(401, "pin_required"); return { id: TRIAL_ACCOUNTS[dept], email: null, emailVerified: false }; }
    const id = req.headers.get("x-dev-user") ?? cookie(req, "lhd_dev_user");
    return id && UUID.test(id) ? { id, email: null, emailVerified: false } : null;
  }
  const t = tokenOf(req); return t ? verifySupabase(t) : null;
}

/** The signed-in, active staff member, or a 401/403. First sign-in of an invited email creates the staff row. */
export async function requireStaff(c: PoolClient, req: Request): Promise<Caller> {
  const who = await identify(req);
  if (!who) throw new ApiError(401, "signed_out");
  let r = await c.query("select display_name, role, active from staff where user_id = $1", [who.id]);
  if (!r.rowCount && who.email && who.emailVerified) {
    const inv = (await c.query("update staff_invites set used_by = $2, used_at = now() where email = $1 and used_at is null returning role, name", [who.email, who.id])).rows[0];
    if (inv) {
      await c.query("insert into staff (user_id, display_name, role) values ($1,$2,$3)", [who.id, inv.name || who.email, inv.role]);
      await c.query("insert into activity (actor, actor_name, entity, entity_id, action, detail) values ($1::uuid,$2,'staff',$1::text,'joined',$3)", [who.id, inv.name || who.email, { email: who.email, role: inv.role }]);
      r = await c.query("select display_name, role, active from staff where user_id = $1", [who.id]);
    }
  }
  if (!r.rowCount || !r.rows[0].active) throw new ApiError(403, "not_staff");
  const dept: string = r.rows[0].role;
  return { id: who.id, name: r.rows[0].display_name, role: dept === "support" ? "sale" : dept as Caller["role"], dept };
}
