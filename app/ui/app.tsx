"use client";
// App frame for every screen: language, the signed-in staff member, the top bar, and a fetch helper for our API.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { translate, type Lang } from "../../lib/i18n";
import type { Role } from "../../lib/logic";

export interface Me { id: string; name: string; role: Exclude<Role, "none">; }
export interface ApiResult<T = any> { ok: boolean; status: number; body: T; }

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const r = await fetch(path, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /* empty body */ }
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
  useEffect(() => { if (path === "/dev-login") return; api<Me & { error?: string }>("GET", "/api/me").then(r => {
    if (r.ok) { setMe(r.body); setMeState("ok"); } else setMeState(r.status === 401 ? "signed_out" : r.status === 403 ? "not_staff" : "error"); }); }, [path]);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem("lhd-lang", l); } catch { /* storage blocked */ } }, []);
  const t = useCallback((k: string, p?: Record<string, string | number>) => translate(lang, k, p), [lang]);
  return <AppCtx.Provider value={{ lang, setLang, t, me, meState }}>{children}</AppCtx.Provider>;
}

export function Shell({ children, wide = true }: { children: React.ReactNode; wide?: boolean }) {
  const { t, lang, setLang, me, meState } = useApp(); const router = useRouter(); const path = usePathname();
  const signOut = () => { document.cookie = "lhd_dev_user=; path=/; max-age=0"; router.push("/dev-login"); };
  return (
    <>
      <header className="bar">
        <div className="bar-in pad">
          <Link href="/jobs" className="brand" style={{ textDecoration: "none" }}><span className="mark" aria-hidden="true" /><span className="brand-name">LIGHTHOUSE</span><span className="brand-sub">Dispatch</span></Link>
          <div className="bar-right">
            {me && <span className="tape" style={{ ["--tc" as string]: "var(--sunk)", ["--tf" as string]: "var(--ink)" }} title={me.name}>{t("r_" + me.role)}</span>}
            <button className="btn sm ghost" type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}>{lang === "th" ? "EN" : "ไทย"}</button>
            {me && <button className="btn sm ghost" type="button" onClick={signOut}>{t("signOut")}</button>}
          </div>
        </div>
        <nav className="tabs pad" role="tablist">{[...(me?.role === "admin" ? [["/cockpit", "cockpit"]] : []), ["/jobs", "jobs"], ["/store", "store"], ["/catalog", "catalog"], ["/customers", "customers"], ["/crew", "crew"], ["/repairs", "repair"],
          ...(me?.role === "admin" ? [["/team", "team"], ["/settings", "settings"]] : [])].map(([href, k]) =>
          <Link key={href} className="tab" role="tab" aria-selected={path.startsWith(href)} href={href}>{t(k)}</Link>)}</nav>
      </header>
      <main className="wrap pad" style={wide ? undefined : { maxWidth: 900 }}>
        {meState === "signed_out" ? <div className="empty"><p>{t("signedOut")}</p><Link className="btn primary" href="/dev-login">{t("signInAs")}</Link></div>
          : meState === "not_staff" ? <div className="banner bad">{t("notStaff")}</div>
          : meState === "error" ? <div className="banner bad">{t("error")}</div>
          : meState === "loading" ? <div className="empty"><p>{t("loading")}</p></div>
          : children}
      </main>
    </>
  );
}

export const stCls = (s: string) => "tape st-" + String(s || "").split(" ")[0];
export const money = (n: number) => (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtD = (s?: string | null) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
