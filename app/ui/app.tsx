"use client";
// App frame for every screen: language, the signed-in staff member, the top bar, and a fetch helper for our API.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { translate, type Lang } from "../../lib/i18n";
import type { Role } from "../../lib/logic";
import { accessToken, supabase } from "../../lib/supabase-browser";

export interface Me { id: string; name: string; role: Exclude<Role, "none">; trial?: boolean; }
export interface ApiResult<T = any> { ok: boolean; status: number; body: T; }

// The last few errors on this screen, attached to bug reports so whoever fixes it sees what broke (no page data, just messages).
const recentErrors: string[] = [];
export function noteError(m: string) { recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${m}`.slice(0, 300)); if (recentErrors.length > 10) recentErrors.shift(); }

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}; if (body !== undefined) headers["content-type"] = "application/json";
  const token = await accessToken(); if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /* empty body */ }
  if (r.status >= 500) noteError(`${method} ${path.split("?")[0]} → ${r.status} ${json?.error ?? ""}`);
  return { ok: r.ok, status: r.status, body: json };
}

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: string, p?: Record<string, string | number>) => string; me: Me | null; meState: "loading" | "ok" | "signed_out" | "not_staff" | "error"; }
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside AppProvider"); return c; };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th");
  const [me, setMe] = useState<Me | null>(null);
  const [meState, setMeState] = useState<Ctx["meState"]>("loading");
  const path = usePathname();
  useEffect(() => { try { const l = localStorage.getItem("lhd-lang"); if (l === "en" || l === "th") setLangState(l); } catch { /* storage blocked */ } }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const onErr = (e: ErrorEvent) => noteError(`${e.message} @${(e.filename || "").split("/").pop()}:${e.lineno}`);
    const onRej = (e: PromiseRejectionEvent) => noteError(`unhandled: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  useEffect(() => { if (path === "/dev-login" || path === "/signin") return; api<Me & { error?: string }>("GET", "/api/me").then(r => {
    if (r.ok) { setMe(r.body); setMeState("ok"); } else setMeState(r.status === 401 ? "signed_out" : r.status === 403 ? "not_staff" : "error"); }); }, [path]);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem("lhd-lang", l); } catch { /* storage blocked */ } }, []);
  const t = useCallback((k: string, p?: Record<string, string | number>) => translate(lang, k, p), [lang]);
  return <AppCtx.Provider value={{ lang, setLang, t, me, meState }}>{children}</AppCtx.Provider>;
}

export function Shell({ children, wide = true }: { children: React.ReactNode; wide?: boolean }) {
  const { t, lang, setLang, me, meState } = useApp(); const router = useRouter(); const path = usePathname();
  const sb = supabase(); const signInPath = sb ? "/signin" : "/dev-login";
  const signOut = async () => { document.cookie = "lhd_dev_user=; path=/; max-age=0"; if (me?.trial) await api("DELETE", "/api/dev/pin");
    if (sb) await sb.auth.signOut(); document.cookie = "lhd_at=; path=/; max-age=0"; router.push(signInPath); };
  return (
    <>
      <header className="bar">
        <div className="bar-in pad">
          <Link href="/jobs" className="brand" style={{ textDecoration: "none" }}><span className="mark" aria-hidden="true" /><span className="brand-name">LIGHTHOUSE</span><span className="brand-sub">Dispatch</span></Link>
          <div className="bar-right">
            {me && <span className="tape" style={{ ["--tc" as string]: "var(--sunk)", ["--tf" as string]: "var(--ink)" }} title={me.name}>{me.trial ? me.name.replace(/^ทดลอง · /, "") : t("r_" + me.role)}</span>}
            <button className="btn sm ghost" type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}>{lang === "th" ? "EN" : "ไทย"}</button>
            {me && <button className="btn sm ghost" type="button" onClick={signOut}>{t("signOut")}</button>}
          </div>
        </div>
        <nav className="tabs pad" role="tablist">{[...(me?.role === "admin" ? [["/cockpit", "cockpit"]] : []), ["/jobs", "jobs"], ["/board", "board"], ["/store", "store"], ["/catalog", "catalog"], ["/customers", "customers"], ["/crew", "crew"], ["/repairs", "repair"],
          ...(me?.role === "admin" ? [["/team", "team"], ["/settings", "settings"], ...(me.trial ? [["/feedback", "feedback"]] : [])] : [])].map(([href, k]) =>
          <Link key={href} className="tab" role="tab" aria-selected={path.startsWith(href)} href={href}>{t(k)}</Link>)}</nav>
      </header>
      {me?.trial && <div className="pad" style={{ background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 600, fontSize: 13, padding: "6px 16px", textAlign: "center" }}>{t("trialBanner")}</div>}
      <main className="wrap pad" style={wide ? undefined : { maxWidth: 900 }}>
        {meState === "signed_out" ? <div className="empty"><p>{t("signedOut")}</p><Link className="btn primary" href={signInPath}>{t(sb ? "signIn" : "signInAs")}</Link></div>
          : meState === "not_staff" ? <div className="banner bad">{t("notStaff")}</div>
          : meState === "error" ? <div className="banner bad">{t("error")}</div>
          : meState === "loading" ? <div className="empty"><p>{t("loading")}</p></div>
          : children}
      </main>
      {me && <Feedback />}
    </>
  );
}

export const stCls = (s: string) => "tape st-" + String(s || "").split(" ")[0];
export const money = (n: number) => (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtD = (s?: string | null) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };

/** Floating "Feedback" button on every screen: a bug / confusing / idea report with the page it came from and a few device
 *  details. Admins read them at /feedback; the server also announces each one in Discord (lib/server/notify.ts). */
function Feedback() {
  const { t, lang } = useApp(); const path = usePathname(); const [open, setOpen] = useState(false); const [text, setText] = useState(""); const [kind, setKind] = useState("bug"); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true);
    const meta = { ua: navigator.userAgent, vw: window.innerWidth, vh: window.innerHeight, lang, errors: [...recentErrors] };
    const r = await api("POST", "/api/feedback", { kind, page: path, text, meta }); setBusy(false);
    if (r.ok) { setText(""); setMsg(t("thanks")); setTimeout(() => { setOpen(false); setMsg(""); }, 1500); } else setMsg(t(r.body?.error ?? "error")); };
  return <>
    <button type="button" className="btn primary" style={{ position: "fixed", right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", zIndex: 35, boxShadow: "0 4px 14px rgba(0,0,0,.18)" }} onClick={() => setOpen(true)}>{t("feedback")}</button>
    {open && <div style={{ position: "fixed", inset: 0, zIndex: 50 }}><div className="scrim" style={{ position: "absolute", inset: 0 }} onClick={() => setOpen(false)} />
      <form className="sec" onSubmit={send} style={{ position: "absolute", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", maxWidth: 520, margin: "0 auto" }}>
        <h3>{t("feedback")}<small>{path}</small></h3>
        <div className="row" role="group" aria-label={t("fbKind")} style={{ marginBottom: 8 }}>{["bug", "confusing", "idea", "other"].map(k =>
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{t("fb_" + k)}</button>)}</div>
        <textarea className="inp" required autoFocus placeholder={t("feedbackHelp")} value={text} onChange={e => setText(e.target.value)} maxLength={4000} />
        <p className="small muted" style={{ margin: "4px 0 8px" }}>{t("fbAuto")}</p>
        <div className="row"><button className="btn primary" type="submit" disabled={busy || !text.trim()}>{t("send")}</button><button className="btn" type="button" onClick={() => setOpen(false)}>{t("close")}</button>{msg && <span className="small good">{msg}</span>}</div>
      </form></div>}
  </>;
}
